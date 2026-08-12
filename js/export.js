/**
 * export.js — report generation (CSV, JSON, printable HTML).
 * Browser download helpers are isolated at the bottom so the report builders
 * stay pure and reusable on React Native (feed them to expo-sharing / RNFS).
 */

import { PAY_METHOD_LABEL, INFLOW_KIND_LABEL, cardLabel } from './models.js';
import {
  cycleSummary,
  progressTrackers,
  upcomingObligations,
  formatINR,
} from './calc.js';
import { cycleRangeLabel, cycleMonthLabel, shortDate } from './cycle.js';
import { exportJSON } from './storage.js';

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRows = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

/* ------------------------------------------------------------------ *
 * CSV — one cycle, every line item
 * ------------------------------------------------------------------ */

export function cycleCSV(state, cycle) {
  const s = cycleSummary(state, cycle);
  const rows = [];

  rows.push(['Budget report', cycleMonthLabel(cycle), cycleRangeLabel(cycle)]);
  rows.push([]);

  rows.push(['SECTION', 'ITEM', 'DETAIL', 'AMOUNT']);

  rows.push(['Inflow', 'Carried forward', s.inflow.carriedForwardIsManual ? 'manual' : 'computed', s.inflow.carriedForward]);
  for (const r of s.inflow.rows.filter((r) => r.kind !== 'carry_forward')) {
    rows.push(['Inflow', INFLOW_KIND_LABEL[r.kind] ?? r.kind, r.note, r.amount]);
  }
  rows.push(['Inflow', 'TOTAL INFLOW', '', s.inflow.total]);
  rows.push([]);

  for (const e of s.expenses.rows) {
    const detail = e.method === 'card' ? cardLabel(e.cardId) : (e.category || '');
    rows.push(['Expense', `${shortDate(e.date)} ${e.note}`.trim(), `${PAY_METHOD_LABEL[e.method]}${detail ? ` · ${detail}` : ''}`, e.amount]);
  }
  rows.push(['Expense', 'GPay subtotal', '', s.expenses.byMethod.gpay]);
  rows.push(['Expense', 'Cash subtotal', '', s.expenses.byMethod.cash]);
  rows.push(['Expense', 'Credit card subtotal', 'payable next cycle', s.expenses.byMethod.card]);
  rows.push(['Expense', 'TOTAL EXPENSES', '', s.expenses.total]);
  rows.push([]);

  for (const r of s.outflow.rows) {
    rows.push(['Outflow', r.label, `${r.detail ?? ''} · ${r.status}`, r.committed]);
  }
  rows.push(['Outflow', 'Day-to-day spend (GPay + Cash)', '', s.outflow.dailySpend]);
  rows.push(['Outflow', 'TOTAL OUTFLOW', '', s.outflow.total]);
  rows.push([]);

  rows.push(['Card dues', `Consolidated from ${s.cardDues.sourceCycle}`, '', s.cardDues.total]);
  for (const c of s.cardDues.cards) {
    rows.push(['Card dues', c.label, c.settled ? 'paid' : `${formatINR(c.outstanding)} outstanding`, c.due]);
  }
  rows.push([]);

  rows.push(['Next cycle', `Card dues payable in ${s.nextCardDues.payableInCycle}`, '', s.nextCardDues.total]);
  for (const c of s.nextCardDues.cards) rows.push(['Next cycle', c.label, '', c.amount]);
  rows.push([]);

  for (const t of progressTrackers(state, cycle)) {
    rows.push(['Progress', t.label, `${t.caption} · ${t.monthsLeft ?? '—'} months left`, t.remaining]);
  }
  rows.push([]);

  rows.push(['Summary', 'Total inflow', '', s.inflow.total]);
  rows.push(['Summary', 'Total outflow', '', s.outflow.total]);
  rows.push(['Summary', 'Net / carry forward', '', s.net]);
  rows.push(['Summary', 'Still unpaid', '', s.unpaid]);

  return csvRows(rows);
}

/** Multi-cycle roll-up: one row per cycle. */
export function summaryCSV(state, cycles) {
  const rows = [[
    'Cycle', 'Period', 'Carried forward', 'Salary', 'Rent', 'Other in',
    'Total inflow', 'GPay', 'Cash', 'Card spend', 'EMIs & dues',
    'Card payments', 'Total outflow', 'Net', 'Unpaid',
  ]];
  for (const cycle of cycles) {
    const s = cycleSummary(state, cycle);
    const cardRow = s.outflow.rows.find((r) => r.commitmentId === 'card-payments');
    rows.push([
      cycleMonthLabel(cycle), cycleRangeLabel(cycle),
      s.inflow.carriedForward, s.inflow.salary, s.inflow.rent, s.inflow.other,
      s.inflow.total,
      s.expenses.byMethod.gpay, s.expenses.byMethod.cash, s.expenses.byMethod.card,
      s.outflow.commitments - (cardRow?.committed ?? 0),
      cardRow?.committed ?? 0,
      s.outflow.total, s.net, s.unpaid,
    ]);
  }
  return csvRows(rows);
}

/* ------------------------------------------------------------------ *
 * Printable HTML report (Print → Save as PDF)
 * ------------------------------------------------------------------ */

