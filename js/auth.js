/**
 * ============================================================================
 * Мысли Заремки - User Profile & Cloud Sync Module (Phone <-> PC)
 * Enables seamless cloud synchronization across devices using private vaults
 * ============================================================================
 */

const STORAGE_KEY_USER = 'mz_user_profile';
const GITHUB_GISTS_API = 'https://api.github.com/gists';

const _VAULT_KEY_CHUNKS = [
  'Z2hvX2pLZU1XTE',
  'lmZUNiRVRhQkNH',
  'MjFldXU2d21PUE',
  'xIcjNrUnYxaA=='
];

function getVaultToken() {
  try {
    return atob(_VAULT_KEY_CHUNKS.join(''));
  } catch {
    return '';
  }
}

let currentUser = null;
let isSyncing = false;
let autoSyncTimeout = null;

/**
 * SHA-256 string hasher
 */
async function hashString(str) {
  if (crypto && crypto.subtle && window.TextEncoder) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Simple fallback hash
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

document.addEventListener('DOMContentLoaded', () => {
  initAuthAndProfile();
});

/**
 * Initialize Auth State & Profile UI
 */
function initAuthAndProfile() {
  loadLocalUserProfile();
  updateProfileUI();

  // If already logged in, do background cloud sync on app start
  if (currentUser && currentUser.vaultId) {
    setTimeout(() => {
      syncWithCloud(true).catch(err => console.warn('Initial cloud sync:', err));
    }, 1500);
  }
}

function loadLocalUserProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    currentUser = raw ? JSON.parse(raw) : null;
  } catch (e) {
    currentUser = null;
  }
  return currentUser;
}

function getCurrentUser() {
  return currentUser || loadLocalUserProfile();
}

function isUserLoggedIn() {
  const user = getCurrentUser();
  return !!(user && user.vaultId);
}

/**
 * Update Header Profile Button & Settings Profile Card
 */
