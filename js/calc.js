/**
 * calc.js — all budgeting maths. Pure functions over a state object.
 *
 * No DOM, no storage, no framework. This is the module that ports verbatim
 * to React Native / Flutter-via-JS-core. Everything here is deterministic:
 * same state + same cycle => same numbers.
 */

import {
  COMMITMENT_TYPE,
  INFLOW_KIND,
  PAY_METHOD,
  CARDS,
  cardLabel,
} from './models.js';
import {
  cyclesBetween,
  prevCycle,
  nextCycle,
  shiftCycle,
  cycleRange,
} from './cycle.js';

const MAX_LOOKBACK = 600; // 50 years of cycles — recursion guard

const sum = (arr, pick = (x) => x) => arr.reduce((t, x) => t + (Number(pick(x)) || 0), 0);

/* ================================================================== *
 * 1. Inflows
 * ================================================================== */

export function inflowsForCycle(state, cycle) {
  return state.inflows.filter((i) => i.cycle === cycle);
}

/**
 * Inflow breakdown for a cycle. The carry-forward line is *computed* from the
 * previous cycle's closing balance unless the user has entered an explicit
 * carry_forward row, which wins.
 */
export function inflowBreakdown(state, cycle) {
  const rows = inflowsForCycle(state, cycle);
  const manualCarry = rows.find((r) => r.kind === INFLOW_KIND.CARRY_FORWARD);

  const carriedForward = manualCarry
    ? manualCarry.amount
    : openingBalance(state, cycle);

  const salary = sum(rows.filter((r) => r.kind === INFLOW_KIND.SALARY), (r) => r.amount);
  const rent = sum(rows.filter((r) => r.kind === INFLOW_KIND.RENT), (r) => r.amount);
  const other = sum(rows.filter((r) => r.kind === INFLOW_KIND.OTHER), (r) => r.amount);

  return {
    carriedForward,
    carriedForwardIsManual: Boolean(manualCarry),
    salary,
    rent,
    other,
    earned: salary + rent + other,           // money that arrived this cycle
    total: carriedForward + salary + rent + other,
    rows,
  };
}

/* ================================================================== *
 * 2. Expenses
 * ================================================================== */

export function expensesForCycle(state, cycle) {
  return state.expenses.filter((e) => e.cycle === cycle);
}

export function expenseBreakdown(state, cycle) {
  const rows = expensesForCycle(state, cycle);
  const byMethod = {
    [PAY_METHOD.GPAY]: sum(rows.filter((e) => e.method === PAY_METHOD.GPAY), (e) => e.amount),
    [PAY_METHOD.CASH]: sum(rows.filter((e) => e.method === PAY_METHOD.CASH), (e) => e.amount),
    [PAY_METHOD.CARD]: sum(rows.filter((e) => e.method === PAY_METHOD.CARD), (e) => e.amount),
  };
  return {
    rows,
    byMethod,
    // Cash + GPay hit the bank *this* cycle. Card spend does not — it lands
    // next cycle as a card due, so it is excluded from this cycle's outflow.
    settledNow: byMethod[PAY_METHOD.GPAY] + byMethod[PAY_METHOD.CASH],
    onCard: byMethod[PAY_METHOD.CARD],
    total: byMethod[PAY_METHOD.GPAY] + byMethod[PAY_METHOD.CASH] + byMethod[PAY_METHOD.CARD],
  };
}

/* ================================================================== *
 * 3. Consolidated credit-card dues
 *
 * Card spend inside cycle N is consolidated into a single payable block in
 * cycle N+1. `consolidatedCardDues(state, cycle)` therefore answers:
 * "what do I owe the cards during THIS cycle?" by looking at last cycle's
 * card spend.
 * ================================================================== */

