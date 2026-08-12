/**
 * ui/outflow.js — Outflow tab: EMIs, Chitra dues, card payments.
 * Tick an obligation to record the payment; part-payments are supported.
 */

import { h, card, row, empty, modal, field, input, iconBtn, toast, progressBar } from './dom.js';
import { COMMITMENT_TYPE, createOutflow } from '../models.js';
import {
  outflowRows, outflowBreakdown, consolidatedCardDues,
  progressTrackers, emiSchedule, formatINR, formatShortINR,
} from '../calc.js';
import { cycleMonthLabel, toISODate, cycleStartDate, currentCycle } from '../cycle.js';

export function renderOutflow(app) {
  const { state, cycle } = app;
  const b = outflowBreakdown(state, cycle);
  const dues = consolidatedCardDues(state, cycle);
  const rows = outflowRows(state, cycle);

  const fixed = rows.filter((r) => r.type !== COMMITMENT_TYPE.CARD);
  const cardRow = rows.find((r) => r.type === COMMITMENT_TYPE.CARD);

  return [
    h('div', { class: 'stat-grid stat-grid-3' },
      h('div', { class: 'stat stat-violet' },
        h('p', { class: 'stat-label' }, 'Committed'),
        h('p', { class: 'stat-value' }, formatINR(b.commitments)),
        h('p', { class: 'stat-caption' }, 'EMIs, dues & card bills')),
      h('div', { class: 'stat stat-green' },
        h('p', { class: 'stat-label' }, 'Paid'),
        h('p', { class: 'stat-value' }, formatINR(b.paid)),
        h('p', { class: 'stat-caption' }, 'recorded this cycle')),
      h('div', { class: `stat ${b.stillDue > 0 ? 'stat-rose' : 'stat-green'}` },
        h('p', { class: 'stat-label' }, 'Still due'),
        h('p', { class: 'stat-value' }, formatINR(b.stillDue)),
        h('p', { class: 'stat-caption' }, b.stillDue > 0 ? 'not yet paid' : 'all clear'))),

    card('EMIs & fixed dues',
      fixed.length
        ? h('div', {},
            ...fixed.map((r) =>
              row(r.label, r.unconfigured ? '—' : formatINR(r.scheduled), {
                detail: [r.dayOfMonth && !r.unconfigured ? `due ~${ordinal(r.dayOfMonth)}` : null, r.detail]
                  .filter(Boolean).join(' · '),
                badge: r.unconfigured ? 'set up'
                  : r.status === 'paid' ? 'paid'
                  : r.status === 'part' ? `${formatShortINR(r.outstanding)} left`
                  : 'due',
                badgeTone: r.unconfigured ? 'warn'
                  : r.status === 'paid' ? 'paid'
                  : r.status === 'part' ? 'part'
                  : 'due',
                action: r.unconfigured
                  ? h('button', { class: 'btn btn-sm btn-ghost', onClick: () => app.goto('settings') }, 'Settings')
                  : r.status === 'paid'
                    ? iconBtn('undo', () => clearPayments(app, r.commitmentId), 'icon-ghost')
                    : h('button', { class: 'btn btn-sm btn-primary', onClick: () => payCommitment(app, r) }, 'Pay'),
              })),
            row('Subtotal', formatINR(fixed.reduce((t, r) => t + r.committed, 0)), { class: 'row-total' }))
        : empty('No obligations configured. Set EMI amounts in Settings.')),

    card(`Credit card payments · consolidated from ${cycleMonthLabel(dues.sourceCycle)}`,
      dues.total === 0
        ? empty('Nothing due — no card spend in the previous cycle.')
        : h('div', {},
            ...dues.cards.map((c) =>
              row(c.label, formatINR(c.due), {
                detail: c.paid > 0 ? `${formatINR(c.paid)} paid · ${formatINR(c.outstanding)} outstanding` : 'unpaid',
                badge: c.settled ? 'paid' : c.paid > 0 ? 'part' : 'due',
                badgeTone: c.settled ? 'paid' : c.paid > 0 ? 'part' : 'due',
                action: c.settled
                  ? iconBtn('undo', () => clearCardPayments(app, c.cardId), 'icon-ghost')
                  : h('button', { class: 'btn btn-sm btn-primary', onClick: () => payCard(app, c) }, 'Pay'),
              })),
            dues.unassigned > 0 &&
              row('Unassigned card spend', formatINR(dues.unassigned), {
                detail: 'assign a card on those expenses to split this', badge: 'fix', badgeTone: 'warn',
              }),
            row('Total card dues', formatINR(dues.total), { class: 'row-total' }),
            h('div', { class: 'card-actions' },
              dues.outstanding > 0 &&
                h('button', { class: 'btn btn-ghost', onClick: () => payAllCards(app, dues) },
                  `Mark all paid (${formatShortINR(dues.outstanding)})`)))),

    card('Day-to-day spend',
      row('GPay + Cash logged this cycle', formatINR(b.dailySpend), {
        detail: 'card spend excluded — it bills next cycle',
      })),

    card('Total outflow',
      row(`Commitments + day-to-day · ${cycleMonthLabel(cycle)}`, formatINR(b.total), { class: 'row-total' })),

    card('Schedules',
      h('div', {},
        ...progressTrackers(state, cycle).map((t) =>
          h('div', { class: 'tracker' },
            h('div', { class: 'tracker-head' },
              h('span', { class: 'tracker-label' }, t.label),
              h('span', { class: 'tracker-remaining' }, `${formatShortINR(t.remaining)} left`)),
            progressBar(t.pct, t.pct >= 1 ? 'bar-done' : ''),
            h('p', { class: 'tracker-foot' },
              `${t.caption} · ${t.monthsLeft ?? '—'} months to go`
              + (t.finalCycle ? ` · ends ${cycleMonthLabel(t.finalCycle)}` : '')),
            t.kind === 'emi' && h('details', { class: 'schedule' },
              h('summary', {}, 'View instalment schedule'),
              h('ol', { class: 'schedule-list' },
                ...emiSchedule(state.commitments.find((c) => c.id === t.id))
                  .map((sr) => h('li', {},
                    h('span', {}, cycleMonthLabel(sr.cycle)),
                    h('span', {}, formatINR(sr.amount)),
                    h('span', { class: 'muted' }, `${formatShortINR(sr.outstandingAfter)} after`))))))))),
  ];
}

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/* ---------------- actions ---------------- */

