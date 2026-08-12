/**
 * app.js — shell: state container, cycle switcher, tab router, export menu.
 */

import { h, mount, toast, modal, field, select } from './ui/dom.js';
import { load, save, cloud } from './storage.js';
import { isUnlocked, hasPin, lockNow } from './lock.js';
import { renderLockScreen } from './ui/lockscreen.js';
import {
  currentCycle, cycleMonthLabel, cycleRangeLabel,
  nextCycle, prevCycle, cycleProgress, cycleRange, shiftCycle,
} from './cycle.js';
import { cycleSummary, formatShortINR } from './calc.js';
import {
  downloadCycleCSV, downloadSummaryCSV, printReport, downloadBackup, downloadReportHTML,
} from './export.js';

import { renderDashboard } from './ui/dashboard.js';
import { renderInflow } from './ui/inflow.js';
import { renderExpenses } from './ui/expenses.js';
import { renderOutflow } from './ui/outflow.js';
import { renderTasks } from './ui/tasks.js';
import { renderSettings } from './ui/settings.js';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎', render: renderDashboard },
  { id: 'inflow',    label: 'Inflow',    icon: '↓', render: renderInflow },
  { id: 'expenses',  label: 'Expenses',  icon: '≡', render: renderExpenses },
  { id: 'outflow',   label: 'Outflow',   icon: '↑', render: renderOutflow },
  { id: 'tasks',     label: 'Tasks',     icon: '✓', render: renderTasks },
  { id: 'settings',  label: 'Settings',  icon: '⚙', render: renderSettings },
];

