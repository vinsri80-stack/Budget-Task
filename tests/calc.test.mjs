/**
 * Run with:  node --test tests/
 * Covers the cycle boundary, card consolidation, EMI/debt schedules and
 * carry-forward chaining — the parts where a wrong number is expensive.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cycleForDate, currentCycle, nextCycle, prevCycle, shiftCycle,
  cyclesBetween, cycleRangeLabel, cycleStartDate, cycleEndDate,
} from '../js/cycle.js';
import {
  emptyState, createInflow, createExpense, createOutflow,
  INFLOW_KIND, PAY_METHOD,
} from '../js/models.js';
import {
  cycleSummary, consolidatedCardDues, cardDuesNextCycle,
  emiStatusAt, emiSchedule, debtStatusAt, progressTrackers,
  outflowRows, openingBalance, formatINR, formatShortINR,
} from '../js/calc.js';

/* ---------------- fixtures ---------------- */

function seed() {
  const s = emptyState();
  s.settings.anchorCycle = '2026-07';
  s.settings.openingBalance = 100000;
  for (const c of s.commitments) c.anchorCycle = '2026-07';
  const hl1 = s.commitments.find((c) => c.id === 'hdfc-hl1');
  hl1.amount = 45000; hl1.remainingMonths = 60;
  const hl2 = s.commitments.find((c) => c.id === 'hdfc-hl2');
  hl2.amount = 32000; hl2.remainingMonths = 48;
  return s;
}

const inflow = (s, cycle, kind, amount) => s.inflows.push(createInflow({ cycle, kind, amount }));
const spend = (s, cycle, date, amount, method, cardId) =>
  s.expenses.push(createExpense({ cycle, date, amount, method, cardId }));

/* ================= cycle boundaries ================= */

test('cycle runs 15th to 14th', () => {
  assert.equal(cycleForDate('2026-08-15'), '2026-08');
  assert.equal(cycleForDate('2026-08-31'), '2026-08');
  assert.equal(cycleForDate('2026-09-14'), '2026-08');
  assert.equal(cycleForDate('2026-09-15'), '2026-09');
  assert.equal(cycleForDate('2026-08-14'), '2026-07');
  assert.equal(cycleForDate('2026-08-01'), '2026-07');
});

test('cycle boundaries at year end', () => {
  assert.equal(cycleForDate('2026-12-20'), '2026-12');
  assert.equal(cycleForDate('2027-01-14'), '2026-12');
  assert.equal(cycleForDate('2027-01-15'), '2027-01');
  assert.equal(nextCycle('2026-12'), '2027-01');
  assert.equal(prevCycle('2027-01'), '2026-12');
  assert.equal(shiftCycle('2026-07', 18), '2028-01');
  assert.equal(shiftCycle('2026-07', 17), '2027-12'); // last Indus PL instalment
  assert.equal(cyclesBetween('2026-07', '2027-01'), 6);
  assert.equal(cyclesBetween('2027-01', '2026-07'), -6);
});

test('cycle start and end dates', () => {
  const s = cycleStartDate('2026-08');
  const e = cycleEndDate('2026-08');
  assert.equal(s.getDate(), 15);
  assert.equal(s.getMonth(), 7);
  assert.equal(e.getDate(), 14);
  assert.equal(e.getMonth(), 8);
  assert.equal(cycleRangeLabel('2026-08'), '15 Aug – 14 Sep 2026');
});

/* ================= card consolidation ================= */

