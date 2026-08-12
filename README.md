# Budget — 15th → 14th cycle

A local-first budgeting app for a monthly cycle that runs **15th of one month to
the 14th of the next**. Tracks inflows, day-to-day spend, EMIs and long-term
dues, and consolidates every credit card expense into the *following* cycle's
payable block so you plan against the bill you will actually get.

Runs as an installable web app on Windows, macOS, Android and iOS from one
codebase. No build step, no dependencies.

---

## Run it

```bash
node budget-app/dev-server.mjs
```

Then open <http://localhost:5173>. (ES modules are blocked on `file://`, which
is why a server is needed for the modular source.)

Install it as a real app: in Chrome or Edge, the address bar shows an **Install**
icon; on iOS Safari use **Share → Add to Home Screen**. It then opens in its own
window, works offline, and keeps its own data.

### Single-file version

```bash
node budget-app/build.js
```

Produces `dist/budget.html` — every module and the stylesheet inlined into one
97 KB file. That one opens by double-click with no server, and can be copied to
a phone or emailed to yourself. Same code, same behaviour.

### Tests

```bash
node --test budget-app/tests/calc.test.mjs
```

18 tests over the cycle boundaries, card consolidation, EMI and debt schedules,
and carry-forward chaining.

---

## The cycle rule

Cycle `2026-08` means **15 Aug 2026 → 14 Sep 2026**, and is keyed by the month
it starts in. An expense is filed by its *date*, not by whichever tab you have
open — logging 16 Aug while viewing July drops it into August and tells you so.

**Credit card spend is not deducted from the cycle you spend it in.** It is
consolidated per card and becomes payable in the next cycle. So:

```
Jul cycle (15 Jul – 14 Aug):  ₹35,000 on SBI   → not in July's outflow
Aug cycle (15 Aug – 14 Sep):  ₹35,000 SBI due  → in August's outflow
```

GPay and Cash come out immediately and *are* counted in the cycle they happen.

---

## What it tracks

**Inflow** — previous cycle's closing balance carried forward automatically,
salary, rent income, and anything else. The carry-forward figure is computed by
walking the chain from your anchor cycle; you can override any single cycle by
entering a manual carry-forward row.

**Expenses** — GPay, Cash, Credit Card, across HDFC-6011, HDFC-4154, SBI, HSBC,
Axis1-7823, Axis2-4172, Axis3-1907 and Indus-1018.

**Outflow** — HDFC EMI HL1, HDFC EMI HL2, Indus PL EMI (₹18,000 × 18 months),
Chitra dues (₹4,50,000 at ₹50,000/month), and consolidated card payments.
Part-payments are supported and self-correct the remaining schedule.

**Set the HDFC HL1 and HL2 instalment amounts in Settings** — they ship at zero
because you have not given the figures, and the Outflow tab flags them as
`set up` until you do. Everything else is pre-loaded.

---

## Structure

```
budget-app/
├── index.html               shell
├── manifest.json            PWA install metadata
├── service-worker.js        offline cache (network-first)
├── css/styles.css           responsive + dark mode
├── js/
│   ├── models.js            enums, cards, commitments, record constructors
│   ├── cycle.js             15th → 14th date maths
│   ├── calc.js              all budgeting maths  ← the whole domain layer
│   ├── storage.js           localStorage + optional Firestore sync
│   ├── export.js            CSV / printable report builders
│   ├── app.js               state container, cycle switcher, tab router
│   └── ui/
│       ├── dom.js           ~70-line view layer (h/mount/card/row/modal)
│       ├── dashboard.js     summary cards, upcoming EMIs, trackers
│       ├── inflow.js  expenses.js  outflow.js  settings.js
├── tests/calc.test.mjs      18 tests, node --test
├── build.js                 → dist/budget.html
├── dev-server.mjs           zero-dependency static server
└── docs/
    ├── WIREFRAMES.md        dashboard + every tab
    └── react-native/        the RN port
```

`models.js`, `cycle.js` and `calc.js` import nothing — no DOM, no `window`. That
is deliberate: they are the files that move to React Native untouched. See
[docs/react-native/README.md](docs/react-native/README.md).

---

## Data model

```js
Inflow   { id, cycle, kind: carry_forward|salary|rent|other, amount, date, note }
Expense  { id, cycle, date, amount, method: gpay|cash|card, cardId, category, note }
Outflow  { id, cycle, commitmentId, cardId, amount, date, paid, note }   // a payment made

Commitment {
  id, label,
  type: emi|debt|card,
  amount,              // instalment, or monthly payment for a debt
  outstanding,         // debts only — total as of anchorCycle
  remainingMonths,     // EMIs only — instalments left as of anchorCycle, null = ongoing
  anchorCycle,         // 'YYYY-MM' — the cycle these figures are true for
  dayOfMonth, active,
}
```

Every projection is relative to `anchorCycle`, so correcting one number in
Settings re-bases every future schedule rather than requiring back-entry.

### Key functions (`js/calc.js`)

| Function                                | Answers                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| `consolidatedCardDues(state, cycle)`    | what you owe the cards **this** cycle (from last cycle's spend) |
| `cardDuesNextCycle(state, cycle)`       | what this cycle's card spend will cost you next cycle           |
| `emiStatusAt(commitment, cycle)`        | is it due, which instalment, how many left, final cycle         |
| `emiSchedule(commitment)`               | the full instalment table                                       |
| `debtStatusAt(state, commitment, cycle)`| Chitra outstanding, months left — netted against real payments  |
| `outflowRows(state, cycle)`             | every obligation with scheduled / paid / outstanding / status   |
| `openingBalance(state, cycle)`          | carry-forward, walked from the anchor (memoised)                |
| `cycleSummary(state, cycle)`            | everything the dashboard needs, in one object                   |
| `progressTrackers(state, cycle)`        | progress bars for Chitra, Indus PL and the home loans           |
| `upcomingObligations(state, cycle, n)`  | the next n cycles of scheduled outgoings                        |

---

## Storage and sync

Everything is in `localStorage` under `budget-app:state:v1` and never leaves the
device by default. **Cloud sync is off until you configure it**: paste a Firebase
web config into `FIREBASE_CONFIG` in [js/storage.js](js/storage.js) and set a
sync code in Settings. Devices sharing a code share the budget.

Backups don't need any of that — Settings → *Download backup (.json)*, and
*Restore from backup* to bring it back.

---

## Export

From the **Export** button in the header:

- **Printable report / PDF** — full cycle report, print to PDF from the dialog
- **This cycle — detailed CSV** — every line item, sectioned
- **Multi-cycle summary CSV** — one row per cycle over 3, 6 or 12 cycles
- **Full backup (.json)** — complete state, restorable
