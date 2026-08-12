/**
 * ui/inflow.js — Inflow tab: carry-forward, salary, rent, other.
 */

import { h, card, row, empty, modal, field, input, select, iconBtn, toast } from './dom.js';
import { INFLOW_KIND, INFLOW_KIND_LABEL, createInflow } from '../models.js';
import { inflowBreakdown, formatINR } from '../calc.js';
import { cycleMonthLabel, prevCycle, toISODate, shortDate, cycleStartDate } from '../cycle.js';

const KIND_OPTIONS = [
  { value: INFLOW_KIND.SALARY, label: INFLOW_KIND_LABEL[INFLOW_KIND.SALARY] },
  { value: INFLOW_KIND.RENT, label: INFLOW_KIND_LABEL[INFLOW_KIND.RENT] },
  { value: INFLOW_KIND.OTHER, label: INFLOW_KIND_LABEL[INFLOW_KIND.OTHER] },
  { value: INFLOW_KIND.CARRY_FORWARD, label: 'Carry-forward override' },
];

export function renderInflow(app) {
  const { state, cycle } = app;
  const b = inflowBreakdown(state, cycle);
  const entered = b.rows.filter((r) => r.kind !== INFLOW_KIND.CARRY_FORWARD);

  return [
    card('Carried forward',
      row(`Closing balance of ${cycleMonthLabel(prevCycle(cycle))}`, formatINR(b.carriedForward), {
        detail: b.carriedForwardIsManual
          ? 'manual override — delete the row below to go back to auto'
          : 'calculated automatically from the previous cycle',
        badge: b.carriedForwardIsManual ? 'manual' : 'auto',
        badgeTone: b.carriedForwardIsManual ? 'warn' : 'paid',
      })),

    card('Money in this cycle',
      entered.length
        ? h('div', {},
            ...entered.map((r) =>
              row(INFLOW_KIND_LABEL[r.kind] ?? r.kind, formatINR(r.amount), {
                detail: [r.date ? shortDate(r.date) : null, r.note].filter(Boolean).join(' · '),
                action: iconBtn('×', () => removeInflow(app, r.id), 'icon-danger'),
              })),
            row('Total earned', formatINR(b.earned), { class: 'row-total' }))
        : empty('Nothing logged yet. Add your salary and rent income for this cycle.'),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => addInflow(app) }, '+ Add inflow'),
        !entered.some((r) => r.kind === INFLOW_KIND.SALARY) &&
          h('button', { class: 'btn btn-ghost', onClick: () => addInflow(app, INFLOW_KIND.SALARY) }, 'Add salary'),
        !entered.some((r) => r.kind === INFLOW_KIND.RENT) &&
          h('button', { class: 'btn btn-ghost', onClick: () => addInflow(app, INFLOW_KIND.RENT) }, 'Add rent'))),

    card('Total inflow',
      row(`Carried forward + earned · ${cycleMonthLabel(cycle)}`, formatINR(b.total), { class: 'row-total' })),
  ];
}

function addInflow(app, presetKind = INFLOW_KIND.SALARY) {
  const defaultDate = toISODate(cycleStartDate(app.cycle));
  modal(`Add inflow · ${cycleMonthLabel(app.cycle)}`,
    h('div', {},
      field('Type', select('kind', KIND_OPTIONS, presetKind)),
      field('Amount (₹)', input('amount', { type: 'number', step: '1', min: '0', required: true, inputmode: 'numeric', placeholder: '0' })),
      field('Date received', input('date', { type: 'date', value: defaultDate })),
      field('Note', input('note', { type: 'text', placeholder: 'optional' }))),
    {
      submitLabel: 'Add',
      onSubmit: (fd, close) => {
        const amount = Number(fd.get('amount'));
        if (!amount) return toast('Enter an amount');
        app.update((s) => {
          const kind = fd.get('kind');
          if (kind === INFLOW_KIND.CARRY_FORWARD) {
            s.inflows = s.inflows.filter(
              (i) => !(i.cycle === app.cycle && i.kind === INFLOW_KIND.CARRY_FORWARD)
            );
          }
          s.inflows.push(createInflow({
            cycle: app.cycle,
            kind,
            amount,
            date: fd.get('date') || null,
            note: fd.get('note') || '',
          }));
        });
        close();
        toast('Inflow added');
      },
    });
}

function removeInflow(app, id) {
  app.update((s) => { s.inflows = s.inflows.filter((i) => i.id !== id); });
  toast('Removed');
}
