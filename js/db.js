/**
 * ============================================================================
 * Мысли Заремки - IndexedDB Database Engine & Cloud Sync Interface
 * High-performance, offline-first local storage for iOS Safari & Web
 * ============================================================================
 */

const DB_NAME = 'zaremka_diary_db';
const DB_VERSION = 1;

let dbInstance = null;

// Deleted tombstones to sync deletions across devices
const STORAGE_KEY_DEL_THOUGHTS = 'mz_deleted_thoughts';
const STORAGE_KEY_DEL_TASKS = 'mz_deleted_tasks';

function getDeletedThoughtIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_DEL_THOUGHTS) || '[]');
  } catch { return []; }
}

function trackDeletedThoughtId(id) {
  if (!id) return;
  const list = getDeletedThoughtIds();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(STORAGE_KEY_DEL_THOUGHTS, JSON.stringify(list.slice(-500)));
  }
}

function getDeletedTaskIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_DEL_TASKS) || '[]');
  } catch { return []; }
}

function trackDeletedTaskId(id) {
  if (!id) return;
  const list = getDeletedTaskIds();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(STORAGE_KEY_DEL_TASKS, JSON.stringify(list.slice(-500)));
  }
}

/**
 * Open or initialize IndexedDB
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    if (!('indexedDB' in window)) {
      console.warn('IndexedDB is not supported in this browser, falling back to localStorage');
      return resolve(null);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Thoughts / Notes store
      if (!db.objectStoreNames.contains('thoughts')) {
        const thoughtsStore = db.createObjectStore('thoughts', { keyPath: 'id' });
        thoughtsStore.createIndex('createdAt', 'createdAt', { unique: false });
        thoughtsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        thoughtsStore.createIndex('tag', 'tag', { unique: false });
        thoughtsStore.createIndex('pinned', 'pinned', { unique: false });
      }

      // Tasks store
      if (!db.objectStoreNames.contains('tasks')) {
        const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
        tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
        tasksStore.createIndex('dueDate', 'dueDate', { unique: false });
        tasksStore.createIndex('completed', 'completed', { unique: false });
        tasksStore.createIndex('priority', 'priority', { unique: false });
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error('IndexedDB open failed:', e);
      resolve(null);
    };
  });
}

/* ==========================================================================
   THOUGHTS CRUD
   ========================================================================== */