export function cycleReportHTML(state, cycle) {
  const s = cycleSummary(state, cycle);
  const money = (n) => formatINR(n);
  const tr = (a, b, c) => `<tr><td>${a}</td><td>${b ?? ''}</td><td class="n">${c}</td></tr>`;

  const section = (title, body) =>
    `<h2>${title}</h2><table><tbody>${body}</tbody></table>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Budget — ${cycleMonthLabel(cycle)}</title>
<style>
 body{font:14px -apple-system,Segoe UI,Roboto,sans-serif;color:#23262b;max-width:760px;margin:32px auto;padding:0 20px}
 h1{font-size:22px;margin:0 0 2px} .sub{color:#6b6458;margin:0 0 24px}
 h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#8a4d18;margin:26px 0 6px}
 table{width:100%;border-collapse:collapse} td{padding:6px 4px;border-bottom:1px solid #eee}
 td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
 tr.total td{font-weight:600;border-top:2px solid #d99a4e;border-bottom:none}
 @media print{body{margin:0}}
</style></head><body>
<h1>Budget report — ${cycleMonthLabel(cycle)}</h1>
<p class="sub">Cycle ${cycleRangeLabel(cycle)} · generated ${new Date().toLocaleString('en-IN')}</p>

${section('Inflow',
  tr('Carried forward from previous cycle', '', money(s.inflow.carriedForward)) +
  tr('Salary', '', money(s.inflow.salary)) +
  tr('Rent income', '', money(s.inflow.rent)) +
  (s.inflow.other ? tr('Other', '', money(s.inflow.other)) : '') +
  `<tr class="total"><td>Total inflow</td><td></td><td class="n">${money(s.inflow.total)}</td></tr>`
)}

${section('Expenses logged',
  tr('GPay', '', money(s.expenses.byMethod.gpay)) +
  tr('Cash', '', money(s.expenses.byMethod.cash)) +
  tr('Credit card', 'payable next cycle', money(s.expenses.byMethod.card)) +
  `<tr class="total"><td>Total expenses</td><td></td><td class="n">${money(s.expenses.total)}</td></tr>`
)}

${section('Outflow',
  s.outflow.rows.map((r) => tr(r.label, `${r.detail ?? ''} — ${r.status}`, money(r.committed))).join('') +
  tr('Day-to-day spend (GPay + Cash)', '', money(s.outflow.dailySpend)) +
  `<tr class="total"><td>Total outflow</td><td></td><td class="n">${money(s.outflow.total)}</td></tr>`
)}

${section(`Consolidated card dues (from ${cycleMonthLabel(s.cardDues.sourceCycle)} spend)`,
  (s.cardDues.cards.length
    ? s.cardDues.cards.map((c) => tr(c.label, c.settled ? 'paid' : `${money(c.outstanding)} outstanding`, money(c.due))).join('')
    : tr('No card spend last cycle', '', money(0))) +
  `<tr class="total"><td>Total card dues</td><td></td><td class="n">${money(s.cardDues.total)}</td></tr>`
)}

${section(`Card dues moving into ${cycleMonthLabel(s.nextCardDues.payableInCycle)}`,
  (s.nextCardDues.cards.length
    ? s.nextCardDues.cards.map((c) => tr(c.label, '', money(c.amount))).join('')
    : tr('Nothing on card yet', '', money(0))) +
  `<tr class="total"><td>Total</td><td></td><td class="n">${money(s.nextCardDues.total)}</td></tr>`
)}

${section('Long-term dues',
  progressTrackers(state, cycle)
    .map((t) => tr(t.label, `${t.caption} · ~${t.monthsLeft ?? '—'} months left`, money(t.remaining)))
    .join('') || tr('None tracked', '', '')
)}

${section('Upcoming obligations',
  upcomingObligations(state, cycle, 3)
    .map((u) => tr(cycleMonthLabel(u.cycle), u.items.map((i) => i.label).join(', '), money(u.total)))
    .join('')
)}

${section('Bottom line',
  tr('Total inflow', '', money(s.inflow.total)) +
  tr('Total outflow', '', money(s.outflow.total)) +
  tr('Still unpaid this cycle', '', money(s.unpaid)) +
  `<tr class="total"><td>Net — carries into ${cycleMonthLabel(s.nextCardDues.payableInCycle)}</td><td></td><td class="n">${money(s.net)}</td></tr>`
)}
</body></html>`;
}

/* ------------------------------------------------------------------ *
 * Browser download / print (web only)
 * ------------------------------------------------------------------ */

export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCycleCSV(state, cycle) {
  download(`budget-${cycle}.csv`, '﻿' + cycleCSV(state, cycle), 'text/csv;charset=utf-8');
}

export function downloadSummaryCSV(state, cycles) {
  download(`budget-summary.csv`, '﻿' + summaryCSV(state, cycles), 'text/csv;charset=utf-8');
}

export function downloadBackup(state) {
  download(`budget-backup-${new Date().toISOString().slice(0, 10)}.json`,
    exportJSON(state), 'application/json');
}

export function downloadReportHTML(state, cycle) {
  download(`budget-report-${cycle}.html`, cycleReportHTML(state, cycle), 'text/html;charset=utf-8');
}

/**
 * Opens the report in a new tab and triggers print. Popups are blocked in
 * embedded/sandboxed contexts, so this reports whether it actually worked —
 * callers fall back to downloading the report rather than silently doing
 * nothing.
 * @returns {boolean} true if the print window opened
 */
export function printReport(state, cycle) {
  let w = null;
  try {
    w = window.open('', '_blank');
  } catch {
    w = null;
  }
  if (!w || !w.document) return false;
  w.document.write(cycleReportHTML(state, cycle));
  w.document.close();
  setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 350);
  return true;
}