test('card spend consolidates into the NEXT cycle', () => {
  const s = seed();
  spend(s, '2026-07', '2026-07-20', 12000, PAY_METHOD.CARD, 'hdfc-6011');
  spend(s, '2026-07', '2026-08-02', 8000, PAY_METHOD.CARD, 'axis1-7823');
  spend(s, '2026-07', '2026-07-22', 5000, PAY_METHOD.GPAY);

  // Nothing owed to cards in July — July's spend is billed in August.
  assert.equal(consolidatedCardDues(s, '2026-07').total, 0);

  const aug = consolidatedCardDues(s, '2026-08');
  assert.equal(aug.sourceCycle, '2026-07');
  assert.equal(aug.total, 20000);
  assert.equal(aug.outstanding, 20000);
  assert.equal(aug.cards.length, 2);
  assert.equal(aug.cards.find((c) => c.cardId === 'hdfc-6011').due, 12000);

  const fwd = cardDuesNextCycle(s, '2026-07');
  assert.equal(fwd.payableInCycle, '2026-08');
  assert.equal(fwd.total, 20000);
});

test('card spend is excluded from the cycle it was made in', () => {
  const s = seed();
  for (const c of s.commitments) c.active = false;
  inflow(s, '2026-07', INFLOW_KIND.SALARY, 200000);
  spend(s, '2026-07', '2026-07-20', 30000, PAY_METHOD.CARD, 'sbi');
  spend(s, '2026-07', '2026-07-21', 10000, PAY_METHOD.GPAY);
  spend(s, '2026-07', '2026-07-22', 5000, PAY_METHOD.CASH);

  const jul = cycleSummary(s, '2026-07');
  assert.equal(jul.expenses.total, 45000);
  assert.equal(jul.outflow.dailySpend, 15000);   // GPay + Cash only
  assert.equal(jul.outflow.total, 15000);
  assert.equal(jul.net, 100000 + 200000 - 15000);
});

test('per-card payments settle the right card', () => {
  const s = seed();
  spend(s, '2026-07', '2026-07-20', 12000, PAY_METHOD.CARD, 'hdfc-6011');
  spend(s, '2026-07', '2026-07-21', 8000, PAY_METHOD.CARD, 'hsbc');
  s.outflows.push(createOutflow({
    cycle: '2026-08', commitmentId: 'card-payments', cardId: 'hdfc-6011', amount: 12000,
  }));

  const dues = consolidatedCardDues(s, '2026-08');
  assert.equal(dues.paid, 12000);
  assert.equal(dues.outstanding, 8000);
  assert.equal(dues.cards.find((c) => c.cardId === 'hdfc-6011').settled, true);
  assert.equal(dues.cards.find((c) => c.cardId === 'hsbc').settled, false);
});

test('card spend without a card id is surfaced, not lost', () => {
  const s = seed();
  s.expenses.push({
    id: 'x1', cycle: '2026-07', date: '2026-07-20', amount: 4000,
    method: PAY_METHOD.CARD, cardId: null, category: '', note: '',
  });
  const dues = consolidatedCardDues(s, '2026-08');
  assert.equal(dues.unassigned, 4000);
  assert.equal(dues.total, 4000);
});

/* ================= EMIs ================= */

test('Indus PL: 18000 x 18 months from the anchor', () => {
  const s = seed();
  const pl = s.commitments.find((c) => c.id === 'indus-pl');
  assert.equal(pl.amount, 18000);
  assert.equal(pl.remainingMonths, 18);

  const first = emiStatusAt(pl, '2026-07');
  assert.equal(first.due, true);
  assert.equal(first.instalmentNo, 1);
  assert.equal(first.remainingAfter, 17);
  assert.equal(first.finalCycle, '2027-12');

  const last = emiStatusAt(pl, '2027-12');
  assert.equal(last.due, true);
  assert.equal(last.instalmentNo, 18);
  assert.equal(last.remainingAfter, 0);

  const after = emiStatusAt(pl, '2028-01');
  assert.equal(after.due, false);
  assert.equal(after.amount, 0);

  const sched = emiSchedule(pl);
  assert.equal(sched.length, 18);
  assert.equal(sched.reduce((t, r) => t + r.amount, 0), 324000);
  assert.equal(sched.at(-1).outstandingAfter, 0);
});

test('open-ended EMI never expires', () => {
  const s = seed();
  const c = { ...s.commitments[0], amount: 45000, remainingMonths: null, anchorCycle: '2026-07', active: true };
  assert.equal(emiStatusAt(c, '2030-01').due, true);
  assert.equal(emiStatusAt(c, '2026-06').due, false); // before the anchor
});