const app = {
  state: load(),
  cycle: currentCycle(),
  tab: location.hash.replace('#', '') || 'dashboard',

  /** Mutate through a fresh clone so memoised balance caches invalidate. */
  update(mutator) {
    const next = JSON.parse(JSON.stringify(this.state));
    mutator(next);
    this.state = next;
    save(this.state);
    this.refresh();
  },

  replace(state) {
    this.state = state;
    save(this.state);
    this.refresh();
  },

  goto(tab) {
    this.tab = tab;
    history.replaceState(null, '', `#${tab}`);
    this.refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  setCycle(cycle) {
    this.cycle = cycle;
    this.refresh();
  },

  refresh() { render(); },
};

if (!TABS.some((t) => t.id === app.tab)) app.tab = 'dashboard';

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

function renderHeader() {
  const prog = cycleProgress(app.cycle);
  const s = cycleSummary(app.state, app.cycle);

  return h('header', { class: 'app-header' },
    h('div', { class: 'header-top' },
      h('div', {},
        h('h1', {}, 'Budget'),
        h('p', { class: 'header-sub' }, `${cycleRangeLabel(app.cycle)} · 15th → 14th`)),
      h('div', { class: 'header-actions' },
        h('button', { class: 'btn btn-ghost btn-sm', onClick: openExport }, 'Export'),
        hasPin() &&
          h('button', { class: 'btn btn-ghost btn-sm', onClick: () => { lockNow(); render(); } }, '🔒 Lock'),
        !prog.isCurrent &&
          h('button', { class: 'btn btn-ghost btn-sm', onClick: () => app.setCycle(currentCycle()) }, 'Today'))),

    h('div', { class: 'cycle-switch' },
      h('button', { class: 'nav-btn', 'aria-label': 'Previous cycle', onClick: () => app.setCycle(prevCycle(app.cycle)) }, '‹'),
      h('button', { class: 'cycle-current', onClick: openCyclePicker },
        h('span', { class: 'cycle-name' }, cycleMonthLabel(app.cycle)),
        h('span', { class: 'cycle-net' },
          `net ${formatShortINR(s.net)}`,
          prog.isCurrent ? ` · ${prog.daysLeft}d left` : '')),
      h('button', { class: 'nav-btn', 'aria-label': 'Next cycle', onClick: () => app.setCycle(nextCycle(app.cycle)) }, '›')),

    h('nav', { class: 'tabs', role: 'tablist' },
      ...TABS.map((t) =>
        h('button', {
          class: `tab ${app.tab === t.id ? 'tab-on' : ''}`,
          role: 'tab', 'aria-selected': app.tab === t.id,
          onClick: () => app.goto(t.id),
        }, h('span', { class: 'tab-icon' }, t.icon), h('span', { class: 'tab-label' }, t.label)))));
}

function render() {
  if (!isUnlocked()) {
    mount(document.getElementById('root'), renderLockScreen(render));
    return;
  }
  const tab = TABS.find((t) => t.id === app.tab) ?? TABS[0];
  mount(document.getElementById('root'),
    renderHeader(),
    h('main', { class: 'app-main' }, ...tab.render(app)),
    h('footer', { class: 'app-footer' },
      `Saved on this device${cloud.status === 'connected' ? ' · synced' : ''} · `
      + `updated ${new Date(app.state.updatedAt).toLocaleString('en-IN')}`));
}

/* ------------------------------------------------------------------ *
 * Cycle picker & export
 * ------------------------------------------------------------------ */

function openCyclePicker() {
  const from = shiftCycle(currentCycle(), -12);
  const options = cycleRange(from, shiftCycle(currentCycle(), 6))
    .map((c) => ({ value: c, label: `${cycleMonthLabel(c)} · ${cycleRangeLabel(c)}` }));

  modal('Jump to cycle',
    h('div', {}, field('Cycle', select('cycle', options, app.cycle))),
    {
      submitLabel: 'Go',
      onSubmit: (fd, close) => { app.setCycle(fd.get('cycle')); close(); },
    });
}

function openExport() {
  const rangeOptions = [3, 6, 12].map((n) => ({ value: String(n), label: `Last ${n} cycles` }));

  modal('Export report',
    h('div', {},
      h('p', { class: 'prose' }, `Reports cover the 15th → 14th cycle you are viewing (${cycleMonthLabel(app.cycle)}).`),
      h('div', { class: 'card-actions column' },
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onClick: () => {
            if (printReport(app.state, app.cycle)) {
              toast('Opening print view');
            } else {
              // Popup blocked (common when the app is embedded) — hand over
              // the same report as a file instead of failing silently.
              downloadReportHTML(app.state, app.cycle);
              toast('Popup blocked — report downloaded instead');
            }
          },
        }, 'Printable report / PDF'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { downloadCycleCSV(app.state, app.cycle); toast('CSV downloaded'); } },
          'This cycle — detailed CSV'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { downloadBackup(app.state); toast('Backup downloaded'); } },
          'Full backup (.json)')),
      h('hr', { class: 'sep' }),
      field('Multi-cycle summary', select('span', rangeOptions, '6'))),
    {
      submitLabel: 'Download summary CSV',
      onSubmit: (fd, close) => {
        const n = Number(fd.get('span'));
        downloadSummaryCSV(app.state, cycleRange(shiftCycle(app.cycle, -(n - 1)), app.cycle));
        close();
        toast('Summary downloaded');
      },
    });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

// index.html ships a viewport meta, but hosted wrappers supply their own <head>
// and may not. Without one the layout viewport defaults to ~980px, the mobile
// breakpoints never fire, and a phone gets the desktop layout shrunk down.
// No-op when a viewport meta is already present.
if (!document.querySelector('meta[name="viewport"]')) {
  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  document.head.appendChild(meta);
}

render();

cloud.init((remote) => {
  app.state = remote;
  render();
  toast('Synced from another device');
});

window.addEventListener('hashchange', () => {
  const t = location.hash.replace('#', '');
  if (TABS.some((x) => x.id === t) && t !== app.tab) { app.tab = t; render(); }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => { /* offline cache is optional */ });
}

window.budgetApp = app; // handy in devtools
