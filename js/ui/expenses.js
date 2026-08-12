/**
 * ui/expenses.js — Expenses tab: GPay / Cash / Credit Card logging.
 * Card spend is flagged as "bills next cycle" everywhere it appears.
 */

import { h, card, row, empty, modal, field, input, select, iconBtn, toast } from './dom.js';
import { PAY_METHOD, PAY_METHOD_LABEL, CARDS, cardLabel, createExpense } from '../models.js';
import { expenseBreakdown, cardDuesNextCycle, formatINR, formatShortINR } from '../calc.js';
import {
  cycleMonthLabel, nextCycle, toISODate, shortDate,
  cycleForDate, cycleStartDate, cycleEndDate, currentCycle,
} from '../cycle.js';

const METHOD_OPTIONS = [
  { value: PAY_METHOD.GPAY, label: PAY_METHOD_LABEL[PAY_METHOD.GPAY] },
  { value: PAY_METHOD.CASH, label: PAY_METHOD_LABEL[PAY_METHOD.CASH] },
  { value: PAY_METHOD.CARD, label: PAY_METHOD_LABEL[PAY_METHOD.CARD] },
];
const CARD_OPTIONS = CARDS.map((c) => ({ value: c.id, label: c.label }));

let filter = 'all';

export function renderExpenses(app) {
  const { state, cycle } = app;
  const b = expenseBreakdown(state, cycle);
  const next = cardDuesNextCycle(state, cycle);

  const visible = (filter === 'all' ? b.rows : b.rows.filter((e) => e.method === filter))
    .slice()
    .sort((a, z) => String(z.date).localeCompare(String(a.date)));

  return [
    h('div', { class: 'stat-grid stat-grid-3' },
      methodStat('GPay', b.byMethod.gpay, b.total, null, 'blue'),
      methodStat('Cash', b.byMethod.cash, b.total, null, 'green'),
      methodStat('Credit Card', b.byMethod.card, b.total,
        `bills in ${cycleMonthLabel(nextCycle(cycle))}`, 'violet')),

    card(null,
      h('div', { class: 'filter-bar' },
        ...[['all', 'All'], [PAY_METHOD.GPAY, 'GPay'], [PAY_METHOD.CASH, 'Cash'], [PAY_METHOD.CARD, 'Card']]
          .map(([v, label]) =>
            h('button', {
              class: `filter ${filter === v ? 'filter-on' : ''}`,
              onClick: () => { filter = v; app.refresh(); },
            }, label)),
        h('button', { class: 'btn btn-primary btn-sm push-right', onClick: () => addExpense(app) }, '+ Log expense')),

      visible.length
        ? h('div', {},
            ...visible.map((e) =>
              row(e.note || e.category || PAY_METHOD_LABEL[e.method], formatINR(e.amount), {
                detail: [
                  shortDate(e.date),
                  PAY_METHOD_LABEL[e.method],
                  e.method === PAY_METHOD.CARD ? (e.cardId ? cardLabel(e.cardId) : 'no card set') : e.category,
                ].filter(Boolean).join(' · '),
                badge: e.method === PAY_METHOD.CARD ? 'next cycle' : null,
                badgeTone: e.method === PAY_METHOD.CARD ? 'card' : 'due',
                action: iconBtn('×', () => removeExpense(app, e.id), 'icon-danger'),
              })),
            row('Total logged', formatINR(visible.reduce((t, e) => t + e.amount, 0)), { class: 'row-total' }))
        : empty('No expenses logged for this cycle yet.')),

    card(`Card spend consolidating into ${cycleMonthLabel(next.payableInCycle)}`,
      next.total === 0
        ? empty('No credit card spend logged this cycle.')
        : h('div', {},
            ...next.cards.map((c) => row(c.label, formatINR(c.amount))),
            next.unassigned > 0 &&
              row('Unassigned', formatINR(next.unassigned), { badge: 'pick a card', badgeTone: 'warn' }),
            row('Total due next cycle', formatINR(next.total), { class: 'row-total' }))),
  ];
}

function methodStat(label, value, total, caption, tone) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return h('div', { class: `stat stat-${tone}` },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, formatShortINR(value)),
    h('p', { class: 'stat-caption' }, caption ?? `${pct}% of spend`));
}

function addExpense(app) {
  const inCycle = app.cycle === currentCycle();
  const defaultDate = toISODate(inCycle ? new Date() : cycleStartDate(app.cycle));

  const cardRow = field('Card', select('cardId', CARD_OPTIONS, CARDS[0].id),
    'This amount is added to next cycle’s consolidated dues.');
  cardRow.style.display = 'none';

  const methodSel = select('method', METHOD_OPTIONS, PAY_METHOD.GPAY, {
    onChange: (e) => { cardRow.style.display = e.target.value === PAY_METHOD.CARD ? '' : 'none'; },
  });

  modal(`Log expense · ${cycleMonthLabel(app.cycle)}`,
    h('div', {},
      field('Amount (₹)', input('amount', { type: 'number', step: '1', min: '0', required: true, inputmode: 'numeric', placeholder: '0' })),
      field('Paid with', methodSel),
      cardRow,
      field('Date', input('date', { type: 'date', value: defaultDate }),
        `Cycle runs ${toISODate(cycleStartDate(app.cycle))} → ${toISODate(cycleEndDate(app.cycle))}`),
      field('Description', input('note', { type: 'text', placeholder: 'e.g. groceries' })),
      field('Category', input('category', { type: 'text', placeholder: 'optional' }))),
    {
      submitLabel: 'Log',
      onSubmit: (fd, close) => {
        const amount = Number(fd.get('amount'));
        if (!amount) return toast('Enter an amount');
        const date = fd.get('date') || defaultDate;
        // The date decides the cycle — logging 16 Aug while viewing Jul files it correctly.
        const targetCycle = cycleForDate(date);
        app.update((s) => {
          s.expenses.push(createExpense({
            cycle: targetCycle,
            date,
            amount,
            method: fd.get('method'),
            cardId: fd.get('cardId'),
            note: fd.get('note') || '',
            category: fd.get('category') || '',
          }));
        });
        close();
        toast(targetCycle === app.cycle
          ? 'Expense logged'
          : `Logged into ${cycleMonthLabel(targetCycle)} (date falls in that cycle)`);
      },
    });
}

function removeExpense(app, id) {
  app.update((s) => { s.expenses = s.expenses.filter((e) => e.id !== id); });
  toast('Removed');
}
