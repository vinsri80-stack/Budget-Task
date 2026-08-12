/**
 * tasks.js — task board domain logic: due-date urgency and status columns.
 *
 * Pure data in, data out. No DOM, no storage — safe to import from
 * React Native, same as calc.js and cycle.js.
 */

import { TASK_STATUS } from './models.js';
import { toISODate } from './cycle.js';

/** Local-midnight day difference: due - today. Negative = overdue. */
export function daysUntil(due, today) {
  const MS = 86400000;
  return Math.round((new Date(due) - new Date(today)) / MS);
}

export function urgencyLabel(task, today = toISODate(new Date())) {
  if (!task.due) return 'No due date';
  const diff = daysUntil(task.due, today);
  if (diff < 0) return `Overdue by ${-diff} day${-diff === 1 ? '' : 's'}`;
  if (diff === 0) return 'Due today';
  if (diff <= 7) return `Due in ${diff} day${diff === 1 ? '' : 's'}`;
  return `Due ${task.due}`;
}

/** Column a task sits in on the board — driven purely by status, not date. */
export function columnFor(task) {
  if (task.status === TASK_STATUS.COMPLETED) return 'completed';
  if (task.status === TASK_STATUS.IN_PROCESS) return 'in_process';
  return 'todo';
}

/**
 * Everything the Task board view needs, computed in one pass.
 * @param {object[]} tasks
 * @param {string} [today] 'YYYY-MM-DD', defaults to local today
 */
export function taskSummary(tasks, today = toISODate(new Date())) {
  const open = tasks.filter((t) => t.status !== TASK_STATUS.COMPLETED);

  const dueToday = open.filter((t) => t.due && daysUntil(t.due, today) <= 0).length;
  const dueWeek = open.filter((t) => t.due && daysUntil(t.due, today) > 0 && daysUntil(t.due, today) <= 7).length;
  const inProcess = tasks.filter((t) => t.status === TASK_STATUS.IN_PROCESS).length;
  const completed = tasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;

  // Reminders: anything open and due today or overdue, most overdue first.
  const reminders = open
    .filter((t) => t.due && daysUntil(t.due, today) <= 0)
    .sort((a, b) => daysUntil(a.due, today) - daysUntil(b.due, today));

  const columns = { todo: [], in_process: [], completed: [] };
  for (const t of tasks) columns[columnFor(t)].push(t);

  return { dueToday, dueWeek, inProcess, completed, reminders, columns };
}
