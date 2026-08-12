/**
 * lock.js — local PIN lock for this device.
 *
 * Not encryption and not a security boundary against someone with access to
 * this browser's devtools/storage — it only stops casual access (someone
 * picking up your phone or laptop). The PIN itself is never stored: only a
 * salted SHA-256 hash, via the platform's Web Crypto API.
 */

const HASH_KEY = 'budget-app:lock:hash';
const SALT_KEY = 'budget-app:lock:salt';
const SESSION_KEY = 'budget-app:lock:unlocked';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hasPin() {
  return !!localStorage.getItem(HASH_KEY);
}

/** Unlocked if no PIN is set, or this browser session already unlocked it. */
export function isUnlocked() {
  return !hasPin() || sessionStorage.getItem(SESSION_KEY) === 'true';
}

export async function setPin(pin) {
  const salt = randomSalt();
  const hash = await sha256Hex(salt + pin);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(HASH_KEY, hash);
  sessionStorage.setItem(SESSION_KEY, 'true');
}

export function clearPin() {
  localStorage.removeItem(HASH_KEY);
  localStorage.removeItem(SALT_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export async function tryUnlock(pin) {
  const salt = localStorage.getItem(SALT_KEY) || '';
  const hash = await sha256Hex(salt + pin);
  const ok = hash === localStorage.getItem(HASH_KEY);
  if (ok) sessionStorage.setItem(SESSION_KEY, 'true');
  return ok;
}

/** Re-locks immediately without clearing the PIN — next render shows the lock screen. */
export function lockNow() {
  sessionStorage.removeItem(SESSION_KEY);
}
