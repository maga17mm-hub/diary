/**
 * ============================================================================
 * Diary & Planner - Tasks & Planner Module (Todoist style)
 * Today, Weekly horizon, priority levels (P1-P4), interactive checkboxes
 * ============================================================================
 */

let allTasks = [];
let currentTasksHorizon = 'today'; // 'today' | 'week' | 'all' | 'done'
let currentEditingTaskId = null;

/**
 * Initialize Tasks Module
 */
async function initTasksModule() {
  await loadAndRenderTasks();

  // Inline quick-add input keypress
  const quickInput = document.getElementById('taskQuickInput');
  if (quickInput) {
    quickInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const val = quickInput.value.trim();
        if (val) {
          await createQuickTask(val);
          quickInput.value = '';
        }
      }
    });
  }
}

/**
 * Load tasks from DB
 */
async function loadAndRenderTasks() {
  try {
    allTasks = await DiaryDB.getAllTasks();
  } catch (err) {
    console.error('Failed to load tasks:', err);
    allTasks = [];
  }

  updateTasksBadges();
  renderTasksList();
  renderDailyProgress();
}

/**
 * Switch Horizon (Сегодня, Неделя, Все, Выполненные)
 */
function setTaskHorizon(horizon) {
  currentTasksHorizon = horizon;

  // Update button active states
  const buttons = document.querySelectorAll('.tasks-horizon-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.horizon === horizon);
  });

  renderTasksList();
}

/**
 * Update uncompleted badge counts
 */
function updateTasksBadges() {
  const todayTasks = allTasks.filter(t => !t.completed && isTaskForToday(t));
  const weekTasks = allTasks.filter(t => !t.completed && isTaskForWeek(t));
  const allIncomplete = allTasks.filter(t => !t.completed);
  const doneTasks = allTasks.filter(t => t.completed);

  const badgeToday = document.getElementById('horizonBadgeToday');
  const badgeWeek = document.getElementById('horizonBadgeWeek');
  const badgeAll = document.getElementById('horizonBadgeAll');
  const badgeDone = document.getElementById('horizonBadgeDone');
  const navBadge = document.getElementById('navTasksBadge');

  if (badgeToday) badgeToday.textContent = todayTasks.length;
  if (badgeWeek) badgeWeek.textContent = weekTasks.length;
  if (badgeAll) badgeAll.textContent = allIncomplete.length;
  if (badgeDone) badgeDone.textContent = doneTasks.length;

  if (navBadge) {
    if (todayTasks.length > 0) {
      navBadge.textContent = todayTasks.length;
      navBadge.style.display = 'block';
    } else {
      navBadge.style.display = 'none';
    }
  }
}

/**
 * Render Daily Progress Bar
 */
function renderDailyProgress() {
  const todayTotal = allTasks.filter(t => isTaskForToday(t));
  const todayDone = todayTotal.filter(t => t.completed);

  const titleEl = document.getElementById('todayProgressTitle');
  const countEl = document.getElementById('todayProgressCount');
  const fillEl = document.getElementById('todayProgressFill');

  const total = todayTotal.length;
  const done = todayDone.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  if (titleEl) {
    titleEl.textContent = total === 0 ? 'Задач на сегодня нет' : (done === total ? 'Все задачи на сегодня выполнены! 🎉' : 'Прогресс дня');
  }
  if (countEl) {
    countEl.textContent = `${done} из ${total} (${pct}%)`;
  }
  if (fillEl) {
    fillEl.style.width = `${pct}%`;
  }
}

/**
 * Filter tasks according to active horizon
 */
function getFilteredTasks() {
  const today = getTodayDateString();

  if (currentTasksHorizon === 'today') {
    return allTasks.filter(t => !t.completed && isTaskForToday(t));
  } else if (currentTasksHorizon === 'week') {
    return allTasks.filter(t => !t.completed && isTaskForWeek(t));
  } else if (currentTasksHorizon === 'all') {
    return allTasks.filter(t => !t.completed);
  } else if (currentTasksHorizon === 'done') {
    return allTasks.filter(t => t.completed);
  }
  return allTasks;
}

/**
 * Render tasks list items
 */
