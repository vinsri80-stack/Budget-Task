/**
 * BudgetContext.tsx — state container. Mirrors the `app` object in js/app.js.
 *
 * Note `update()` clones before mutating: `calc.openingBalance` memoises the
 * carry-forward chain in a WeakMap keyed on the state object, so a fresh object
 * is what invalidates the cache. Mutating in place would serve stale balances.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { currentCycle } from '../core/cycle';
import { emptyState } from '../core/models';
import { cycleSummary } from '../core/calc';
import { load, save } from './storage.native';
import type { BudgetState } from './types';

type Ctx = {
  state: BudgetState;
  cycle: string;
  ready: boolean;
  setCycle: (c: string) => void;
  update: (mutator: (draft: BudgetState) => void) => void;
  replace: (s: BudgetState) => void;
};

const BudgetCtx = createContext<Ctx | null>(null);

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BudgetState>(emptyState);
  const [cycle, setCycle] = useState(() => currentCycle());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load().then((s) => { setState(s); setReady(true); });
  }, []);

  const update = useCallback((mutator: (draft: BudgetState) => void) => {
    setState((prev) => {
      const next: BudgetState = JSON.parse(JSON.stringify(prev));
      mutator(next);
      save(next);
      return next;
    });
  }, []);

  const replace = useCallback((s: BudgetState) => {
    setState(s);
    save(s);
  }, []);

  const value = useMemo(
    () => ({ state, cycle, ready, setCycle, update, replace }),
    [state, cycle, ready, update, replace]
  );

  return <BudgetCtx.Provider value={value}>{children}</BudgetCtx.Provider>;
}

export function useBudget() {
  const ctx = useContext(BudgetCtx);
  if (!ctx) throw new Error('useBudget must be used inside <BudgetProvider>');
  return ctx;
}

/** Recomputed only when the state object or cycle changes. */
export function useSummary() {
  const { state, cycle } = useBudget();
  return useMemo(() => cycleSummary(state, cycle), [state, cycle]);
}
