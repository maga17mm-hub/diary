/**
 * ============================================================================
 * Diary & Planner - IndexedDB Database Engine
 * High-performance, offline-first local storage for iOS Safari & Web
 * ============================================================================
 */

const DB_NAME = 'diary_mindflow_db';
const DB_VERSION = 1;

let dbInstance = null;

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
      return JSON.parse(localStorage.getItem('diary_thoughts') || '[]');
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

async function saveThought(thought) {
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
    localStorage.setItem('diary_thoughts', JSON.stringify(items));
    return thought;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('thoughts', 'readwrite');
    const store = tx.objectStore('thoughts');
    const req = store.put(thought);
    req.onsuccess = () => resolve(thought);
    req.onerror = (e) => reject(e);
  });
}

async function deleteThought(id) {
  const db = await openDB();
  if (!db) {
    const items = (await getAllThoughts()).filter(t => t.id !== id);
    localStorage.setItem('diary_thoughts', JSON.stringify(items));
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('thoughts', 'readwrite');
    const store = tx.objectStore('thoughts');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
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
      return JSON.parse(localStorage.getItem('diary_tasks') || '[]');
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

async function saveTask(task) {
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
    localStorage.setItem('diary_tasks', JSON.stringify(items));
    return task;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const req = store.put(task);
    req.onsuccess = () => resolve(task);
    req.onerror = (e) => reject(e);
  });
}

async function deleteTask(id) {
  const db = await openDB();
  if (!db) {
    const items = (await getAllTasks()).filter(t => t.id !== id);
    localStorage.setItem('diary_tasks', JSON.stringify(items));
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e);
  });
}

/* ==========================================================================
   BACKUP, EXPORT & IMPORT
   ========================================================================== */
async function exportAllData() {
  const thoughts = await getAllThoughts();
  const tasks = await getAllTasks();
  return {
    version: 1,
    appName: 'Diary',
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
      await saveThought(t);
    }
  }

  if (Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      await saveTask(task);
    }
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
  exportAllData,
  importAllData
};
