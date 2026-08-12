/**
 * ui/settings.js — commitment amounts/tenures, opening balance, backup, sync.
 */

import { h, card, row, field, input, toast, modal } from './dom.js';
import { COMMITMENT_TYPE } from '../models.js';
import { formatINR } from '../calc.js';
import { cycleMonthLabel } from '../cycle.js';
import { cloud, reset, exportJSON, importJSON } from '../storage.js';
import { downloadBackup } from '../export.js';

export function renderSettings(app) {
  const { state, cycle } = app;

  return [
    card('Opening balance',
      h('div', { class: 'form-grid' },
        field('Anchor cycle', input('anchorCycle', {
          type: 'month', value: state.settings.anchorCycle,
          onChange: (e) => app.update((s) => { s.settings.anchorCycle = e.target.value; }),
        }), 'The cycle your figures below are true for.'),
        field('Balance at start of anchor cycle (₹)', input('openingBalance', {
          type: 'number', step: '1', value: state.settings.openingBalance, inputmode: 'numeric',
          onChange: (e) => app.update((s) => { s.settings.openingBalance = Number(e.target.value) || 0; }),
        }), 'Every later cycle carries forward from here automatically.'))),

    card('EMIs & dues',
      h('div', {},
        ...state.commitments
          .filter((c) => c.type !== COMMITMENT_TYPE.CARD)
          .map((c) => commitmentEditor(app, c)))),

    card('Backup & sync',
      row('Local storage', 'on this device', {
        detail: `${state.inflows.length} inflows · ${state.expenses.length} expenses · ${state.outflows.length} payments`,
      }),
      row('Cloud sync', cloud.status === 'connected' ? 'connected' : cloud.status, {
        detail: cloud.status === 'off'
          ? 'Add a Firebase config in js/storage.js to sync between phone and desktop.'
          : 'Devices sharing a sync code share the same budget.',
        badge: cloud.status === 'connected' ? 'live' : null,
        badgeTone: 'paid',
      }),
      field('Sync code', input('syncCode', {
        type: 'text', value: cloud.code, placeholder: 'e.g. home-budget-2026',
        onChange: (e) => { cloud.setCode(e.target.value); toast('Sync code saved — reload to connect'); },
      })),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn btn-ghost', onClick: () => downloadBackup(state) }, 'Download backup (.json)'),
        h('button', { class: 'btn btn-ghost', onClick: () => restoreBackup(app) }, 'Restore from backup'),
        h('button', { class: 'btn btn-danger', onClick: () => wipe(app) }, 'Erase everything'))),

    card('About the cycle',
      h('p', { class: 'prose' },
        'Every cycle runs from the 15th of one month to the 14th of the next. '
        + 'Credit card spend inside a cycle is not deducted from that cycle — it is '
        + 'consolidated into a single due block payable in the following cycle, which is '
        + 'what the dashboard plans against. '
        + `You are currently viewing ${cycleMonthLabel(cycle)}.`)),
  ];
}

function commitmentEditor(app, c) {
  const isDebt = c.type === COMMITMENT_TYPE.DEBT;
  return h('div', { class: 'commitment' },
    h('div', { class: 'commitment-head' },
      h('label', { class: 'switch' },
        h('input', {
          type: 'checkbox', checked: c.active,
          onChange: (e) => app.update((s) => {
            s.commitments.find((x) => x.id === c.id).active = e.target.checked;
          }),
        }),
        h('span', {}, c.label)),
      h('span', { class: 'muted' }, isDebt ? 'lump-sum due' : 'EMI')),

    h('div', { class: 'form-grid' },
      field(isDebt ? 'Monthly payment (₹)' : 'Instalment (₹)', input(`amt-${c.id}`, {
        type: 'number', step: '1', min: '0', value: c.amount ?? 0, inputmode: 'numeric',
        onChange: (e) => app.update((s) => {
          s.commitments.find((x) => x.id === c.id).amount = Number(e.target.value) || 0;
        }),
      })),

      isDebt
        ? field('Total outstanding (₹)', input(`out-${c.id}`, {
            type: 'number', step: '1', min: '0', value: c.outstanding ?? 0, inputmode: 'numeric',
            onChange: (e) => app.update((s) => {
              s.commitments.find((x) => x.id === c.id).outstanding = Number(e.target.value) || 0;
            }),
          }), `as of ${cycleMonthLabel(c.anchorCycle)}`)
        : field('Instalments remaining', input(`rem-${c.id}`, {
            type: 'number', step: '1', min: '0', value: c.remainingMonths ?? '', placeholder: 'blank = ongoing', inputmode: 'numeric',
            onChange: (e) => app.update((s) => {
              const v = e.target.value.trim();
              s.commitments.find((x) => x.id === c.id).remainingMonths = v === '' ? null : Number(v);
            }),
          }), `counted from ${cycleMonthLabel(c.anchorCycle)}`),

      field('Anchor cycle', input(`anch-${c.id}`, {
        type: 'month', value: c.anchorCycle,
        onChange: (e) => app.update((s) => {
          s.commitments.find((x) => x.id === c.id).anchorCycle = e.target.value;
        }),
      })),

      field('Due day', input(`day-${c.id}`, {
        type: 'number', min: '1', max: '31', value: c.dayOfMonth ?? 1, inputmode: 'numeric',
        onChange: (e) => app.update((s) => {
          s.commitments.find((x) => x.id === c.id).dayOfMonth = Number(e.target.value) || 1;
        }),
      }))),

    !isDebt && c.remainingMonths
      ? h('p', { class: 'muted small' },
          `Total remaining: ${formatINR((c.amount ?? 0) * c.remainingMonths)} over ${c.remainingMonths} months.`)
      : null);
}

/* ---------------- backup actions ---------------- */

function restoreBackup(app) {
  const file = h('input', { type: 'file', accept: 'application/json', class: 'input' });
  modal('Restore from backup', h('div', {},
    field('Backup file', file, 'This replaces everything currently stored on this device.')),
    {
      submitLabel: 'Restore',
      onSubmit: async (_fd, close) => {
        const f = file.files?.[0];
        if (!f) return toast('Choose a file');
        try {
          const restored = importJSON(await f.text());
          app.replace(restored);
          close();
          toast('Backup restored');
        } catch {
          toast('That file could not be read');
        }
      },
    });
}

function wipe(app) {
  modal('Erase everything?', h('div', {},
    h('p', { class: 'prose' },
      'This deletes all inflows, expenses and payments on this device and resets '
      + 'your EMI settings. Download a backup first if you might want it back.'),
    field('Type ERASE to confirm', input('confirm', { type: 'text', autocomplete: 'off' }))),
    {
      submitLabel: 'Erase',
      onSubmit: (fd, close) => {
        if (fd.get('confirm') !== 'ERASE') return toast('Type ERASE to confirm');
        app.replace(reset());
        close();
        toast('Everything erased');
      },
    });
}

export { exportJSON };