/* ================= Chitra debt ================= */

test('Chitra: 4.5L at 50k a month clears in 9 cycles', () => {
  const s = seed();
  const chitra = s.commitments.find((c) => c.id === 'chitra');
  assert.equal(chitra.outstanding, 450000);
  assert.equal(chitra.amount, 50000);

  const start = debtStatusAt(s, chitra, '2026-07');
  assert.equal(start.amount, 50000);
  assert.equal(start.outstandingBefore, 450000);
  assert.equal(start.monthsLeft, 9);

  // Pay all nine instalments.
  for (let i = 0; i < 9; i += 1) {
    s.outflows.push(createOutflow({
      cycle: shiftCycle('2026-07', i), commitmentId: 'chitra', amount: 50000,
    }));
  }

  const mid = debtStatusAt(s, chitra, '2026-11');
  assert.equal(mid.paidSoFar, 200000);
  assert.equal(mid.outstandingBefore, 250000);
  assert.equal(mid.monthsLeft, 5);

  const done = debtStatusAt(s, chitra, '2027-04'); // 9 cycles after 2026-07
  assert.equal(done.outstandingBefore, 0);
  assert.equal(done.due, false);
  assert.equal(done.pctCleared, 1);

  assert.equal(outflowRows(s, '2027-04').some((r) => r.commitmentId === 'chitra'), false);
});

test('a short Chitra payment leaves the balance owing', () => {
  const s = seed();
  const chitra = s.commitments.find((c) => c.id === 'chitra');
  s.outflows.push(createOutflow({ cycle: '2026-07', commitmentId: 'chitra', amount: 20000 }));

  const next = debtStatusAt(s, chitra, '2026-08');
  assert.equal(next.paidSoFar, 20000);
  assert.equal(next.outstandingBefore, 430000);
  assert.equal(next.monthsLeft, 9); // ceil(430000 / 50000)

  const row = outflowRows(s, '2026-07').find((r) => r.commitmentId === 'chitra');
  assert.equal(row.scheduled, 50000);
  assert.equal(row.paid, 20000);
  assert.equal(row.outstanding, 30000);
  assert.equal(row.status, 'part');
});

test('final Chitra instalment is capped at the remaining balance', () => {
  const s = seed();
  const chitra = s.commitments.find((c) => c.id === 'chitra');
  chitra.outstanding = 120000; // 2 full + 1 part
  for (let i = 0; i < 2; i += 1) {
    s.outflows.push(createOutflow({ cycle: shiftCycle('2026-07', i), commitmentId: 'chitra', amount: 50000 }));
  }
  const third = debtStatusAt(s, chitra, '2026-09');
  assert.equal(third.outstandingBefore, 20000);
  assert.equal(third.amount, 20000);   // not 50000
  assert.equal(third.monthsLeft, 1);
});

/* ================= carry forward ================= */

test('closing balance carries into the next cycle', () => {
  const s = seed();
  for (const c of s.commitments) c.active = false;

  inflow(s, '2026-07', INFLOW_KIND.SALARY, 250000);
  inflow(s, '2026-07', INFLOW_KIND.RENT, 25000);
  spend(s, '2026-07', '2026-07-20', 40000, PAY_METHOD.GPAY);

  const jul = cycleSummary(s, '2026-07');
  assert.equal(jul.inflow.carriedForward, 100000);
  assert.equal(jul.inflow.total, 375000);
  assert.equal(jul.net, 335000);

  const aug = cycleSummary(s, '2026-08');
  assert.equal(aug.inflow.carriedForward, 335000);
  assert.equal(openingBalance(s, '2026-08'), 335000);

  // Three cycles later, with nothing in between, the balance is unchanged.
  assert.equal(openingBalance(s, '2026-10'), 335000);
});

