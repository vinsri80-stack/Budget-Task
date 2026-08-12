/**
 * storage.native.ts — the ONLY persistence change needed for React Native.
 *
 * Web uses localStorage (synchronous); AsyncStorage is promise-based, so load
 * and save become async. Everything above this file — models, cycle, calc — is
 * untouched.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyState, DEFAULT_COMMITMENTS, SCHEMA_VERSION } from '../core/models';
import type { BudgetState } from './types';

const KEY = 'budget-app:state:v1';

/** Same migration as the web build — keeps user edits, backfills new defaults. */
function migrate(raw: any): BudgetState {
  const base = emptyState();
  const state: BudgetState = { ...base, ...raw };
  state.settings = { ...base.settings, ...(raw.settings ?? {}) };

  const byId = new Map((raw.commitments ?? []).map((c: any) => [c.id, c]));
  state.commitments = DEFAULT_COMMITMENTS.map((d) => ({ ...d, ...(byId.get(d.id) ?? {}) }));
  for (const c of byId.values()) {
    if (!state.commitments.some((x) => x.id === (c as any).id)) state.commitments.push(c as any);
  }

  state.inflows = Array.isArray(raw.inflows) ? raw.inflows : [];
  state.expenses = Array.isArray(raw.expenses) ? raw.expenses : [];
  state.outflows = Array.isArray(raw.outflows) ? raw.outflows : [];
  state.schemaVersion = SCHEMA_VERSION;
  return state;
}

export async function load(): Promise<BudgetState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : emptyState();
  } catch (err) {
    console.warn('[storage] unreadable state, starting fresh', err);
    return emptyState();
  }
}

export async function save(state: BudgetState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[storage] save failed', err);
  }
}

/* --------------------------------------------------------------------
 * Optional cloud sync — identical contract to the web build.
 * Use @react-native-firebase/firestore, or point at any endpoint you like.
 * Nothing leaves the device until a sync code is set.
 * ------------------------------------------------------------------ */

export async function pushToCloud(state: BudgetState, syncCode: string) {
  if (!syncCode) return;
  await firestore()
    .collection('budgets')
    .doc(syncCode)
    .set({ payload: JSON.stringify(state), updatedAt: state.updatedAt });
}

export function subscribeToCloud(syncCode: string, onRemote: (s: BudgetState) => void) {
  if (!syncCode) return () => {};
  return firestore()
    .collection('budgets')
    .doc(syncCode)
    .onSnapshot((snap) => {
      const payload = snap.data()?.payload;
      if (payload) onRemote(migrate(JSON.parse(payload)));
    });
}