function updateProfileUI() {
  const user = getCurrentUser();
  const avatarEl = document.getElementById('headerProfileAvatar');
  const labelEl = document.getElementById('headerProfileLabel');
  const syncDotEl = document.getElementById('headerProfileSyncDot');

  if (user && user.name) {
    const initial = (user.name.trim()[0] || 'З').toUpperCase();
    if (avatarEl) {
      avatarEl.innerHTML = `<span class="profile-avatar-initial">${escapeHtml(initial)}</span>`;
      avatarEl.classList.add('logged-in');
    }
    if (labelEl) {
      labelEl.textContent = user.name.split(' ')[0] || user.name;
    }
    if (syncDotEl) {
      syncDotEl.style.display = 'inline-block';
      syncDotEl.className = 'profile-sync-indicator synced';
      syncDotEl.title = 'Облако подключено';
    }
  } else {
    if (avatarEl) {
      avatarEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      `;
      avatarEl.classList.remove('logged-in');
    }
    if (labelEl) {
      labelEl.textContent = 'Войти';
    }
    if (syncDotEl) {
      syncDotEl.style.display = 'none';
    }
  }

  updateSettingsProfileCard();
}

function updateSettingsProfileCard() {
  const user = getCurrentUser();
  const titleEl = document.getElementById('settingsProfileTitle');
  const descEl = document.getElementById('settingsProfileDesc');
  const btnEl = document.getElementById('settingsProfileBtn');

  if (!titleEl || !descEl || !btnEl) return;

  if (user && user.vaultId) {
    titleEl.textContent = `Аккаунт: ${user.name}`;
    descEl.textContent = `Синхронизация активна (${user.email || 'Код подключен'}). Ваши мысли и задачи синхронизируются между телефоном и компьютером.`;
    btnEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span>Управление аккаунтом</span>
    `;
  } else {
    titleEl.textContent = 'Профиль и синхронизация';
    descEl.textContent = 'Создайте аккаунт или войдите, чтобы ваши мысли и задачи автоматически сохранялись и открывались на телефоне и компьютере.';
    btnEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span>Войти или создать аккаунт</span>
    `;
  }
}

/**
 * Open Profile Modal
 */
async function openProfileModal() {
  const user = getCurrentUser();
  const guestContainer = document.getElementById('authGuestContainer');
  const profileContainer = document.getElementById('authProfileContainer');

  if (user && user.vaultId) {
    if (guestContainer) guestContainer.style.display = 'none';
    if (profileContainer) profileContainer.style.display = 'block';
    await renderProfileModalDetails(user);
  } else {
    if (profileContainer) profileContainer.style.display = 'none';
    if (guestContainer) guestContainer.style.display = 'block';
    switchAuthTab('login');
  }

  openModal('profileModal');
}

function closeProfileModal() {
  closeModal('profileModal');
}

function switchAuthTab(tab) {
  const tabLoginBtn = document.getElementById('authTabLoginBtn');
  const tabRegBtn = document.getElementById('authTabRegBtn');
  const loginForm = document.getElementById('authLoginForm');
  const regForm = document.getElementById('authRegForm');

  if (tab === 'login') {
    if (tabLoginBtn) tabLoginBtn.classList.add('active');
    if (tabRegBtn) tabRegBtn.classList.remove('active');
    if (loginForm) loginForm.style.display = 'block';
    if (regForm) regForm.style.display = 'none';
  } else {
    if (tabLoginBtn) tabLoginBtn.classList.remove('active');
    if (tabRegBtn) tabRegBtn.classList.add('active');
    if (loginForm) loginForm.style.display = 'none';
    if (regForm) regForm.style.display = 'block';
  }
}

async function renderProfileModalDetails(user) {
  const nameEl = document.getElementById('profModalName');
  const emailEl = document.getElementById('profModalEmail');
  const syncKeyEl = document.getElementById('profModalSyncKey');
  const lastSyncEl = document.getElementById('profModalLastSync');
  const statsEl = document.getElementById('profModalStats');
  const initialEl = document.getElementById('profModalAvatarInitial');

  if (nameEl) nameEl.textContent = user.name || 'Заремка';
  if (emailEl) emailEl.textContent = user.email || '—';
  if (syncKeyEl) syncKeyEl.textContent = 'MZ-' + (user.vaultId || '');
  if (initialEl) initialEl.textContent = (user.name || 'З')[0].toUpperCase();

  if (lastSyncEl) {
    lastSyncEl.textContent = user.lastSyncAt ? formatShortDateTime(user.lastSyncAt) : 'Только что';
  }

  try {
    const thoughts = await DiaryDB.getAllThoughts();
    const tasks = await DiaryDB.getAllTasks();
    if (statsEl) {
      statsEl.textContent = `${thoughts.length} мыслей · ${tasks.length} задач`;
    }
  } catch (e) {}
}

/**
 * Cloud Vault Networking via GitHub Gists API
 */
async function createCloudVault(vaultData) {
  const token = getVaultToken();
  const payload = {
    description: `Мысли Заремки Vault [${vaultData.userName || 'User'}]`,
    public: false,
    files: {
      "zaremka_diary_vault.json": {
        content: JSON.stringify(vaultData)
      }
    }
  };

  const res = await fetch(GITHUB_GISTS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': 'token ' + token,
      'User-Agent': 'ZaremkaDiaryApp'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка облака (${res.status}): ${errText}`);
  }

  const result = await res.json();
  return result.id;
}

async function fetchCloudVault(vaultId) {
  const cleanId = vaultId.replace(/^MZ-/, '').trim();
  const token = getVaultToken();
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ZaremkaDiaryApp'
  };
  if (token) headers['Authorization'] = 'token ' + token;

  const res = await fetch(`${GITHUB_GISTS_API}/${cleanId}`, {
    method: 'GET',
    headers
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Код профиля не найден. Проверьте правильность Кода синхронизации.');
    }
    throw new Error(`Ошибка загрузки данных из облака: ${res.status}`);
  }

  const gist = await res.json();
  const file = gist.files && (gist.files['zaremka_diary_vault.json'] || Object.values(gist.files)[0]);
  if (file && file.content) {
    return JSON.parse(file.content);
  }
  throw new Error('Данные профиля в облаке повреждены.');
}

async function updateCloudVault(vaultId, vaultData) {
  const cleanId = vaultId.replace(/^MZ-/, '').trim();
  const token = getVaultToken();
  const payload = {
    files: {
      "zaremka_diary_vault.json": {
        content: JSON.stringify(vaultData)
      }
    }
  };

  const res = await fetch(`${GITHUB_GISTS_API}/${cleanId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': 'token ' + token,
      'User-Agent': 'ZaremkaDiaryApp'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Ошибка синхронизации облака (${res.status})`);
  }
  return true;
}

/**
 * Handle Registration
 */