test('a manual carry-forward row overrides the computed one', () => {
  const s = seed();
  for (const c of s.commitments) c.active = false;
  inflow(s, '2026-07', INFLOW_KIND.SALARY, 250000);
  inflow(s, '2026-08', INFLOW_KIND.CARRY_FORWARD, 111111);

  const aug = cycleSummary(s, '2026-08');
  assert.equal(aug.inflow.carriedForward, 111111);
  assert.equal(aug.inflow.carriedForwardIsManual, true);
  assert.equal(aug.inflow.total, 111111);
});

/* ================= full-cycle integration ================= */

test('a realistic cycle adds up end to end', () => {
  const s = seed();
  // July: earn, spend, put some on cards.
  inflow(s, '2026-07', INFLOW_KIND.SALARY, 300000);
  inflow(s, '2026-07', INFLOW_KIND.RENT, 30000);
  spend(s, '2026-07', '2026-07-18', 20000, PAY_METHOD.GPAY);
  spend(s, '2026-07', '2026-07-19', 5000, PAY_METHOD.CASH);
  spend(s, '2026-07', '2026-07-25', 35000, PAY_METHOD.CARD, 'hdfc-6011');
  spend(s, '2026-07', '2026-08-03', 15000, PAY_METHOD.CARD, 'sbi');

  const jul = cycleSummary(s, '2026-07');
  // Inflow: 100000 carried + 330000 earned
  assert.equal(jul.inflow.total, 430000);
  // Outflow: HL1 45000 + HL2 32000 + PL 18000 + Chitra 50000 = 145000 committed,
  // no card dues (nothing spent in June), + 25000 day-to-day.
  assert.equal(jul.outflow.commitments, 145000);
  assert.equal(jul.outflow.dailySpend, 25000);
  assert.equal(jul.outflow.total, 170000);
  assert.equal(jul.net, 260000);
  assert.equal(jul.nextCardDues.total, 50000);
  assert.equal(jul.nextCardDues.payableInCycle, '2026-08');

  // August: the 50000 of July card spend now falls due.
  inflow(s, '2026-08', INFLOW_KIND.SALARY, 300000);
  const aug = cycleSummary(s, '2026-08');
  assert.equal(aug.inflow.carriedForward, 260000);
  assert.equal(aug.cardDues.total, 50000);
  assert.equal(aug.outflow.commitments, 145000 + 50000);
  assert.equal(aug.net, 260000 + 300000 - 195000);
  assert.equal(aug.unpaid, 195000); // nothing ticked off yet
});

test('progress trackers report both debt and EMI', () => {
  const s = seed();
  s.outflows.push(createOutflow({ cycle: '2026-07', commitmentId: 'chitra', amount: 50000 }));
  const t = progressTrackers(s, '2026-08');

  const chitra = t.find((x) => x.id === 'chitra');
  assert.equal(chitra.cleared, 50000);
  assert.equal(chitra.remaining, 400000);
  assert.ok(Math.abs(chitra.pct - 1 / 9) < 1e-9);

  const pl = t.find((x) => x.id === 'indus-pl');
  assert.equal(pl.original, 324000);
  assert.equal(pl.cleared, 18000);       // one cycle elapsed
  assert.equal(pl.remaining, 306000);
  assert.equal(pl.monthsLeft, 17);
});

/* ================= formatting ================= */

test('Indian number formatting', () => {
  assert.equal(formatINR(450000), '₹4,50,000');
  assert.equal(formatINR(18000), '₹18,000');
  assert.equal(formatINR(-5000), '-₹5,000');
  assert.equal(formatShortINR(450000), '₹4.5L');
  assert.equal(formatShortINR(18000), '₹18K');
  assert.equal(formatShortINR(12000000), '₹1.2Cr');
  assert.equal(formatShortINR(500), '₹500');
});

test('currentCycle agrees with cycleForDate', () => {
  assert.equal(currentCycle(new Date(2026, 7, 1)), '2026-07');
  assert.equal(currentCycle(new Date(2026, 7, 15)), '2026-08');
});
