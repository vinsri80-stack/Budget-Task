# React Native port

The point of the module layout is that **the entire domain layer moves across
untouched**. `models.js`, `cycle.js` and `calc.js` import nothing — no DOM, no
`window`, no browser API. Copy those three files into an Expo project and every
number in this document is already correct and already covered by
`tests/calc.test.mjs`, which runs unchanged under `node --test`.

Only two things are platform-specific, and both are isolated:

| Concern       | Web file            | React Native replacement                    |
| ------------- | ------------------- | ------------------------------------------- |
| Persistence   | `js/storage.js`     | swap the `driver` for AsyncStorage (below)   |
| Views         | `js/ui/*.js`        | rewrite in RN primitives (below)             |

`js/export.js` splits cleanly too: `cycleCSV`, `summaryCSV` and
`cycleReportHTML` are pure string builders — feed them to `expo-file-system` +
`expo-sharing` instead of a Blob download.

## Setup

```bash
npx create-expo-app budget --template blank-typescript
cd budget
npx expo install @react-native-async-storage/async-storage @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context expo-file-system expo-sharing expo-print
```

Then copy `js/models.js`, `js/cycle.js` and `js/calc.js` into `src/core/`.

## What is in this folder

These are reference implementations, not a runnable Expo project — they show the
seams and the two screens with real domain logic in them.

| File                  | Covers                                                     |
| --------------------- | ---------------------------------------------------------- |
| `storage.native.ts`   | the AsyncStorage driver — the one persistence change        |
| `BudgetContext.tsx`   | state container, mirrors `js/app.js`                        |
| `DashboardScreen.tsx` | summary cards, upcoming EMIs, card dues, progress trackers  |
| `ExpensesScreen.tsx`  | expense logging with the card-consolidation rule surfaced   |
| `App.tsx`             | bottom tab navigator, cycle switcher pinned in the header   |
| `theme.ts`            | the palette from `css/styles.css`                           |

**Not included:** `InflowScreen`, `OutflowScreen` and `SettingsScreen`, which
`App.tsx` imports. They are list + modal screens with no domain logic of their
own — port them from `js/ui/inflow.js`, `js/ui/outflow.js` and
`js/ui/settings.js` using the `Card` / `Row` / `Stat` components at the bottom
of `DashboardScreen.tsx`. They call `inflowBreakdown`, `outflowRows` and
`consolidatedCardDues`, all of which already exist in `core/calc`.

Also note `App.tsx` imports `cycleCSV` / `cycleReportHTML` from `core/export` —
split those pure string builders out of `js/export.js` and leave the
Blob/download half behind.

## Two things worth not getting wrong

1. **`update()` must clone before mutating.** `calc.openingBalance` memoises the
   carry-forward chain in a `WeakMap` keyed on the state object; mutating in
   place serves stale balances. `BudgetContext.tsx` does this correctly.
2. **File expenses by date, not by the visible tab.** `cycleForDate(date)` is
   what decides the cycle — see the `targetCycle` handling in
   `ExpensesScreen.tsx`.
