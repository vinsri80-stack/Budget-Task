/**
 * models.js — data models, enums and seed configuration.
 * Pure data + constructors. No DOM, no storage. Safe to import from React Native.
 */

export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const PAY_METHOD = {
  GPAY: 'gpay',
  CASH: 'cash',
  CARD: 'card',
};

export const PAY_METHOD_LABEL = {
  [PAY_METHOD.GPAY]: 'GPay',
  [PAY_METHOD.CASH]: 'Cash',
  [PAY_METHOD.CARD]: 'Credit Card',
};

export const INFLOW_KIND = {
  CARRY_FORWARD: 'carry_forward', // previous month closing balance
  SALARY: 'salary',
  RENT: 'rent',
  OTHER: 'other',
};

export const INFLOW_KIND_LABEL = {
  [INFLOW_KIND.CARRY_FORWARD]: 'Carried forward',
  [INFLOW_KIND.SALARY]: 'Salary',
  [INFLOW_KIND.RENT]: 'Rent income',
  [INFLOW_KIND.OTHER]: 'Other inflow',
};

export const COMMITMENT_TYPE = {
  EMI: 'emi',       // fixed instalment, finite tenure
  DEBT: 'debt',     // lump outstanding, paid down monthly
  CARD: 'card',     // credit card payment, amount derived from prior cycle
  OTHER: 'other',
};

export const TASK_STATUS = {
  OPEN: 'open',
  IN_PROCESS: 'in_process',
  COMPLETED: 'completed',
};

export const TASK_STATUS_LABEL = {
  [TASK_STATUS.OPEN]: 'Open',
  [TASK_STATUS.IN_PROCESS]: 'Follow-up / in process',
  [TASK_STATUS.COMPLETED]: 'Completed',
};

/* ------------------------------------------------------------------ *
 * Credit cards
 * ------------------------------------------------------------------ */