/** Per-card totals of card spend that OCCURRED inside `cycle`. */
export function cardSpendInCycle(state, cycle) {
  const rows = expensesForCycle(state, cycle).filter((e) => e.method === PAY_METHOD.CARD);
  const byCard = {};
  for (const card of CARDS) byCard[card.id] = 0;
  let unassigned = 0;
  for (const e of rows) {
    if (e.cardId && e.cardId in byCard) byCard[e.cardId] += e.amount;
    else unassigned += e.amount;
  }
  return { byCard, unassigned, total: sum(rows, (e) => e.amount) };
}

/**
 * What is payable to the cards during `cycle` — i.e. the consolidation of the
 * PREVIOUS cycle's card spend, netted against payments already recorded.
 *
 * @returns {{sourceCycle:string, cards:Array, total:number, paid:number,
 *            outstanding:number, unassigned:number}}
 */
export function consolidatedCardDues(state, cycle) {
  const sourceCycle = prevCycle(cycle);
  const spend = cardSpendInCycle(state, sourceCycle);

  const payments = state.outflows.filter(
    (o) => o.cycle === cycle && o.commitmentId === 'card-payments'
  );
  const paidByCard = {};
  for (const p of payments) {
    const key = p.cardId ?? '__unassigned__';
    paidByCard[key] = (paidByCard[key] ?? 0) + p.amount;
  }

  const cards = CARDS
    .map((card) => {
      const due = spend.byCard[card.id] ?? 0;
      const paid = paidByCard[card.id] ?? 0;
      return {
        cardId: card.id,
        label: cardLabel(card.id),
        issuer: card.issuer,
        due,
        paid,
        outstanding: Math.max(0, due - paid),
        settled: due > 0 && paid >= due,
      };
    })
    .filter((c) => c.due > 0 || c.paid > 0);

  const total = sum(cards, (c) => c.due) + spend.unassigned;
  const paid = sum(cards, (c) => c.paid) + (paidByCard.__unassigned__ ?? 0);

  return {
    sourceCycle,
    cards: cards.sort((a, b) => b.due - a.due),
    unassigned: spend.unassigned,
    total,
    paid,
    outstanding: Math.max(0, total - paid),
  };
}