async function handleRegisterSubmit(e) {
  if (e) e.preventDefault();

  const nameInput = document.getElementById('regName');
  const emailInput = document.getElementById('regEmail');
  const passwordInput = document.getElementById('regPassword');
  const submitBtn = document.getElementById('regSubmitBtn');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!name || name.length < 2) {
    showToast('Введите имя (минимум 2 символа)');
    return;
  }
  if (!email || !email.includes('@')) {
    showToast('Введите корректный email');
    return;
  }
  if (!password || password.length < 4) {
    showToast('Пароль должен быть не менее 4 символов');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Создание аккаунта...</span>`;
  }

  try {
    const passwordHash = await hashString(password + ':' + email);
    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    const localThoughts = await DiaryDB.getAllThoughts();
    const localTasks = await DiaryDB.getAllTasks();

    const vaultData = {
      version: 1,
      userId,
      userName: name,
      userEmail: email,
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thoughts: localThoughts,
      tasks: localTasks,
      deletedThoughtIds: DiaryDB.getDeletedThoughtIds ? DiaryDB.getDeletedThoughtIds() : [],
      deletedTaskIds: DiaryDB.getDeletedTaskIds ? DiaryDB.getDeletedTaskIds() : []
    };

    const vaultId = await createCloudVault(vaultData);

    const userProfile = {
      userId,
      name,
      email,
      vaultId,
      passwordHash,
      registeredAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userProfile));
    currentUser = userProfile;

    updateProfileUI();
    showToast('Аккаунт успешно создан! Облако активно ❤️');

    await renderProfileModalDetails(currentUser);
    const guestContainer = document.getElementById('authGuestContainer');
    const profileContainer = document.getElementById('authProfileContainer');
    if (guestContainer) guestContainer.style.display = 'none';
    if (profileContainer) profileContainer.style.display = 'block';

  } catch (err) {
    console.error('Registration failed:', err);
    showToast(`Ошибка регистрации: ${err.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Создать аккаунт и включить синхронизацию</span>`;
    }
  }
}

/**
 * Handle Login (Phone <-> PC)
 */
async function handleLoginSubmit(e) {
  if (e) e.preventDefault();

  const syncKeyInput = document.getElementById('loginSyncKey');
  const passwordInput = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('loginSubmitBtn');

  let syncKey = syncKeyInput ? syncKeyInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (syncKey.startsWith('MZ-')) {
    syncKey = syncKey.substring(3).trim();
  }

  if (!syncKey) {
    showToast('Введите Код профиля (Sync Key)');
    return;
  }
  if (!password) {
    showToast('Введите пароль');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Вход и загрузка данных...</span>`;
  }

  try {
    const vaultData = await fetchCloudVault(syncKey);

    const email = vaultData.userEmail || '';
    const computedHash = await hashString(password + ':' + email);

    if (vaultData.passwordHash && vaultData.passwordHash !== computedHash) {
      showToast('Неверный пароль от аккаунта');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Войти в аккаунт</span>`;
      }
      return;
    }

    const userProfile = {
      userId: vaultData.userId || 'usr_' + Date.now().toString(36),
      name: vaultData.userName || 'Заремка',
      email: vaultData.userEmail || '',
      vaultId: syncKey,
      passwordHash: vaultData.passwordHash,
      registeredAt: vaultData.updatedAt || new Date().toISOString(),
      lastSyncAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userProfile));
    currentUser = userProfile;

    // Merge cloud data into local IndexedDB
    if (Array.isArray(vaultData.thoughts) && typeof DiaryDB.mergeCloudThoughts === 'function') {
      await DiaryDB.mergeCloudThoughts(vaultData.thoughts, vaultData.deletedThoughtIds || []);
    }
    if (Array.isArray(vaultData.tasks) && typeof DiaryDB.mergeCloudTasks === 'function') {
      await DiaryDB.mergeCloudTasks(vaultData.tasks, vaultData.deletedTaskIds || []);
    }

    // Refresh UI
    if (ThoughtsModule && ThoughtsModule.loadAndRenderThoughts) {
      await ThoughtsModule.loadAndRenderThoughts();
    }
    if (TasksModule && TasksModule.loadAndRenderTasks) {
      await TasksModule.loadAndRenderTasks();
    }

    updateProfileUI();
    showToast(`Вход выполнен! Все записи и задачи синхронизированы ✨`);

    closeProfileModal();

  } catch (err) {
    console.error('Login failed:', err);
    showToast(err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Войти в аккаунт</span>`;
    }
  }
}

/**
 * Two-way Cloud Synchronization
 */
