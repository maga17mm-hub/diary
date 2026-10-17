/**
 * ============================================================================
 * Мысли Заремки - Main Application Controller
 * Handles tabs, themes, modals, cache reset, service worker, import/export
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize date subtitle in header
  updateHeaderDate();

  // Apply saved theme
  const savedTheme = localStorage.getItem('diary_theme') || 'midnight';
  applyAppTheme(savedTheme, false);

  // Initialize DB and modules
  await DiaryDB.openDB();
  await ThoughtsModule.initThoughtsModule();
  await TasksModule.initTasksModule();

  // Restore saved active tab
  const savedTab = localStorage.getItem('diary_active_tab') || 'thoughts';
  switchTab(savedTab);

  // Register Service Worker
  registerServiceWorker();

  // Setup modal backdrop listeners & keyboard
  setupModalDismiss();

  // If first visit and no data, offer demo data
  await checkFirstVisitSeed();

  // Show Dedication popup on app entry (Exact user request)
  setTimeout(() => {
    openDedicationModal();
  }, 250);
});

/**
 * Header Date display
 */
function updateHeaderDate() {
  const el = document.getElementById('headerDateText');
  if (!el) return;

  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  const str = now.toLocaleDateString('ru-RU', options);
  el.textContent = str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Tab Switching (Stable without bottom-nav jumping)
 */
function switchTab(tabName) {
  // 1. Defocus any active input to prevent iOS keyboard/viewport jumps
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }

  const thoughtsView = document.getElementById('tabThoughtsView');
  const tasksView = document.getElementById('tabTasksView');
  const settingsView = document.getElementById('tabSettingsView');

  const navThoughts = document.getElementById('navBtnThoughts');
  const navTasks = document.getElementById('navBtnTasks');
  const navSettings = document.getElementById('navBtnSettings');
  const headerAddBtn = document.getElementById('headerAddBtn');

  // Hide all
  if (thoughtsView) thoughtsView.style.display = 'none';
  if (tasksView) tasksView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';

  if (navThoughts) navThoughts.classList.remove('active');
  if (navTasks) navTasks.classList.remove('active');
  if (navSettings) navSettings.classList.remove('active');

  // Show active
  if (tabName === 'tasks') {
    if (tasksView) tasksView.style.display = 'block';
    if (navTasks) navTasks.classList.add('active');
    if (headerAddBtn) {
      headerAddBtn.style.display = 'inline-flex';
      headerAddBtn.onclick = () => TasksModule.openNewTaskModal();
      headerAddBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Задача</span>
      `;
    }
    TasksModule.loadAndRenderTasks();
  } else if (tabName === 'settings') {
    if (settingsView) settingsView.style.display = 'block';
    if (navSettings) navSettings.classList.add('active');
    if (headerAddBtn) headerAddBtn.style.display = 'none';
  } else {
    // Default: thoughts
    tabName = 'thoughts';
    if (thoughtsView) thoughtsView.style.display = 'block';
    if (navThoughts) navThoughts.classList.add('active');
    if (headerAddBtn) {
      headerAddBtn.style.display = 'inline-flex';
      headerAddBtn.onclick = () => ThoughtsModule.openNewThoughtComposer();
      headerAddBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Мысль</span>
      `;
    }
    ThoughtsModule.loadAndRenderThoughts();
  }

  localStorage.setItem('diary_active_tab', tabName);

  // Soft scroll to top without abrupt jarring if user was scrolled down
  if (window.scrollY > 40) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}
window.switchTab = switchTab;

/**
 * Dedication Modal Controller
 */
function openDedicationModal() {
  openModal('dedicationModal');
}
window.openDedicationModal = openDedicationModal;

function closeDedicationModal() {
  closeModal('dedicationModal');
}
window.closeDedicationModal = closeDedicationModal;

/**
 * Apply App Theme
 */
function applyAppTheme(themeName, showNotification = true) {
  document.documentElement.dataset.theme = themeName;
  localStorage.setItem('diary_theme', themeName);

  // Update theme card active checks in settings
  const cards = document.querySelectorAll('.theme-card');
  cards.forEach(card => {
    card.classList.toggle('active', card.dataset.themeName === themeName);
  });

  // Update meta theme-color for iOS safari address bar
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const bgMap = {
      midnight: '#040506',
      books: '#f7f5f0',
      cyberpunk: '#070913',
      emerald: '#040d09',
      nordic: '#0b1120',
      oled: '#000000',
      amber: '#0c0907'
    };
    metaTheme.content = bgMap[themeName] || '#040506';
  }

  if (showNotification) {
    showToast('Тема оформления обновлена');
  }
}

/**
 * Force App Cache Reset and Update (Exact user request)
 */