async function getAllThoughts() {
  const db = await openDB();
  if (!db) {
    try {
      return JSON.parse(localStorage.getItem('mz_thoughts') || '[]');
    } catch (_) { return []; }
  }

  return new Promise((resolve) => {
    const tx = db.transaction('thoughts', 'readonly');
    const store = tx.objectStore('thoughts');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function saveThought(thought, skipSyncTrigger = false) {
  if (!thought.id) {
    thought.id = 'th_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }
  thought.updatedAt = new Date().toISOString();
  if (!thought.createdAt) {
    thought.createdAt = thought.updatedAt;
  }

  const db = await openDB();
  if (!db) {
    const items = await getAllThoughts();
    const idx = items.findIndex(t => t.id === thought.id);
    if (idx >= 0) items[idx] = thought;
    else items.unshift(thought);
    localStorage.setItem('mz_thoughts', JSON.stringify(items));
    if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
    return thought;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('thoughts', 'readwrite');
    const store = tx.objectStore('thoughts');
    const req = store.put(thought);
    req.onsuccess = () => {
      if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
      resolve(thought);
    };
    req.onerror = (e) => reject(e);
  });
}

async function deleteThought(id, skipSyncTrigger = false) {
  trackDeletedThoughtId(id);
  const db = await openDB();
  if (!db) {
    const items = (await getAllThoughts()).filter(t => t.id !== id);
    localStorage.setItem('mz_thoughts', JSON.stringify(items));
    if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('thoughts', 'readwrite');
    const store = tx.objectStore('thoughts');
    const req = store.delete(id);
    req.onsuccess = () => {
      if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
      resolve(true);
    };
    req.onerror = (e) => reject(e);
  });
}

/* ==========================================================================
   TASKS CRUD
   ========================================================================== */
async function getAllTasks() {
  const db = await openDB();
  if (!db) {
    try {
      return JSON.parse(localStorage.getItem('mz_tasks') || '[]');
    } catch (_) { return []; }
  }

  return new Promise((resolve) => {
    const tx = db.transaction('tasks', 'readonly');
    const store = tx.objectStore('tasks');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function saveTask(task, skipSyncTrigger = false) {
  if (!task.id) {
    task.id = 'tk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }
  task.updatedAt = new Date().toISOString();
  if (!task.createdAt) {
    task.createdAt = task.updatedAt;
  }

  const db = await openDB();
  if (!db) {
    const items = await getAllTasks();
    const idx = items.findIndex(t => t.id === task.id);
    if (idx >= 0) items[idx] = task;
    else items.unshift(task);
    localStorage.setItem('mz_tasks', JSON.stringify(items));
    if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
    return task;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const req = store.put(task);
    req.onsuccess = () => {
      if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
      resolve(task);
    };
    req.onerror = (e) => reject(e);
  });
}

async function deleteTask(id, skipSyncTrigger = false) {
  trackDeletedTaskId(id);
  const db = await openDB();
  if (!db) {
    const items = (await getAllTasks()).filter(t => t.id !== id);
    localStorage.setItem('mz_tasks', JSON.stringify(items));
    if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const req = store.delete(id);
    req.onsuccess = () => {
      if (!skipSyncTrigger && window.triggerBackgroundSync) window.triggerBackgroundSync();
      resolve(true);
    };
    req.onerror = (e) => reject(e);
  });
}

/* ==========================================================================
   CLOUD TWO-WAY MERGE LOGIC (Phone <-> PC)
   ========================================================================== */
async function mergeCloudThoughts(remoteThoughts, remoteDeletedIds = []) {
  if (!Array.isArray(remoteThoughts)) return 0;
  const localDeleted = getDeletedThoughtIds();
  const allDeleted = new Set([...localDeleted, ...remoteDeletedIds]);

  const localThoughts = await getAllThoughts();
  const localMap = new Map();
  localThoughts.forEach(t => localMap.set(t.id, t));

  let changesCount = 0;

  // Process remote items
  for (const remote of remoteThoughts) {
    if (!remote || !remote.id) continue;
    if (allDeleted.has(remote.id)) {
      if (localMap.has(remote.id)) {
        await deleteThought(remote.id, true);
        changesCount++;
      }
      continue;
    }

    const local = localMap.get(remote.id);
    if (!local) {
      await saveThought(remote, true);
      changesCount++;
    } else {
      const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
      const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
      if (remoteTime > localTime) {
        await saveThought(remote, true);
        changesCount++;
      }
    }
  }

  return changesCount;
}

async function mergeCloudTasks(remoteTasks, remoteDeletedIds = []) {
  if (!Array.isArray(remoteTasks)) return 0;
  const localDeleted = getDeletedTaskIds();
  const allDeleted = new Set([...localDeleted, ...remoteDeletedIds]);

  const localTasks = await getAllTasks();
  const localMap = new Map();
  localTasks.forEach(t => localMap.set(t.id, t));

  let changesCount = 0;

  for (const remote of remoteTasks) {
    if (!remote || !remote.id) continue;
    if (allDeleted.has(remote.id)) {
      if (localMap.has(remote.id)) {
        await deleteTask(remote.id, true);
        changesCount++;
      }
      continue;
    }

    const local = localMap.get(remote.id);
    if (!local) {
      await saveTask(remote, true);
      changesCount++;
    } else {
      const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
      const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
      if (remoteTime > localTime) {
        await saveTask(remote, true);
        changesCount++;
      }
    }
  }

  return changesCount;
}

/* ==========================================================================
   BACKUP, EXPORT & IMPORT
   ========================================================================== */
async function exportAllData() {
  const thoughts = await getAllThoughts();
  const tasks = await getAllTasks();
  return {
    version: 1,
    appName: 'Мысли Заремки',
    exportDate: new Date().toISOString(),
    thoughts,
    tasks
  };
}

async function importAllData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Некорректный формат данных для импорта');
  }

  if (Array.isArray(data.thoughts)) {
    for (const t of data.thoughts) {
      await saveThought(t, true);
    }
  }

  if (Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      await saveTask(task, true);
    }
  }

  if (window.triggerBackgroundSync) {
    window.triggerBackgroundSync();
  }
  return true;
}

// Global exposure
window.DiaryDB = {
  openDB,
  getAllThoughts,
  saveThought,
  deleteThought,
  getAllTasks,
  saveTask,
  deleteTask,
  getDeletedThoughtIds,
  getDeletedTaskIds,
  mergeCloudThoughts,
  mergeCloudTasks,
  exportAllData,
  importAllData
};