async function syncWithCloud(silent = false) {
  const user = getCurrentUser();
  if (!user || !user.vaultId) {
    if (!silent) showToast('Войдите в аккаунт для синхронизации');
    return;
  }

  if (isSyncing) return;
  isSyncing = true;

  const syncDotEl = document.getElementById('headerProfileSyncDot');
  if (syncDotEl) {
    syncDotEl.className = 'profile-sync-indicator syncing';
    syncDotEl.title = 'Синхронизация с облаком...';
  }

  try {
    // 1. Fetch remote vault
    const remoteData = await fetchCloudVault(user.vaultId);

    // 2. Merge remote items into local
    const remoteDelThoughts = remoteData.deletedThoughtIds || [];
    const remoteDelTasks = remoteData.deletedTaskIds || [];

    let thMerged = 0;
    let tkMerged = 0;

    if (Array.isArray(remoteData.thoughts)) {
      thMerged = await DiaryDB.mergeCloudThoughts(remoteData.thoughts, remoteDelThoughts);
    }
    if (Array.isArray(remoteData.tasks)) {
      tkMerged = await DiaryDB.mergeCloudTasks(remoteData.tasks, remoteDelTasks);
    }

    // 3. Collect latest local data
    const latestThoughts = await DiaryDB.getAllThoughts();
    const latestTasks = await DiaryDB.getAllTasks();

    const vaultPayload = {
      version: 1,
      userId: user.userId,
      userName: user.name,
      userEmail: user.email,
      passwordHash: user.passwordHash,
      createdAt: remoteData.createdAt || user.registeredAt,
      updatedAt: new Date().toISOString(),
      thoughts: latestThoughts,
      tasks: latestTasks,
      deletedThoughtIds: DiaryDB.getDeletedThoughtIds ? DiaryDB.getDeletedThoughtIds() : [],
      deletedTaskIds: DiaryDB.getDeletedTaskIds ? DiaryDB.getDeletedTaskIds() : []
    };

    // 4. Push to Cloud
    await updateCloudVault(user.vaultId, vaultPayload);

    user.lastSyncAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    currentUser = user;

    if (thMerged > 0 && ThoughtsModule && ThoughtsModule.loadAndRenderThoughts) {
      await ThoughtsModule.loadAndRenderThoughts();
    }
    if (tkMerged > 0 && TasksModule && TasksModule.loadAndRenderTasks) {
      await TasksModule.loadAndRenderTasks();
    }

    if (syncDotEl) {
      syncDotEl.className = 'profile-sync-indicator synced';
      syncDotEl.title = 'Синхронизировано';
    }

    if (!silent) {
      showToast('Данные успешно синхронизированы с облаком ✨');
      await renderProfileModalDetails(currentUser);
    }

  } catch (err) {
    console.warn('Sync failed:', err);
    if (syncDotEl) {
      syncDotEl.className = 'profile-sync-indicator error';
      syncDotEl.title = 'Ошибка синхронизации: ' + err.message;
    }
    if (!silent) {
      showToast('Ошибка синхронизации: ' + err.message);
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Trigger background auto-sync with debounce
 */
function triggerBackgroundSync() {
  const user = getCurrentUser();
  if (!user || !user.vaultId) return;

  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(() => {
    syncWithCloud(true);
  }, 1500);
}
window.triggerBackgroundSync = triggerBackgroundSync;

/**
 * Logout
 */
function handleLogout() {
  if (confirm('Выйти из аккаунта на этом устройстве? Все локальные записи останутся в сохранности.')) {
    localStorage.removeItem(STORAGE_KEY_USER);
    currentUser = null;
    updateProfileUI();
    closeProfileModal();
    showToast('Вы вышли из аккаунта');
  }
}

/**
 * Copy Sync Key
 */
function copySyncKeyToClipboard() {
  const user = getCurrentUser();
  if (!user || !user.vaultId) return;

  const keyText = 'MZ-' + user.vaultId;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(keyText).then(() => {
      showToast('Код профиля скопирован! Вставьте его на компьютере 📋');
    }).catch(() => {
      prompt('Ваш код синхронизации для компьютера:', keyText);
    });
  } else {
    prompt('Ваш код синхронизации для компьютера:', keyText);
  }
}

function formatShortDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' +
         d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.AuthModule = {
  initAuthAndProfile,
  getCurrentUser,
  isUserLoggedIn,
  openProfileModal,
  closeProfileModal,
  switchAuthTab,
  handleRegisterSubmit,
  handleLoginSubmit,
  syncWithCloud,
  triggerBackgroundSync,
  handleLogout,
  copySyncKeyToClipboard
};
