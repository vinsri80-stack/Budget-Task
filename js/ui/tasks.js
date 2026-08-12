/**
 * ui/tasks.js — Task board tab: a due-today/overdue reminder banner and a
 * drag-and-drop kanban board (To do / Follow up · In process / Completed).
 */

import { h, card, modal, field, input, toast } from './dom.js';
import { TASK_STATUS, createTask } from '../models.js';
import { taskSummary, urgencyLabel } from '../tasks.js';
import { toISODate } from '../cycle.js';

const REMIND_KEY = 'budget-app:tasks:last-reminded';

const COLUMNS = [
  { key: 'todo', title: 'To do', status: TASK_STATUS.OPEN },
  { key: 'in_process', title: 'Follow up / in process', status: TASK_STATUS.IN_PROCESS },
  { key: 'completed', title: 'Completed', status: TASK_STATUS.COMPLETED },
];

export function renderTasks(app) {
  const { state } = app;
  const s = taskSummary(state.tasks);

  if ('Notification' in window && Notification.permission === 'granted') {
    notifyDueToday(s.reminders);
  }

  return [
    s.reminders.length > 0 && reminderBanner(s.reminders),

    card('Add a task',
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => addTask(app) }, '+ Add task'))),

    h('div', { class: 'stat-grid' },
      h('div', { class: 'stat stat-rose' },
        h('p', { class: 'stat-label' }, 'Due today / overdue'),
        h('p', { class: 'stat-value' }, s.dueToday)),
      h('div', { class: 'stat stat-amber' },
        h('p', { class: 'stat-label' }, 'Due this week'),
        h('p', { class: 'stat-value' }, s.dueWeek)),
      h('div', { class: 'stat stat-blue' },
        h('p', { class: 'stat-label' }, 'Follow-up / in process'),
        h('p', { class: 'stat-value' }, s.inProcess)),
      h('div', { class: 'stat stat-green' },
        h('p', { class: 'stat-label' }, 'Completed'),
        h('p', { class: 'stat-value' }, s.completed))),

    h('div', { class: 'kanban' },
      ...COLUMNS.map((col) => kanbanColumn(app, col, s.columns[col.key]))),
  ];
}

function reminderBanner(tasks) {
  const granted = 'Notification' in window && Notification.permission === 'granted';
  return h('div', { class: 'reminder-banner' },
    h('h3', {}, `🔔 ${tasks.length} task${tasks.length === 1 ? '' : 's'} due today or overdue`),
    h('ul', {}, ...tasks.slice(0, 5).map((t) => h('li', {}, `${t.title} — ${urgencyLabel(t)}`))),
    tasks.length > 5 && h('p', { class: 'small', style: { margin: '4px 0 0', opacity: .85 } }, `+ ${tasks.length - 5} more`),
    h('div', { class: 'banner-actions' },
      !granted && 'Notification' in window &&
        h('button', { class: 'btn btn-sm', style: { background: '#fff', color: 'var(--rose-2)', borderColor: '#fff' }, onClick: () => enableReminders(tasks) },
          'Enable browser reminders')));
}

function enableReminders(tasks) {
  if (!('Notification' in window)) return toast('Notifications are not supported in this browser');
  Notification.requestPermission().then((perm) => {
    if (perm !== 'granted') return toast('Reminders not enabled');
    notifyDueToday(tasks);
    toast('Reminders enabled — you\'ll get a notification for tasks due today');
  });
}

/** Fire a native notification for today's tasks at most once per calendar day. */
function notifyDueToday(tasks) {
  if (!tasks.length) return;
  const today = toISODate(new Date());
  if (localStorage.getItem(REMIND_KEY) === today) return;
  localStorage.setItem(REMIND_KEY, today);
  const title = tasks.length === 1 ? tasks[0].title : `${tasks.length} tasks due today or overdue`;
  const body = tasks.slice(0, 5).map((t) => t.title).join(', ');
  new Notification(title, { body, tag: 'tasks-due-today' });
}

