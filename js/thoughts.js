/**
 * ============================================================================
 * Diary & Planner - Thoughts & Reflections Module (Google Keep / Obsidian style)
 * Personal stream of consciousness, tagged ideas, pin to top, markdown notes
 * ============================================================================
 */

let allThoughts = [];
let currentActiveTag = 'all';
let currentSearchQuery = '';
let currentSortOrder = 'newest';
let currentEditingThoughtId = null;

const DEFAULT_TAGS = ['Все', 'Идеи', 'Рефлексия', 'Инсайты', 'Личное', 'Планы', 'Книги'];
const MOOD_EMOJIS = ['💡', '💭', '⚡', '🧘', '🔥', '🎯', '✨', '☕'];

/**
 * Initialize Thoughts Feed
 */
async function initThoughtsModule() {
  await loadAndRenderThoughts();

  // Search input binding
  const searchInput = document.getElementById('thoughtsSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      renderThoughtsGrid();
    });
  }
}

/**
 * Load thoughts from DB and render
 */
async function loadAndRenderThoughts() {
  try {
    allThoughts = await DiaryDB.getAllThoughts();
  } catch (err) {
    console.error('Failed to load thoughts:', err);
    allThoughts = [];
  }
  renderTagsScroll();
  renderThoughtsGrid();
}

/**
 * Render Tag Filter Chips
 */
function renderTagsScroll() {
  const container = document.getElementById('thoughtsTagsScroll');
  if (!container) return;

  // Collect user tags + default tags
  const tagSet = new Set(DEFAULT_TAGS);
  allThoughts.forEach(t => {
    if (t.tag && t.tag.trim()) tagSet.add(t.tag.trim());
  });

  const tags = Array.from(tagSet);

  container.innerHTML = tags.map(tag => {
    const isAll = tag === 'Все';
    const tagKey = isAll ? 'all' : tag;
    const isActive = currentActiveTag === tagKey;
    return `
      <button type="button" class="tag-chip ${isActive ? 'active' : ''}" onclick="selectThoughtTag('${tagKey}')">
        <span>${isAll ? '🌟 Все' : '#' + tag}</span>
      </button>
    `;
  }).join('');
}

function selectThoughtTag(tagKey) {
  currentActiveTag = tagKey;
  renderTagsScroll();
  renderThoughtsGrid();
}

/**
 * Render Thoughts List (with Pinned & Others)
 */