export const CARDS = [
  { id: 'hdfc-6011',  label: 'HDFC 6011',  issuer: 'HDFC',   last4: '6011' },
  { id: 'hdfc-4154',  label: 'HDFC 4154',  issuer: 'HDFC',   last4: '4154' },
  { id: 'sbi',        label: 'SBI',        issuer: 'SBI',    last4: '' },
  { id: 'hsbc',       label: 'HSBC',       issuer: 'HSBC',   last4: '' },
  { id: 'axis1-7823', label: 'Axis1 7823', issuer: 'Axis',   last4: '7823' },
  { id: 'axis2-4172', label: 'Axis2 4172', issuer: 'Axis',   last4: '4172' },
  { id: 'axis3-1907', label: 'Axis3 1907', issuer: 'Axis',   last4: '1907' },
  { id: 'indus-1018', label: 'Indus 1018', issuer: 'IndusInd', last4: '1018' },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export function cardLabel(cardId) {
  return CARD_BY_ID[cardId]?.label ?? cardId ?? 'Unknown card';
}

/* ------------------------------------------------------------------ *
 * Recurring commitments (outflow)
 *
 * `anchorCycle` is the cycle in which the stated figures are true. All
 * projections are computed relative to it, so correcting one number in
 * Settings re-bases every future schedule. Cycle keys are 'YYYY-MM' of the
 * cycle START month (the 15th).
 * ------------------------------------------------------------------ */

export const DEFAULT_ANCHOR_CYCLE = '2026-07';

export const DEFAULT_COMMITMENTS = [
  {
    id: 'hdfc-hl1',
    label: 'HDFC EMI HL1',
    type: COMMITMENT_TYPE.EMI,
    amount: 0,                       // set your instalment in Settings
    anchorCycle: DEFAULT_ANCHOR_CYCLE,
    remainingMonths: null,           // null = open-ended / not yet known
    dayOfMonth: 5,
    active: true,
  },
  {
    id: 'hdfc-hl2',
    label: 'HDFC EMI HL2',
    type: COMMITMENT_TYPE.EMI,
    amount: 0,
    anchorCycle: DEFAULT_ANCHOR_CYCLE,
    remainingMonths: null,
    dayOfMonth: 5,
    active: true,
  },
  {
    id: 'indus-pl',
    label: 'Indus PL EMI',
    type: COMMITMENT_TYPE.EMI,
    amount: 18000,
    anchorCycle: DEFAULT_ANCHOR_CYCLE,
    remainingMonths: 18,
    dayOfMonth: 5,
    active: true,
  },
  {
    id: 'chitra',
    label: 'Chitra dues',
    type: COMMITMENT_TYPE.DEBT,
    amount: 50000,                   // monthly payment
    outstanding: 450000,             // as of anchorCycle, before that cycle's payment
    anchorCycle: DEFAULT_ANCHOR_CYCLE,
    dayOfMonth: 1,
    active: true,
  },
  {
    id: 'card-payments',
    label: 'Credit card payments',
    type: COMMITMENT_TYPE.CARD,
    amount: null,                    // derived: previous cycle's card spend
    anchorCycle: DEFAULT_ANCHOR_CYCLE,
    dayOfMonth: 2,
    active: true,
  },
];

/* ------------------------------------------------------------------ *
 * Record constructors
 * ------------------------------------------------------------------ */

let idCounter = 0;
export function makeId(prefix = 'r') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/**
 * @param {{cycle:string, kind:string, amount:number, date?:string, note?:string}} data
 */
export function createInflow(data) {
  return {
    id: data.id ?? makeId('in'),
    cycle: data.cycle,
    kind: data.kind ?? INFLOW_KIND.OTHER,
    amount: Number(data.amount) || 0,
    date: data.date ?? null,
    note: data.note ?? '',
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

/**
 * @param {{cycle:string, date:string, amount:number, method:string,
 *          cardId?:string|null, category?:string, note?:string}} data
 */
export function createExpense(data) {
  const method = data.method ?? PAY_METHOD.GPAY;
  return {
    id: data.id ?? makeId('ex'),
    cycle: data.cycle,
    date: data.date,
    amount: Number(data.amount) || 0,
    method,
    cardId: method === PAY_METHOD.CARD ? (data.cardId ?? null) : null,
    category: data.category ?? '',
    note: data.note ?? '',
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

/**
 * A payment actually made against a commitment in a given cycle.
 * Absence of a payment means the scheduled amount is still *due*.
 * @param {{cycle:string, commitmentId:string, amount:number,
 *          cardId?:string|null, date?:string, note?:string}} data
 */
export function createOutflow(data) {
  return {
    id: data.id ?? makeId('out'),
    cycle: data.cycle,
    commitmentId: data.commitmentId,
    cardId: data.cardId ?? null,     // for card-payment rows
    amount: Number(data.amount) || 0,
    date: data.date ?? null,
    paid: data.paid ?? true,
    note: data.note ?? '',
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

/**
 * A professional task — not tied to a budget cycle. `due` is a plain
 * 'YYYY-MM-DD' or null. `status` drives the board column (see js/tasks.js);
 * the due date alone decides Today's Dues vs Current Week.
 * @param {{title:string, owner?:string, due?:string|null,
 *          description?:string, status?:string}} data
 */
export function createTask(data) {
  return {
    id: data.id ?? makeId('task'),
    title: data.title,
    owner: data.owner ?? '',
    due: data.due || null,
    description: data.description ?? '',
    status: data.status ?? TASK_STATUS.OPEN,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Empty state
 * ------------------------------------------------------------------ */

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      currency: 'INR',
      cycleStartDay: 15,
      openingBalance: 0,             // balance at the start of anchorCycle
      anchorCycle: DEFAULT_ANCHOR_CYCLE,
      syncCode: '',
    },
    commitments: DEFAULT_COMMITMENTS.map((c) => ({ ...c })),
    inflows: [],
    expenses: [],
    outflows: [],
    tasks: [],
    updatedAt: new Date().toISOString(),
  };
}