/** Forward view: card spend logged in `cycle` becomes next cycle's bill. */
export function cardDuesNextCycle(state, cycle) {
  const spend = cardSpendInCycle(state, cycle);
  return {
    payableInCycle: nextCycle(cycle),
    cards: CARDS
      .map((c) => ({ cardId: c.id, label: cardLabel(c.id), amount: spend.byCard[c.id] ?? 0 }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    unassigned: spend.unassigned,
    total: spend.total,
  };
}

/* ================================================================== *
 * 4. EMI & debt schedules
 * ================================================================== */

/**
 * State of a fixed-tenure EMI at a given cycle.
 * `remainingMonths` on the commitment counts instalments left *including*
 * the anchor cycle's own instalment.
 */
export function emiStatusAt(commitment, cycle) {
  const elapsed = cyclesBetween(commitment.anchorCycle, cycle);
  const openEnded = commitment.remainingMonths == null;

  if (openEnded) {
    return {
      due: elapsed >= 0 && commitment.active,
      amount: elapsed >= 0 ? commitment.amount : 0,
      instalmentNo: elapsed >= 0 ? elapsed + 1 : 0,
      remainingAfter: null,
      totalInstalments: null,
      finalCycle: null,
      openEnded: true,
    };
  }

  const remainingBefore = commitment.remainingMonths - elapsed;
  const due = commitment.active && elapsed >= 0 && remainingBefore >= 1;

  return {
    due,
    amount: due ? commitment.amount : 0,
    instalmentNo: elapsed + 1,
    remainingBefore: Math.max(0, remainingBefore),
    remainingAfter: Math.max(0, remainingBefore - 1),
    totalInstalments: commitment.remainingMonths,
    finalCycle: shiftCycle(commitment.anchorCycle, commitment.remainingMonths - 1),
    openEnded: false,
  };
}

/** Full amortisation-style row list for an EMI, anchor cycle → final cycle. */
export function emiSchedule(commitment) {
  if (commitment.type !== COMMITMENT_TYPE.EMI) return [];
  const n = commitment.remainingMonths;
  if (n == null || n <= 0) return [];
  const rows = [];
  let outstanding = commitment.amount * n;
  for (let i = 0; i < n; i += 1) {
    const cycle = shiftCycle(commitment.anchorCycle, i);
    outstanding -= commitment.amount;
    rows.push({
      cycle,
      instalmentNo: i + 1,
      amount: commitment.amount,
      remainingAfter: n - i - 1,
      outstandingAfter: Math.max(0, outstanding),
    });
  }
  return rows;
}

/**
 * State of a lump-sum debt (Chitra) at a given cycle, self-correcting against
 * payments actually recorded since the anchor.
 */
export function debtStatusAt(state, commitment, cycle) {
  const elapsed = cyclesBetween(commitment.anchorCycle, cycle);
  if (elapsed < 0) {
    return { due: false, amount: 0, outstandingBefore: commitment.outstanding,
             outstandingAfter: commitment.outstanding, monthsLeft: null, finalCycle: null };
  }

  // Sum what was actually paid in every cycle strictly before this one.
  let paidSoFar = 0;
  for (let i = 0; i < elapsed && i < MAX_LOOKBACK; i += 1) {
    const c = shiftCycle(commitment.anchorCycle, i);
    paidSoFar += sum(
      state.outflows.filter((o) => o.cycle === c && o.commitmentId === commitment.id),
      (o) => o.amount
    );
  }

  const outstandingBefore = Math.max(0, commitment.outstanding - paidSoFar);
  const scheduled = Math.min(commitment.amount, outstandingBefore);
  const due = commitment.active && scheduled > 0;
  const monthsLeft = commitment.amount > 0
    ? Math.ceil(outstandingBefore / commitment.amount)
    : null;

  return {
    due,
    amount: due ? scheduled : 0,
    outstandingBefore,
    outstandingAfter: Math.max(0, outstandingBefore - scheduled),
    paidSoFar,
    monthsLeft,
    finalCycle: monthsLeft ? shiftCycle(cycle, monthsLeft - 1) : null,
    pctCleared: commitment.outstanding > 0
      ? Math.min(1, paidSoFar / commitment.outstanding)
      : 1,
  };
}

/* ================================================================== *
 * 5. Outflows for a cycle
 * ================================================================== */

/**
 * Every obligation in a cycle, with what was scheduled and what was paid.
 * `committed` is the number that hits the budget: the payment if one was
 * recorded, otherwise the scheduled amount (an unpaid EMI is still owed).
 */
export function outflowRows(state, cycle) {
  const rows = [];

  for (const c of state.commitments) {
    if (!c.active) continue;
    const payments = state.outflows.filter(
      (o) => o.cycle === cycle && o.commitmentId === c.id
    );
    const paid = sum(payments, (o) => o.amount);

    let scheduled = 0;
    let detail = null;
    let unconfigured = false;

    if (c.type === COMMITMENT_TYPE.EMI) {
      const st = emiStatusAt(c, cycle);
      scheduled = st.amount;
      unconfigured = !c.amount;
      detail = unconfigured
        ? 'Instalment amount not set — add it in Settings'
        : st.openEnded
          ? 'Ongoing'
          : st.due
            ? `Instalment ${st.instalmentNo} of ${st.totalInstalments} · ${st.remainingAfter} left after this`
            : 'Closed';
      if (!st.due && paid === 0) continue;
    } else if (c.type === COMMITMENT_TYPE.DEBT) {
      const st = debtStatusAt(state, c, cycle);
      scheduled = st.amount;
      detail = st.due
        ? `${formatShortINR(st.outstandingBefore)} outstanding · ~${st.monthsLeft} months left`
        : 'Cleared';
      if (!st.due && paid === 0) continue;
    } else if (c.type === COMMITMENT_TYPE.CARD) {
      const dues = consolidatedCardDues(state, cycle);
      scheduled = dues.total;
      detail = dues.total > 0
        ? `${dues.cards.length} card${dues.cards.length === 1 ? '' : 's'} · from ${dues.sourceCycle} spend`
        : 'No card spend last cycle';
      if (scheduled === 0 && paid === 0) continue;
    } else {
      scheduled = c.amount ?? 0;
      if (scheduled === 0 && paid === 0) continue;
    }

    rows.push({
      commitmentId: c.id,
      label: c.label,
      type: c.type,
      dayOfMonth: c.dayOfMonth ?? null,
      scheduled,
      paid,
      committed: payments.length > 0 ? paid : scheduled,
      outstanding: Math.max(0, scheduled - paid),
      status: unconfigured ? 'unset'
        : payments.length === 0 ? 'due'
        : paid >= scheduled ? 'paid' : 'part',
      unconfigured,
      detail,
    });
  }

  // Ad-hoc outflows that don't map to a configured commitment.
  const known = new Set(state.commitments.map((c) => c.id));
  const adhoc = state.outflows.filter((o) => o.cycle === cycle && !known.has(o.commitmentId));
  for (const o of adhoc) {
    rows.push({
      commitmentId: o.commitmentId,
      label: o.note || 'Other outflow',
      type: COMMITMENT_TYPE.OTHER,
      dayOfMonth: null,
      scheduled: o.amount,
      paid: o.amount,
      committed: o.amount,
      outstanding: 0,
      status: 'paid',
      detail: 'One-off',
    });
  }

  return rows.sort((a, b) => (a.dayOfMonth ?? 99) - (b.dayOfMonth ?? 99));
}

export function outflowBreakdown(state, cycle) {
  const rows = outflowRows(state, cycle);
  const expenses = expenseBreakdown(state, cycle);
  const commitments = sum(rows, (r) => r.committed);
  return {
    rows,
    commitments,                       // EMIs + debts + card payments
    dailySpend: expenses.settledNow,   // GPay + Cash spent this cycle
    total: commitments + expenses.settledNow,
    stillDue: sum(rows, (r) => r.outstanding),
    paid: sum(rows, (r) => r.paid),
  };
}

/* ================================================================== *
 * 6. Balances & summary
 * ================================================================== */

const _openingCache = new WeakMap();

/**
 * Opening balance of a cycle = closing balance of the one before it, walked
 * back to `settings.anchorCycle` where `settings.openingBalance` is the seed.
 * Memoised per state object.
 */
export function openingBalance(state, cycle) {
  let cache = _openingCache.get(state);
  if (!cache) {
    cache = new Map();
    _openingCache.set(state, cache);
  }
  if (cache.has(cycle)) return cache.get(cycle);

  const anchor = state.settings.anchorCycle;
  const elapsed = cyclesBetween(anchor, cycle);

  if (elapsed <= 0) {
    cache.set(cycle, state.settings.openingBalance || 0);
    return state.settings.openingBalance || 0;
  }
  if (elapsed > MAX_LOOKBACK) {
    cache.set(cycle, 0);
    return 0;
  }

  // Iterate forward from the anchor so deep histories don't blow the stack.
  let balance = state.settings.openingBalance || 0;
  for (let i = 0; i < elapsed; i += 1) {
    const c = shiftCycle(anchor, i);
    if (!cache.has(c)) cache.set(c, balance);
    balance = closingFrom(state, c, balance);
  }
  cache.set(cycle, balance);
  return balance;
}

/** Closing balance of `cycle` given its opening balance. */
function closingFrom(state, cycle, opening) {
  const rows = inflowsForCycle(state, cycle);
  const manualCarry = rows.find((r) => r.kind === INFLOW_KIND.CARRY_FORWARD);
  const carried = manualCarry ? manualCarry.amount : opening;
  const earned = sum(
    rows.filter((r) => r.kind !== INFLOW_KIND.CARRY_FORWARD),
    (r) => r.amount
  );
  const out = outflowBreakdown(state, cycle);
  return carried + earned - out.total;
}

/** Everything the dashboard needs for one cycle. */
export function cycleSummary(state, cycle) {
  const inflow = inflowBreakdown(state, cycle);
  const outflow = outflowBreakdown(state, cycle);
  const expenses = expenseBreakdown(state, cycle);
  const cardDues = consolidatedCardDues(state, cycle);
  const nextCardDues = cardDuesNextCycle(state, cycle);

  const net = inflow.total - outflow.total;

  return {
    cycle,
    inflow,
    outflow,
    expenses,
    cardDues,
    nextCardDues,
    net,                                  // closing balance / carry-forward
    surplus: inflow.earned - outflow.total, // this cycle alone, ignoring carry-in
    savingsRate: inflow.earned > 0
      ? (inflow.earned - outflow.total) / inflow.earned
      : 0,
    unpaid: outflow.stillDue,
  };
}

/* ================================================================== *
 * 7. Forward look & progress trackers
 * ================================================================== */

/** Scheduled obligations for the next `count` cycles, for the dashboard. */
export function upcomingObligations(state, fromCycle, count = 3) {
  return cycleRange(fromCycle, shiftCycle(fromCycle, count - 1)).map((cycle) => {
    const rows = outflowRows(state, cycle).filter((r) => r.scheduled > 0);
    return {
      cycle,
      total: sum(rows, (r) => r.scheduled),
      items: rows.map((r) => ({
        label: r.label,
        amount: r.scheduled,
        dayOfMonth: r.dayOfMonth,
        status: r.status,
      })),
    };
  });
}

/** Progress bars for long-running dues (Chitra, Indus PL, home loans). */
export function progressTrackers(state, cycle) {
  const out = [];

  for (const c of state.commitments) {
    if (c.type === COMMITMENT_TYPE.DEBT) {
      const st = debtStatusAt(state, c, cycle);
      out.push({
        id: c.id,
        label: c.label,
        kind: 'debt',
        original: c.outstanding,
        cleared: st.paidSoFar,
        remaining: st.outstandingBefore,
        pct: st.pctCleared,
        monthsLeft: st.monthsLeft,
        finalCycle: st.finalCycle,
        perMonth: c.amount,
        caption: `${formatShortINR(st.paidSoFar)} of ${formatShortINR(c.outstanding)} cleared`,
      });
    } else if (c.type === COMMITMENT_TYPE.EMI && c.remainingMonths != null && c.amount > 0) {
      const st = emiStatusAt(c, cycle);
      const done = Math.min(c.remainingMonths, Math.max(0, cyclesBetween(c.anchorCycle, cycle)));
      out.push({
        id: c.id,
        label: c.label,
        kind: 'emi',
        original: c.amount * c.remainingMonths,
        cleared: c.amount * done,
        remaining: c.amount * Math.max(0, c.remainingMonths - done),
        pct: c.remainingMonths > 0 ? done / c.remainingMonths : 1,
        monthsLeft: st.remainingBefore ?? 0,
        finalCycle: st.finalCycle,
        perMonth: c.amount,
        caption: `${done} of ${c.remainingMonths} instalments paid`,
      });
    }
  }

  return out;
}

/* ================================================================== *
 * 8. Formatting helpers (Indian numbering)
 * ================================================================== */

export function formatINR(n, { decimals = 0, sign = false } = {}) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = v < 0 ? '-₹' : sign && v > 0 ? '+₹' : '₹';
  return `${prefix}${s}`;
}

/** Two decimals at most, with trailing zeros dropped: 4.50 -> '4.5', 4.00 -> '4'. */
function trimDecimals(x, places) {
  return x.toFixed(places).replace(/\.?0+$/, '');
}

/** ₹4.5L / ₹1.2Cr / ₹18K — for tight card captions. */
export function formatShortINR(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${trimDecimals(a / 1e7, 2)}Cr`;
  if (a >= 1e5) return `${sign}₹${trimDecimals(a / 1e5, 2)}L`;
  if (a >= 1e3) return `${sign}₹${trimDecimals(a / 1e3, 1)}K`;
  return formatINR(v);
}