function defaultPayDate(app) {
  return toISODate(app.cycle === currentCycle() ? new Date() : cycleStartDate(app.cycle));
}

function payCommitment(app, r) {
  modal(`Record payment · ${r.label}`,
    h('div', {},
      field('Amount (₹)', input('amount', { type: 'number', step: '1', min: '0', required: true, value: r.outstanding || r.scheduled, inputmode: 'numeric' }),
        `Scheduled ${formatINR(r.scheduled)}${r.paid ? ` · ${formatINR(r.paid)} already recorded` : ''}`),
      field('Date paid', input('date', { type: 'date', value: defaultPayDate(app) })),
      field('Note', input('note', { type: 'text', placeholder: 'optional' }))),
    {
      submitLabel: 'Record',
      onSubmit: (fd, close) => {
        const amount = Number(fd.get('amount'));
        if (!amount) return toast('Enter an amount');
        app.update((s) => {
          s.outflows.push(createOutflow({
            cycle: app.cycle,
            commitmentId: r.commitmentId,
            amount,
            date: fd.get('date') || null,
            note: fd.get('note') || '',
          }));
        });
        close();
        toast(`${r.label} — ${formatINR(amount)} recorded`);
      },
    });
}

function payCard(app, c) {
  modal(`Pay ${c.label}`,
    h('div', {},
      field('Amount (₹)', input('amount', { type: 'number', step: '1', min: '0', required: true, value: c.outstanding, inputmode: 'numeric' }),
        `Consolidated due ${formatINR(c.due)}`),
      field('Date paid', input('date', { type: 'date', value: defaultPayDate(app) }))),
    {
      submitLabel: 'Record',
      onSubmit: (fd, close) => {
        const amount = Number(fd.get('amount'));
        if (!amount) return toast('Enter an amount');
        app.update((s) => {
          s.outflows.push(createOutflow({
            cycle: app.cycle,
            commitmentId: 'card-payments',
            cardId: c.cardId,
            amount,
            date: fd.get('date') || null,
            note: `${c.label} payment`,
          }));
        });
        close();
        toast(`${c.label} — ${formatINR(amount)} recorded`);
      },
    });
}

function payAllCards(app, dues) {
  const date = defaultPayDate(app);
  app.update((s) => {
    for (const c of dues.cards) {
      if (c.outstanding <= 0) continue;
      s.outflows.push(createOutflow({
        cycle: app.cycle,
        commitmentId: 'card-payments',
        cardId: c.cardId,
        amount: c.outstanding,
        date,
        note: `${c.label} payment`,
      }));
    }
  });
  toast('All card dues marked paid');
}

function clearPayments(app, commitmentId) {
  app.update((s) => {
    s.outflows = s.outflows.filter(
      (o) => !(o.cycle === app.cycle && o.commitmentId === commitmentId)
    );
  });
  toast('Payment cleared');
}

function clearCardPayments(app, cardId) {
  app.update((s) => {
    s.outflows = s.outflows.filter(
      (o) => !(o.cycle === app.cycle && o.commitmentId === 'card-payments' && o.cardId === cardId)
    );
  });
  toast('Payment cleared');
}