/* ---------------- kanban board ---------------- */

function kanbanColumn(app, col, tasks) {
  const colEl = h('div', { class: 'kanban-col' },
    h('h3', {}, col.title, h('span', {}, tasks.length)),
    h('div', { class: 'kanban-cards' },
      ...(tasks.length ? tasks.map((t) => taskCard(app, t)) : [h('p', { class: 'empty' }, 'Nothing here.')])));

  colEl.addEventListener('dragover', (e) => { e.preventDefault(); colEl.classList.add('dragover'); });
  colEl.addEventListener('dragleave', () => colEl.classList.remove('dragover'));
  colEl.addEventListener('drop', (e) => {
    e.preventDefault();
    colEl.classList.remove('dragover');
    const id = e.dataTransfer.getData('text/plain');
    if (id) setStatus(app, id, col.status);
  });
  return colEl;
}

function taskCard(app, t) {
  const diff = t.due ? Math.round((new Date(t.due) - new Date(toISODate(new Date()))) / 86400000) : null;
  const urgencyClass = diff !== null && diff <= 0 ? (diff < 0 ? 'overdue' : 'today') : '';

  const cardEl = h('div', { class: `task-card ${urgencyClass}`, draggable: 'true' },
    h('div', { class: 't-title' }, t.title),
    h('div', { class: 't-meta' }, [t.owner, urgencyLabel(t)].filter(Boolean).join(' · ')),
    t.description && h('div', { class: 't-desc' }, t.description),
    h('div', { class: 't-actions' },
      t.status === TASK_STATUS.OPEN &&
        h('button', { class: 'btn btn-sm btn-ghost', onClick: () => setStatus(app, t.id, TASK_STATUS.IN_PROCESS) }, 'Start'),
      t.status === TASK_STATUS.IN_PROCESS &&
        h('button', { class: 'btn btn-sm btn-ghost', onClick: () => setStatus(app, t.id, TASK_STATUS.OPEN) }, 'Back to to-do'),
      t.status !== TASK_STATUS.COMPLETED &&
        h('button', { class: 'btn btn-sm btn-primary', onClick: () => setStatus(app, t.id, TASK_STATUS.COMPLETED) }, 'Complete'),
      t.status === TASK_STATUS.COMPLETED &&
        h('button', { class: 'btn btn-sm btn-ghost', onClick: () => setStatus(app, t.id, TASK_STATUS.OPEN) }, 'Reopen'),
      h('button', { class: 'btn btn-sm btn-danger', onClick: () => deleteTask(app, t.id) }, 'Delete')));

  cardEl.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', t.id);
    cardEl.classList.add('dragging');
  });
  cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
  return cardEl;
}

/* ---------------- actions ---------------- */

function addTask(app) {
  modal('Add task',
    h('div', {},
      field('Title', input('title', { type: 'text', required: true, placeholder: 'e.g. Pay HDFC card bill' })),
      field('Owner', input('owner', { type: 'text', placeholder: 'optional' })),
      field('Due date', input('due', { type: 'date', value: toISODate(new Date()) })),
      field('Description', input('description', { type: 'text', placeholder: 'optional details' }))),
    {
      submitLabel: 'Add',
      onSubmit: (fd, close) => {
        const title = (fd.get('title') || '').trim();
        if (!title) return toast('Enter a title');
        app.update((s) => {
          s.tasks.push(createTask({
            title,
            owner: fd.get('owner') || '',
            due: fd.get('due') || null,
            description: fd.get('description') || '',
          }));
        });
        close();
        toast('Task added');
      },
    });
}

function setStatus(app, id, status) {
  app.update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) t.status = status;
  });
  toast(status === TASK_STATUS.COMPLETED ? 'Marked complete' : status === TASK_STATUS.IN_PROCESS ? 'Moved to follow-up' : 'Moved to to-do');
}

function deleteTask(app, id) {
  app.update((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); });
  toast('Task deleted');
}