function renderTasksList() {
  const container = document.getElementById('tasksListContainer');
  const emptyState = document.getElementById('tasksEmptyState');

  if (!container) return;

  const filtered = getFilteredTasks();

  // Sort by priority (p1 -> p2 -> p3 -> p4) then by date
  filtered.sort((a, b) => {
    const pOrder = { p1: 1, p2: 2, p3: 3, p4: 4 };
    const pDiff = (pOrder[a.priority || 'p4'] || 4) - (pOrder[b.priority || 'p4'] || 4);
    if (pDiff !== 0) return pDiff;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'flex';
      const emptyTitle = document.getElementById('tasksEmptyTitle');
      const emptyDesc = document.getElementById('tasksEmptyDesc');
      if (emptyTitle) {
        emptyTitle.textContent = currentTasksHorizon === 'done' ? 'Нет завершённых задач' : 'Список задач чист';
      }
      if (emptyDesc) {
        emptyDesc.textContent = currentTasksHorizon === 'done' 
          ? 'Выполненные задачи будут сохраняться здесь' 
          : 'Добавьте задачу через поле выше или нажмите +';
      }
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = filtered.map(task => renderTaskItemHtml(task)).join('');
}

/**
 * Single Task HTML
 */
function renderTaskItemHtml(task) {
  const priority = task.priority || 'p4';
  const isDone = !!task.completed;
  const dueFormatted = formatDueBadge(task);

  return `
    <div class="task-item ${priority} ${isDone ? 'completed' : ''}" id="task_${task.id}">
      <div class="task-checkbox-wrap" onclick="toggleTaskCompletion('${task.id}')" title="${isDone ? 'Снять отметку' : 'Выполнить'}">
        <div class="task-checkbox">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>

      <div class="task-body" onclick="openEditTaskModal('${task.id}')">
        <div class="task-title">${escapeHtml(task.title || '')}</div>
        ${task.notes ? `<div class="task-note">${escapeHtml(task.notes)}</div>` : ''}
        
        <div class="task-meta-row">
          ${dueFormatted ? `<span class="task-due-chip ${dueFormatted.className}">${dueFormatted.text}</span>` : ''}
          ${task.priority && task.priority !== 'p4' ? `<span class="task-due-chip" style="color:var(--priority-${task.priority});">Приоритет ${task.priority.toUpperCase()}</span>` : ''}
          ${task.tag ? `<span class="task-due-chip">#${escapeHtml(task.tag)}</span>` : ''}
        </div>
      </div>

      <div class="task-actions">
        <button type="button" class="btn-icon" style="width:28px; height:28px;" onclick="openEditTaskModal('${task.id}')" title="Редактировать">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button type="button" class="btn-icon" style="width:28px; height:28px; color:var(--loss);" onclick="handleQuickDeleteTask('${task.id}')" title="Удалить">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Toggle Task Completion
 */
async function toggleTaskCompletion(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;

  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;

  // Haptic feedback for iOS
  if ('vibrate' in navigator) {
    try { navigator.vibrate(12); } catch (_) {}
  }

  await DiaryDB.saveTask(task);
  updateTasksBadges();
  renderTasksList();
  renderDailyProgress();

  if (task.completed) {
    showToast('Задача выполнена! ✓');
  }
}

/**
 * Quick inline task creation
 */
async function createQuickTask(title) {
  const newTask = {
    title,
    notes: '',
    priority: 'p4',
    horizon: currentTasksHorizon === 'week' ? 'week' : 'today',
    dueDate: currentTasksHorizon === 'today' ? getTodayDateString() : (currentTasksHorizon === 'week' ? getEndOfWeekDateString() : null),
    completed: false
  };

  await DiaryDB.saveTask(newTask);
  await loadAndRenderTasks();
  showToast('Задача добавлена 🎯');
}

/**
 * Quick delete
 */
async function handleQuickDeleteTask(id) {
  await DiaryDB.deleteTask(id);
  await loadAndRenderTasks();
  showToast('Задача удалена');
}

/* ==========================================================================
   TASK MODAL (Create / Edit)
   ========================================================================== */
function openNewTaskModal() {
  currentEditingTaskId = null;
  document.getElementById('taskModalTitle').textContent = 'Новая задача';
  document.getElementById('taskTitleInput').value = '';
  document.getElementById('taskNotesInput').value = '';
  document.getElementById('taskDateInput').value = currentTasksHorizon === 'today' ? getTodayDateString() : '';
  document.getElementById('taskTagInput').value = '';
  
  selectPriorityPill('p4');

  const deleteBtn = document.getElementById('taskModalDeleteBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';

  openModal('taskComposeModal');
}

function openEditTaskModal(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;

  currentEditingTaskId = id;
  document.getElementById('taskModalTitle').textContent = 'Редактировать задачу';
  document.getElementById('taskTitleInput').value = task.title || '';
  document.getElementById('taskNotesInput').value = task.notes || '';
  document.getElementById('taskDateInput').value = task.dueDate || '';
  document.getElementById('taskTagInput').value = task.tag || '';

  selectPriorityPill(task.priority || 'p4');

  const deleteBtn = document.getElementById('taskModalDeleteBtn');
  if (deleteBtn) deleteBtn.style.display = 'inline-flex';

  openModal('taskComposeModal');
}

function selectPriorityPill(priority) {
  const container = document.getElementById('taskPriorityPills');
  if (!container) return;

  const pills = container.querySelectorAll('.priority-pill');
  pills.forEach(p => {
    p.classList.toggle('active', p.dataset.priority === priority);
  });
  container.dataset.selectedPriority = priority;
}

async function handleSaveTask() {
  const title = document.getElementById('taskTitleInput').value.trim();
  const notes = document.getElementById('taskNotesInput').value.trim();
  const dueDate = document.getElementById('taskDateInput').value || null;
  const tag = document.getElementById('taskTagInput').value.trim();
  
  const pContainer = document.getElementById('taskPriorityPills');
  const priority = (pContainer && pContainer.dataset.selectedPriority) || 'p4';

  if (!title) {
    showToast('Введите название задачи');
    return;
  }

  const taskData = {
    id: currentEditingTaskId || undefined,
    title,
    notes,
    dueDate,
    tag,
    priority,
    horizon: dueDate ? (dueDate === getTodayDateString() ? 'today' : 'week') : 'today',
    completed: false
  };

  // Keep existing completion status if editing
  if (currentEditingTaskId) {
    const existing = allTasks.find(t => t.id === currentEditingTaskId);
    if (existing) {
      taskData.completed = existing.completed;
      taskData.completedAt = existing.completedAt;
    }
  }

  try {
    await DiaryDB.saveTask(taskData);
    closeModal('taskComposeModal');
    await loadAndRenderTasks();
    showToast(currentEditingTaskId ? 'Задача обновлена' : 'Задача добавлена 🎯');
  } catch (err) {
    console.error('Save failed:', err);
    showToast('Ошибка при сохранении задачи');
  }
}

async function handleDeleteModalTask() {
  if (!currentEditingTaskId) return;

  if (confirm('Удалить эту задачу?')) {
    await DiaryDB.deleteTask(currentEditingTaskId);
    closeModal('taskComposeModal');
    await loadAndRenderTasks();
    showToast('Задача удалена');
  }
}

/* ==========================================================================
   DATE & HELPER LOGIC
   ========================================================================== */
function getTodayDateString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function getEndOfWeekDateString() {
  const d = new Date();
  const dayOfWeek = d.getDay() || 7; // Sunday is 7
  d.setDate(d.getDate() + (7 - dayOfWeek));
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function isTaskForToday(task) {
  if (!task.dueDate) return task.horizon === 'today';
  return task.dueDate === getTodayDateString();
}

function isTaskForWeek(task) {
  if (task.horizon === 'week' || task.horizon === 'today') return true;
  if (!task.dueDate) return false;

  const due = new Date(task.dueDate);
  const now = new Date();
  const endOfWeek = new Date();
  const dayOfWeek = now.getDay() || 7;
  endOfWeek.setDate(now.getDate() + (7 - dayOfWeek) + 1); // Through end of Sunday

  return due >= now && due <= endOfWeek;
}

function formatDueBadge(task) {
  if (!task.dueDate) return null;

  const today = getTodayDateString();
  if (task.dueDate === today) {
    return { text: 'Сегодня', className: 'today' };
  }

  const d = new Date(task.dueDate + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (d < now && !task.completed) {
    return { text: 'Просрочено', className: 'overdue' };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) {
    return { text: 'Завтра', className: '' };
  }

  return {
    text: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
    className: ''
  };
}

window.TasksModule = {
  initTasksModule,
  loadAndRenderTasks,
  setTaskHorizon,
  toggleTaskCompletion,
  createQuickTask,
  openNewTaskModal,
  openEditTaskModal,
  handleSaveTask,
  handleDeleteModalTask,
  handleQuickDeleteTask,
  selectPriorityPill
};
