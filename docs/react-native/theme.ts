/** theme.ts — the palette from css/styles.css, as plain tokens. */

export const T = {
  bg: '#f6f1e6',
  card: '#fffdf9',
  border: '#ecdfc9',
  borderStrong: '#d99a4e',
  text: '#23262b',
  textSecondary: '#6b6458',
  textMuted: '#a39a89',

  peach: '#f6d9c0',
  peachStrong: '#f0954a',
  peachInk: '#8a4d18',

  in: '#2f7d5d',
  inBg: '#e2f0e8',
  out: '#b4553d',
  outBg: '#f7e2dc',
  warn: '#a5761b',
  warnBg: '#f9edd6',
  bad: '#b03030',

  radius: 16,
  radiusSm: 10,
  space: 14,
} as const;

export const statusTone = (status: string) => {
  switch (status) {
    case 'paid': return { bg: T.inBg, fg: T.in };
    case 'part': return { bg: T.warnBg, fg: T.warn };
    case 'unset': return { bg: T.warnBg, fg: T.warn };
    default: return { bg: T.outBg, fg: T.out };
  }
};
