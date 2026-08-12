/**
 * ui/lockscreen.js — full-screen PIN entry, shown instead of the app when
 * a PIN is set and this browser session hasn't unlocked it yet.
 */

import { h } from './dom.js';
import { tryUnlock } from '../lock.js';

export function renderLockScreen(onUnlocked) {
  let pin = '';

  const msgEl = h('p', { class: 'lock-msg' }, 'Enter your PIN');
  const dotsEl = h('div', { class: 'lock-dots' });

  function paintDots() {
    dotsEl.replaceChildren();
    const slots = Math.max(pin.length, 4);
    for (let i = 0; i < slots; i += 1) {
      dotsEl.appendChild(h('span', { class: `lock-dot ${i < pin.length ? 'filled' : ''}` }));
    }
  }
  paintDots();

  function press(digit) {
    if (pin.length >= 8) return;
    pin += digit;
    paintDots();
  }

  function backspace() {
    pin = pin.slice(0, -1);
    paintDots();
  }

  async function submit() {
    if (!pin) return;
    const ok = await tryUnlock(pin);
    if (ok) {
      onUnlocked();
    } else {
      msgEl.textContent = 'Wrong PIN — try again';
      msgEl.classList.add('lock-error');
      pin = '';
      paintDots();
    }
  }

  const digitKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) =>
    h('button', { type: 'button', class: 'lock-key', onClick: () => press(n) }, n));

  const keypad = h('div', { class: 'lock-keypad' },
    ...digitKeys,
    h('button', { type: 'button', class: 'lock-key lock-key-ghost', onClick: backspace }, '⌫'),
    h('button', { type: 'button', class: 'lock-key', onClick: () => press('0') }, '0'),
    h('button', { type: 'button', class: 'lock-key lock-key-primary', onClick: submit }, '✓'));

  return h('div', { class: 'lock-screen' },
    h('div', { class: 'lock-card' },
      h('div', { class: 'lock-icon' }, '🔒'),
      h('h1', {}, 'Budget'),
      msgEl,
      dotsEl,
      keypad));
}