async function forceAppCacheReset() {
  if (confirm('Очистить кэш приложения и загрузить самую свежую версию? Все ваши записи и задачи останутся в сохранности.')) {
    try {
      // 1. Send CLEAR_CACHE to active Service Worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'CLEAR_CACHE' });
      }

      // 2. Clear CacheStorage
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }

      // 3. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      // 4. Force reload bypassing cache
      window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
    } catch (err) {
      console.error('Cache reset error:', err);
      window.location.reload(true);
    }
  }
}

/**
 * Modal Management
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.add('active');
  document.body.classList.add('modal-open');
  document.documentElement.classList.add('modal-open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove('active');
  const anyOpen = document.querySelectorAll('.modal-overlay.active').length > 0;
  if (!anyOpen) {
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  }
}

function setupModalDismiss() {
  // Click outside sheet to dismiss
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // ESC key dismiss
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(overlay => {
        closeModal(overlay.id);
      });
    }
  });
}

/**
 * Toast Notifications
 */
function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--brand); flex-shrink:0;">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Export and Import Data
 */
async function exportDataJson() {
  try {
    const data = await DiaryDB.exportAllData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `zaremka_diary_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Резервная копия скачана 💾');
  } catch (err) {
    console.error('Export failed:', err);
    showToast('Ошибка экспорта данных');
  }
}

async function handleImportDataFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      await DiaryDB.importAllData(parsed);
      await ThoughtsModule.loadAndRenderThoughts();
      await TasksModule.loadAndRenderTasks();
      showToast('Данные успешно импортированы! 🎉');
    } catch (err) {
      console.error('Import parse error:', err);
      alert('Ошибка при чтении файла резервной копии: неверный JSON');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

/**
 * Seed Sample Demo Data
 */
async function loadSampleDemoData() {
  if (!confirm('Загрузить примеры мыслей и задач для ознакомления?')) return;

  const sampleThoughts = [
    {
      id: 'demo_th_1',
      title: 'О пользе ясного фокуса',
      content: 'Когда в голове слишком много открытых вкладок, лучший способ вернуть спокойствие — выписать всё на бумагу или в цифровой дневник.\n\n> "Простота — это необходимое условие утонченности."\n\n- [x] Освободить утро от лишних новостей\n- [ ] Начать фиксировать инсайты сразу после прочтения книг',
      tag: 'Инсайты',
      mood: '⚡',
      pinned: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_th_2',
      title: 'Уютный вечер и новые планы',
      content: 'Заварить вкусный чай, включить спокойную музыку и распланировать неделю без спешки.\n\nГлавные ориентиры:\n* **Забота о себе** — сон и прогулки\n* **Вдохновение** — чтение и творчество\n* **Шаг за шагом** — к большим целям',
      tag: 'Идеи',
      mood: '✨',
      pinned: true,
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      id: 'demo_th_3',
      title: 'Маленькие радости каждого дня',
      content: 'Каждый день несёт что-то прекрасное, если вовремя остановиться и заметить это.',
      tag: 'Рефлексия',
      mood: '🧘',
      pinned: false,
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
    }
  ];

  const todayStr = new Date().toISOString().slice(0, 10);

  const sampleTasks = [
    {
      id: 'demo_tk_1',
      title: 'Выпить утренний кофе в тишине и улыбнуться новому дню',
      notes: 'Настроиться на прекрасный день',
      priority: 'p1',
      dueDate: todayStr,
      horizon: 'today',
      completed: true,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_tk_2',
      title: '30 минут приятного чтения',
      notes: 'Выписать понравившуюся цитату во вкладку «Мысли»',
      priority: 'p2',
      dueDate: todayStr,
      horizon: 'today',
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_tk_3',
      title: 'Прогулка на свежем воздухе',
      notes: 'Слушать любимую музыку или звуки природы',
      priority: 'p3',
      dueDate: todayStr,
      horizon: 'today',
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_tk_4',
      title: 'Составить список желаний и планов на следующую неделю',
      notes: 'Мечтать смело и без ограничений',
      priority: 'p2',
      dueDate: null,
      horizon: 'week',
      completed: false,
      createdAt: new Date().toISOString()
    }
  ];

  for (const t of sampleThoughts) await DiaryDB.saveThought(t, true);
  for (const k of sampleTasks) await DiaryDB.saveTask(k, true);

  await ThoughtsModule.loadAndRenderThoughts();
  await TasksModule.loadAndRenderTasks();
  showToast('Примеры успешно загружены ✨');
}

async function checkFirstVisitSeed() {
  const thoughts = await DiaryDB.getAllThoughts();
  const tasks = await DiaryDB.getAllTasks();
  if (thoughts.length === 0 && tasks.length === 0) {
    await loadSampleDemoData();
  }
}

/**
 * Service Worker Registration
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Доступно обновление приложения ✨');
            }
          });
        }
      });
    }).catch((err) => {
      console.warn('Service Worker registration skipped:', err);
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
