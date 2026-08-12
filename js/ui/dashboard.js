/**
 * ui/dashboard.js — summary cards, upcoming obligations, progress trackers.
 */

import { h, tintedCard, statCard, row, progressBar, empty } from './dom.js';
import {
  cycleSummary,
  progressTrackers,
  upcomingObligations,
  formatINR,
  formatShortINR,
} from '../calc.js';
import { cycleMonthLabel, cycleProgress, cycleRangeLabel, nextCycle } from '../cycle.js';

export function renderDashboard(app) {
  const { state, cycle } = app;
  const s = cycleSummary(state, cycle);
  const prog = cycleProgress(cycle);
  // 'danger' rather than 'rose': the outflow tile is already rose, and two
  // identical crimson tiles side by side is exactly the wrong signal here.
  const netTone = s.net >= 0 ? 'violet' : 'danger';

  return [
    /* ---- cycle banner ---- */
    h('section', { class: 'cycle-banner' },
      h('div', { class: 'cycle-banner-head' },
        h('div', {},
          h('p', { class: 'cycle-banner-title' }, `Cycle ${cycleMonthLabel(cycle)}`),
          h('p', { class: 'cycle-banner-range' }, cycleRangeLabel(cycle))),
        h('span', { class: `pill ${prog.isCurrent ? 'pill-live' : ''}` },
          prog.isCurrent ? `${prog.daysLeft} days left` : `Day 1–${prog.total}`)),
      progressBar(prog.isCurrent ? prog.pct : 0, 'bar-cycle'),
      h('p', { class: 'cycle-banner-foot' },
        `Runs 15th → 14th · card spend here is billed in ${cycleMonthLabel(nextCycle(cycle))}`)),

    /* ---- headline stats ---- */
    h('div', { class: 'stat-grid' },
      statCard('Total inflow', formatINR(s.inflow.total), {
        tone: 'teal',
        caption: `${formatShortINR(s.inflow.carriedForward)} carried + ${formatShortINR(s.inflow.earned)} earned`,
      }),
      statCard('Total outflow', formatINR(s.outflow.total), {
        tone: 'rose',
        caption: `${formatShortINR(s.outflow.commitments)} committed + ${formatShortINR(s.outflow.dailySpend)} spend`,
      }),
      statCard('Net balance', formatINR(s.net), {
        tone: netTone,
        caption: `carries into ${cycleMonthLabel(nextCycle(cycle))}`,
      }),
      statCard('Still to pay', formatINR(s.unpaid), {
        tone: s.unpaid > 0 ? 'amber' : 'green',
        caption: s.unpaid > 0 ? 'unticked obligations' : 'everything settled',
      })),

    /* ---- upcoming EMIs ---- */
    tintedCard('violet', 'Upcoming obligations',
      ...upcomingObligations(state, cycle, 3).map((u) =>
        h('div', { class: 'upcoming-block' },
          h('div', { class: 'upcoming-head' },
            h('span', {}, cycleMonthLabel(u.cycle)),
            h('strong', {}, formatINR(u.total))),
          u.items.length
            ? h('ul', { class: 'chip-list' },
                ...u.items.map((i) =>
                  h('li', { class: `chip chip-${i.status}` },
                    h('span', {}, i.label),
                    h('span', { class: 'chip-amt' }, formatShortINR(i.amount)))))
            : empty('Nothing scheduled')))),

    /* ---- consolidated card dues ---- */
    tintedCard('rose', `Card dues this cycle · from ${cycleMonthLabel(s.cardDues.sourceCycle)} spend`,
      s.cardDues.total === 0
        ? empty('No card spend logged in the previous cycle.')
        : h('div', {},
            ...s.cardDues.cards.map((c) =>
              row(c.label, formatINR(c.due), {
                detail: c.settled ? 'paid' : `${formatINR(c.outstanding)} outstanding`,
                badge: c.settled ? 'paid' : c.paid > 0 ? 'part' : 'due',
                badgeTone: c.settled ? 'paid' : c.paid > 0 ? 'part' : 'due',
              })),
            s.cardDues.unassigned > 0 &&
              row('Unassigned card spend', formatINR(s.cardDues.unassigned), {
                detail: 'pick a card on those expenses', badge: 'fix', badgeTone: 'warn',
              }),
            row('Total', formatINR(s.cardDues.total), { class: 'row-total' }))),

    /* ---- next cycle preview ---- */
    tintedCard('blue', `Moving into ${cycleMonthLabel(s.nextCardDues.payableInCycle)}`,
      h('div', { class: 'next-due' },
        h('p', { class: 'next-due-value' }, formatINR(s.nextCardDues.total)),
        h('p', { class: 'next-due-label' }, 'consolidated card dues you will owe next cycle')),
      s.nextCardDues.cards.length
        ? h('ul', { class: 'chip-list' },
            ...s.nextCardDues.cards.map((c) =>
              h('li', { class: 'chip' }, h('span', {}, c.label), h('span', { class: 'chip-amt' }, formatShortINR(c.amount)))))
        : empty('No card spend logged this cycle yet.')),

    /* ---- long-term progress ---- */
    tintedCard('teal', 'Long-term dues',
      (() => {
        const trackers = progressTrackers(state, cycle);
        if (!trackers.length) return empty('Set EMI amounts in Settings to track them here.');
        return h('div', {},
          ...trackers.map((t, i) =>
            h('div', { class: 'tracker' },
              h('div', { class: 'tracker-head' },
                h('span', { class: `tracker-label dot dot-t${i % 5}` }, t.label),
                h('span', { class: 'tracker-remaining' }, `${formatShortINR(t.remaining)} left`)),
              progressBar(t.pct, t.pct >= 1 ? 'bar-done' : `bar-t${i % 5}`),
              h('p', { class: 'tracker-foot' },
                `${t.caption} · ${formatShortINR(t.perMonth)}/month · ${t.monthsLeft ?? '—'} months to go`
                + (t.finalCycle ? ` · ends ${cycleMonthLabel(t.finalCycle)}` : '')))));
      })()),
  ];
}