function renderThoughtsGrid() {
  const pinnedContainer = document.getElementById('pinnedThoughtsContainer');
  const feedContainer = document.getElementById('thoughtsFeedContainer');
  const pinnedSection = document.getElementById('pinnedSection');
  const emptyState = document.getElementById('thoughtsEmptyState');
  const countBadge = document.getElementById('thoughtsTotalCount');

  if (!feedContainer) return;

  // Filter
  let filtered = [...allThoughts];

  if (currentActiveTag && currentActiveTag !== 'all') {
    filtered = filtered.filter(t => (t.tag || '').toLowerCase() === currentActiveTag.toLowerCase());
  }

  if (currentSearchQuery && currentSearchQuery.trim()) {
    const q = currentSearchQuery.trim();
    filtered = filtered.filter(t => 
      (t.title || '').toLowerCase().includes(q) ||
      (t.content || '').toLowerCase().includes(q) ||
      (t.tag || '').toLowerCase().includes(q)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    if (currentSortOrder === 'newest') {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    } else if (currentSortOrder === 'oldest') {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    } else if (currentSortOrder === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    }
    return 0;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} ${getNoun(filtered.length, 'мысль', 'мысли', 'мыслей')}`;
  }

  if (filtered.length === 0) {
    if (pinnedSection) pinnedSection.style.display = 'none';
    feedContainer.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Separate pinned & regular
  const pinned = filtered.filter(t => t.pinned);
  const regular = filtered.filter(t => !t.pinned);

  // Render pinned
  if (pinned.length > 0 && pinnedSection && pinnedContainer) {
    pinnedSection.style.display = 'block';
    pinnedContainer.innerHTML = pinned.map(t => renderThoughtCardHtml(t)).join('');
  } else if (pinnedSection) {
    pinnedSection.style.display = 'none';
  }

  // Render regular feed
  feedContainer.innerHTML = regular.map(t => renderThoughtCardHtml(t)).join('');
}

/**
 * Render single card HTML
 */
function renderThoughtCardHtml(thought) {
  const formattedDate = formatTimestamp(thought.createdAt);
  const mood = thought.mood || '💭';
  const tag = thought.tag || 'Мысли';
  const cleanPreview = escapeHtml(thought.content || '').slice(0, 180);

  return `
    <div class="thought-card ${thought.pinned ? 'pinned' : ''}" onclick="openThoughtReader('${thought.id}')">
      <div class="thought-top-row">
        <div style="display: flex; align-items: baseline; gap: 6px;">
          <span style="font-size: 1.1rem;">${mood}</span>
          <h3 class="thought-title">${escapeHtml(thought.title || 'Без названия')}</h3>
        </div>
        ${thought.pinned ? `
          <div class="thought-pin-icon" title="Закреплено">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
            </svg>
          </div>
        ` : ''}
      </div>

      <div class="thought-preview">
        ${cleanPreview ? cleanPreview.replace(/\n/g, '<br>') : '<span style="color:var(--text-muted); font-style:italic;">Пустая запись</span>'}
      </div>

      <div class="thought-bottom-meta">
        <span class="thought-tag-badge">#${escapeHtml(tag)}</span>
        <span>${formattedDate}</span>
      </div>
    </div>
  `;
}

/* ==========================================================================
   THOUGHT COMPOSER MODAL (Create / Edit)
   ========================================================================== */
function openNewThoughtComposer() {
  currentEditingThoughtId = null;
  document.getElementById('thoughtModalTitle').textContent = 'Новая мысль';
  document.getElementById('thoughtTitleInput').value = '';
  document.getElementById('thoughtContentInput').value = '';
  document.getElementById('thoughtTagInput').value = currentActiveTag !== 'all' ? currentActiveTag : 'Идеи';
  document.getElementById('thoughtPinnedInput').checked = false;
  
  // Mood pills
  renderMoodPills('💡');

  const deleteBtn = document.getElementById('thoughtDeleteBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';

  openModal('thoughtComposeModal');
}

function openEditThoughtModal(id) {
  const thought = allThoughts.find(t => t.id === id);
  if (!thought) return;

  currentEditingThoughtId = id;
  document.getElementById('thoughtModalTitle').textContent = 'Редактировать мысль';
  document.getElementById('thoughtTitleInput').value = thought.title || '';
  document.getElementById('thoughtContentInput').value = thought.content || '';
  document.getElementById('thoughtTagInput').value = thought.tag || 'Идеи';
  document.getElementById('thoughtPinnedInput').checked = !!thought.pinned;

  renderMoodPills(thought.mood || '💡');

  const deleteBtn = document.getElementById('thoughtDeleteBtn');
  if (deleteBtn) deleteBtn.style.display = 'inline-flex';

  closeModal('thoughtReaderModal');
  openModal('thoughtComposeModal');
}

function renderMoodPills(selectedMood) {
  const container = document.getElementById('thoughtMoodPills');
  if (!container) return;

  container.innerHTML = MOOD_EMOJIS.map(emoji => `
    <button type="button" class="btn-icon ${emoji === selectedMood ? 'active' : ''}" 
      style="width:34px; height:34px; font-size:1.15rem; ${emoji === selectedMood ? 'border-color:var(--brand); background:rgba(255,99,99,0.15);' : ''}" 
      onclick="selectMoodEmoji('${emoji}')">
      ${emoji}
    </button>
  `).join('');
  container.dataset.selectedMood = selectedMood;
}

function selectMoodEmoji(emoji) {
  renderMoodPills(emoji);
}

async function handleSaveThought() {
  const title = document.getElementById('thoughtTitleInput').value.trim();
  const content = document.getElementById('thoughtContentInput').value.trim();
  const tag = document.getElementById('thoughtTagInput').value.trim() || 'Мысли';
  const pinned = document.getElementById('thoughtPinnedInput').checked;
  const moodContainer = document.getElementById('thoughtMoodPills');
  const mood = (moodContainer && moodContainer.dataset.selectedMood) || '💡';

  if (!title && !content) {
    showToast('Введите заголовок или текст мысли');
    return;
  }

  const thoughtData = {
    id: currentEditingThoughtId || undefined,
    title: title || content.slice(0, 32),
    content,
    tag,
    mood,
    pinned
  };

  try {
    await DiaryDB.saveThought(thoughtData);
    closeModal('thoughtComposeModal');
    await loadAndRenderThoughts();
    showToast(currentEditingThoughtId ? 'Мысль обновлена ✨' : 'Мысль сохранена в дневник 💡');
  } catch (err) {
    console.error('Save failed:', err);
    showToast('Ошибка при сохранении мысли');
  }
}

async function handleDeleteCurrentThought() {
  if (!currentEditingThoughtId) return;

  if (confirm('Удалить эту мысль безвозвратно?')) {
    try {
      await DiaryDB.deleteThought(currentEditingThoughtId);
      closeModal('thoughtComposeModal');
      closeModal('thoughtReaderModal');
      await loadAndRenderThoughts();
      showToast('Мысль удалена');
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }
}

/* ==========================================================================
   THOUGHT READER MODAL (Clean view)
   ========================================================================== */
function openThoughtReader(id) {
  const thought = allThoughts.find(t => t.id === id);
  if (!thought) return;

  currentEditingThoughtId = id;
  const titleEl = document.getElementById('readerTitle');
  const metaEl = document.getElementById('readerMeta');
  const bodyEl = document.getElementById('readerBody');
  const pinBtn = document.getElementById('readerPinToggleBtn');

  if (titleEl) titleEl.innerHTML = `${thought.mood || '💡'} ${escapeHtml(thought.title || 'Без названия')}`;
  if (metaEl) {
    metaEl.innerHTML = `
      <span class="thought-tag-badge">#${escapeHtml(thought.tag || 'Мысли')}</span>
      <span>${formatTimestamp(thought.createdAt)}</span>
      ${thought.pinned ? '<span style="color:var(--color-warning-amber);">★ Закреплено</span>' : ''}
    `;
  }
  if (bodyEl) {
    bodyEl.innerHTML = renderMarkdown(thought.content || '');
  }
  if (pinBtn) {
    pinBtn.innerHTML = thought.pinned ? 'Открепить' : 'Закрепить';
  }

  openModal('thoughtReaderModal');
}

async function togglePinFromReader() {
  if (!currentEditingThoughtId) return;
  const thought = allThoughts.find(t => t.id === currentEditingThoughtId);
  if (!thought) return;

  thought.pinned = !thought.pinned;
  await DiaryDB.saveThought(thought);
  await loadAndRenderThoughts();
  openThoughtReader(currentEditingThoughtId);
  showToast(thought.pinned ? 'Закреплено наверху 📌' : 'Откреплено');
}

/* ==========================================================================
   MARKDOWN QUICK INSERT IN COMPOSER
   ========================================================================== */
function insertMarkdown(prefix, suffix = '') {
  const textarea = document.getElementById('thoughtContentInput');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selected = val.substring(start, end);

  textarea.value = val.substring(0, start) + prefix + selected + suffix + val.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, end + prefix.length);
}

/* ==========================================================================
   HELPER UTILITIES
   ========================================================================== */
function renderMarkdown(text) {
  if (!text) return '<p style="color:var(--text-muted); font-style:italic;">Нет текста</p>';
  let html = escapeHtml(text);

  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Code `code`
  html = html.replace(/`(.*?)`/g, '<code style="background:var(--bg-input); padding:2px 6px; border-radius:4px; font-family:var(--font-mono); font-size:0.85em;">$1</code>');
  // Checklists - [ ] and - [x]
  html = html.replace(/^- \[ \] (.*)$/gm, '<div style="display:flex; align-items:center; gap:8px; margin:4px 0;"><span style="display:inline-block; width:16px; height:16px; border:2px solid var(--border-medium); border-radius:4px;"></span><span>$1</span></div>');
  html = html.replace(/^- \[x\] (.*)$/gmi, '<div style="display:flex; align-items:center; gap:8px; margin:4px 0; color:var(--text-muted); text-decoration:line-through;"><span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; background:var(--win); border-radius:4px; color:#fff; font-size:11px;">✓</span><span>$1</span></div>');
  // Lists
  html = html.replace(/^[•\-\*] (.*)$/gm, '<li style="margin-left:20px; list-style-type:disc;">$1</li>');
  // Quotes
  html = html.replace(/^&gt; (.*)$/gm, '<blockquote style="border-left:3px solid var(--brand); padding-left:12px; margin:8px 0; color:var(--text-secondary);">$1</blockquote>');
  // Headers #
  html = html.replace(/^# (.*)$/gm, '<h2 style="font-size:1.3rem; margin:16px 0 8px 0; font-weight:800;">$1</h2>');
  html = html.replace(/^## (.*)$/gm, '<h3 style="font-size:1.15rem; margin:14px 0 6px 0; font-weight:700;">$1</h3>');

  // Paragraphs & Line breaks
  return html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Сегодня, ${timeStr}`;
  if (isYesterday) return `Вчера, ${timeStr}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getNoun(number, one, two, five) {
  let n = Math.abs(number);
  n %= 100;
  if (n >= 5 && n <= 20) return five;
  n %= 10;
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return two;
  return five;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.ThoughtsModule = {
  initThoughtsModule,
  loadAndRenderThoughts,
  openNewThoughtComposer,
  openEditThoughtModal,
  openThoughtReader,
  handleSaveThought,
  handleDeleteCurrentThought,
  togglePinFromReader,
  insertMarkdown,
  selectThoughtTag,
  selectMoodEmoji
};
