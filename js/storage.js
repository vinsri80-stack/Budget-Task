/**
 * storage.js — local-first persistence with optional cloud sync.
 *
 * Local  : localStorage (web/desktop PWA). Swap `driver` for AsyncStorage or
 *          MMKV in React Native — that is the only file that needs changing.
 * Cloud  : optional Firebase Firestore, keyed by a sync code you choose.
 *          Nothing leaves the device until a sync code is entered.
 */

import { emptyState, SCHEMA_VERSION, DEFAULT_COMMITMENTS } from './models.js';

const KEY = 'budget-app:state:v1';
const SYNC_KEY = 'budget-app:sync-code';

/* ------------------------------------------------------------------ *
 * Storage driver — the single platform-specific seam.
 * ------------------------------------------------------------------ */

export const localDriver = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

let driver = localDriver;
export function setDriver(d) { driver = d; }

/* ------------------------------------------------------------------ *
 * Migration
 * ------------------------------------------------------------------ */

function migrate(raw) {
  const state = { ...emptyState(), ...raw };
  state.settings = { ...emptyState().settings, ...(raw.settings ?? {}) };

  // Ensure every default commitment exists, without clobbering user edits.
  const byId = new Map((raw.commitments ?? []).map((c) => [c.id, c]));
  state.commitments = DEFAULT_COMMITMENTS.map((d) => ({ ...d, ...(byId.get(d.id) ?? {}) }));
  for (const c of byId.values()) {
    if (!state.commitments.some((x) => x.id === c.id)) state.commitments.push(c);
  }

  state.inflows = Array.isArray(raw.inflows) ? raw.inflows : [];
  state.expenses = Array.isArray(raw.expenses) ? raw.expenses : [];
  state.outflows = Array.isArray(raw.outflows) ? raw.outflows : [];
  state.tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  state.schemaVersion = SCHEMA_VERSION;
  return state;
}

/* ------------------------------------------------------------------ *
 * Load / save
 * ------------------------------------------------------------------ */

export function load() {
  const raw = driver.get(KEY);
  if (!raw) return emptyState();
  try {
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('[storage] corrupt state, starting fresh', err);
    return emptyState();
  }
}

export function save(state) {
  state.updatedAt = new Date().toISOString();
  const ok = driver.set(KEY, JSON.stringify(state));
  if (ok) cloud.push(state);
  return ok;
}

export function reset() {
  driver.remove(KEY);
  return emptyState();
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  return migrate(JSON.parse(text));
}

/* ------------------------------------------------------------------ *
 * Optional cloud sync (Firebase Firestore)
 *
 * Paste your own Firebase web config into FIREBASE_CONFIG to enable it.
 * With no config the app is fully functional, entirely offline.
 * ------------------------------------------------------------------ */

const FIREBASE_CONFIG = null; // e.g. { apiKey: '…', projectId: '…', appId: '…' }

export const cloud = {
  enabled: false,
  status: 'off',
  _db: null,
  _code: driver.get(SYNC_KEY) || '',
  _onRemote: null,
  _suppress: false,

  get code() { return this._code; },

  /** @param {(state:object)=>void} onRemote called when another device writes */
  async init(onRemote) {
    this._onRemote = onRemote;
    if (!FIREBASE_CONFIG || !this._code) {
      this.status = FIREBASE_CONFIG ? 'no-code' : 'off';
      return this.status;
    }
    try {
      const [{ initializeApp }, fs, auth] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      ]);
      const app = initializeApp(FIREBASE_CONFIG);
      await auth.signInAnonymously(auth.getAuth(app));
      this._db = fs.getFirestore(app);
      this._fs = fs;
      this.enabled = true;
      this.status = 'connected';

      fs.onSnapshot(fs.doc(this._db, 'budgets', this._code), (snap) => {
        if (this._suppress) { this._suppress = false; return; }
        const data = snap.data();
        if (data?.payload && this._onRemote) {
          try { this._onRemote(migrate(JSON.parse(data.payload))); } catch { /* ignore */ }
        }
      });
    } catch (err) {
      console.warn('[cloud] sync unavailable, staying local', err);
      this.status = 'error';
    }
    return this.status;
  },

  setCode(code) {
    this._code = (code || '').trim();
    driver.set(SYNC_KEY, this._code);
  },

  async push(state) {
    if (!this.enabled || !this._code) return;
    try {
      this._suppress = true;
      await this._fs.setDoc(this._fs.doc(this._db, 'budgets', this._code), {
        payload: JSON.stringify(state),
        updatedAt: state.updatedAt,
      });
    } catch (err) {
      this._suppress = false;
      console.warn('[cloud] push failed', err);
    }
  },
};
