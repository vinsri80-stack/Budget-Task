# UI wireframes

The layout is one column on mobile and a wider centred column on desktop.
Tabs sit under the header on desktop and become a fixed bottom bar on mobile.

---

## Shell — persistent chrome on every tab

```
┌──────────────────────────────────────────────────────────┐
│  Budget                              [ Export ] [ Today ]│
│  15 Aug – 14 Sep 2026 · 15th → 14th                      │
│                                                          │
│  ┌───┐ ┌──────────────────────────────────────┐ ┌───┐    │
│  │ ‹ │ │            Aug 2026                  │ │ › │    │  ← tap centre
│  └───┘ │      net ₹75,000 · 12d left          │ └───┘    │    to jump cycle
│        └──────────────────────────────────────┘          │
│                                                          │
│  ◎ Dashboard │ ↓ Inflow │ ≡ Expenses │ ↑ Outflow │ ⚙     │
│  ━━━━━━━━━━━━                                            │
└──────────────────────────────────────────────────────────┘
```

The cycle is never ambiguous: the range is in the subtitle, the month is in the
switcher, and the dashboard repeats it in a banner with a day-progress bar.

---

## Dashboard

```
┌──────────────────────────────────────────────────────────┐
│  Cycle Aug 2026                          [ 12 days left ]│  ← peach banner
│  15 Aug – 14 Sep 2026                                    │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░               │  ← days elapsed
│  Runs 15th → 14th · card spend here is billed in Sep     │
└──────────────────────────────────────────────────────────┘

┌────────────┬────────────┬────────────┬────────────┐
│ Total      │ Total      │ Net        │ Still      │      ← 4 summary cards
│ inflow     │ outflow    │ balance    │ to pay     │        (2×2 on mobile)
│            │            │            │            │
│ ₹2,55,000  │ ₹1,80,000  │  ₹75,000   │ ₹1,80,000  │
│ ₹2.55L     │ ₹1.45L com-│ carries    │ unticked   │
│ carried +  │ mitted +   │ into       │ obligat-   │
│ ₹0 earned  │ ₹0 spend   │ Sep 2026   │ ions       │
└────────────┴────────────┴────────────┴────────────┘
   green         red         green/red     amber

┌─ UPCOMING OBLIGATIONS ───────────────────────────────────┐
│  Aug 2026                                     ₹1,80,000  │
│  (Chitra ₹50K) (Cards ₹35K) (HL1 ₹45K) (HL2 ₹32K)        │  ← pill chips,
│  (Indus PL ₹18K)                                         │    colour = status
│  ──────────────────────────────────────────────────────  │
│  Sep 2026                                     ₹1,45,000  │
│  (Chitra ₹50K) (HL1 ₹45K) (HL2 ₹32K) (Indus PL ₹18K)     │
│  ──────────────────────────────────────────────────────  │
│  Oct 2026                                     ₹1,45,000  │
└──────────────────────────────────────────────────────────┘

┌─ CARD DUES THIS CYCLE · FROM JUL 2026 SPEND ─────────────┐
│  SBI                                                     │
│  ₹35,000 outstanding               ₹35,000     [ due ]   │
│  ══════════════════════════════════════════════════════  │
│  Total                                        ₹35,000    │
└──────────────────────────────────────────────────────────┘

┌─ MOVING INTO SEP 2026 ───────────────────────────────────┐
│                                                          │
│                       ₹52,000                            │  ← big number:
│        consolidated card dues you will owe next cycle    │    plan against it
│                                                          │
│  (HDFC 6011 ₹30K) (Axis1 7823 ₹22K)                      │
└──────────────────────────────────────────────────────────┘

┌─ LONG-TERM DUES ─────────────────────────────────────────┐
│  Chitra dues                                  ₹4L left   │
│  ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │
│  ₹50K of ₹4.5L cleared · ₹50K/month · 8 months to go     │
│  ──────────────────────────────────────────────────────  │
│  Indus PL EMI                              ₹3.06L left   │
│  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │
│  1 of 18 instalments paid · ₹18K/month · ends Dec 2027    │
└──────────────────────────────────────────────────────────┘
```

---

## Inflow tab

```
┌─ CARRIED FORWARD ────────────────────────────────────────┐
│  Closing balance of Jul 2026                             │
│  calculated automatically      ₹2,55,000      [ auto ]   │
└──────────────────────────────────────────────────────────┘

┌─ MONEY IN THIS CYCLE ────────────────────────────────────┐
│  Salary                                                  │
│  15 Aug                                  ₹3,00,000   ×   │
│  Rent income                                             │
│  20 Aug · Tenant                            ₹25,000  ×   │
│  ══════════════════════════════════════════════════════  │
│  Total earned                             ₹3,25,000      │
│                                                          │
│  [ + Add inflow ]  [ Add rent ]                          │
└──────────────────────────────────────────────────────────┘

┌─ TOTAL INFLOW ───────────────────────────────────────────┐
│  Carried forward + earned · Aug 2026      ₹5,80,000      │
└──────────────────────────────────────────────────────────┘
```

---

## Expenses tab

```
┌──────────┬──────────┬──────────┐
│  GPay    │  Cash    │  Credit  │
│          │          │  Card    │
│  ₹18K    │  ₹6K     │  ₹52K    │
│ 24% of   │ 8% of    │ bills in │      ← the card tile says when, not what %
│ spend    │ spend    │ Sep 2026 │
└──────────┴──────────┴──────────┘

┌──────────────────────────────────────────────────────────┐
│  (All) (GPay) (Cash) (Card)            [ + Log expense ] │
│                                                          │
│  Flight booking                                          │
│  25 Aug · Credit Card · HDFC 6011  ₹30,000 [next cycle] ×│
│  Groceries                                               │
│  22 Aug · GPay · Food                 ₹4,200           × │
│  ══════════════════════════════════════════════════════  │
│  Total logged                             ₹34,200        │
└──────────────────────────────────────────────────────────┘

┌─ CARD SPEND CONSOLIDATING INTO SEP 2026 ─────────────────┐
│  HDFC 6011                                    ₹30,000    │
│  Axis1 7823                                   ₹22,000    │
│  ══════════════════════════════════════════════════════  │
│  Total due next cycle                         ₹52,000    │
└──────────────────────────────────────────────────────────┘
```

The expense modal shows the **Card** dropdown only when the method is Credit
Card, and files the expense by its *date*, not by the tab you are looking at —
logging 16 Aug while viewing July drops it into the August cycle and says so.

---

## Outflow tab

```
┌──────────┬──────────┬──────────┐
│ Committed│  Paid    │Still due │
│ ₹1,80,000│ ₹95,000  │ ₹85,000  │
└──────────┴──────────┴──────────┘

┌─ EMIS & FIXED DUES ──────────────────────────────────────┐
│  Chitra dues                                             │
│  due ~1st · ₹4.5L outstanding · ~9 months left           │
│                                    ₹50,000  [due] [Pay]  │
│  HDFC EMI HL1                                            │
│  due ~5th · Instalment 2 of 60 · 58 left after this       │
│                                   ₹45,000  [paid] [undo] │
│  HDFC EMI HL2                                            │
│  Instalment amount not set — add it in Settings           │
│                                    —    [set up][Settings]│
│  Indus PL EMI                                            │
│  due ~5th · Instalment 2 of 18 · 16 left after this       │
│                              ₹18,000 [₹8K left]  [Pay]   │
│  ══════════════════════════════════════════════════════  │
│  Subtotal                                 ₹1,13,000      │
└──────────────────────────────────────────────────────────┘

┌─ CREDIT CARD PAYMENTS · CONSOLIDATED FROM JUL 2026 ──────┐
│  HDFC 6011      ₹12,000 paid · ₹0 outstanding            │
│                                   ₹12,000 [paid] [undo]  │
│  SBI                     unpaid    ₹35,000 [due]  [Pay]  │
│  ══════════════════════════════════════════════════════  │
│  Total card dues                          ₹47,000        │
│  [ Mark all paid (₹35K) ]                                │
└──────────────────────────────────────────────────────────┘

┌─ SCHEDULES ──────────────────────────────────────────────┐
│  Indus PL EMI                              ₹3.06L left   │
│  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │
│  1 of 18 instalments paid · 17 months to go              │
│  ▸ View instalment schedule                              │
│      Aug 2026   ₹18,000   ₹2.88L after                   │  ← expands
│      Sep 2026   ₹18,000   ₹2.7L after                    │
└──────────────────────────────────────────────────────────┘
```

---

## Export sheet

```
┌─ EXPORT REPORT ─────────────────────────────────┐
│  Reports cover the 15th → 14th cycle you are    │
│  viewing (Aug 2026).                            │
│                                                 │
│  [      Printable report / PDF      ]           │
│  [   This cycle — detailed CSV      ]           │
│  [      Full backup (.json)         ]           │
│  ─────────────────────────────────────────      │
│  Multi-cycle summary                            │
│  [ Last 6 cycles              ▾ ]               │
│                                                 │
│              [ Cancel ] [ Download summary CSV ]│
└─────────────────────────────────────────────────┘
```

---

## Colour language

Each concept owns a hue and keeps it everywhere it appears — tile, chip, badge,
progress bar and dot. Colour is always paired with a word, never the only
carrier of meaning.

### Summary tiles — filled gradients, white type

| Tile                    | Hue                | Notes                                        |
| ----------------------- | ------------------ | -------------------------------------------- |
| Total inflow            | teal               |                                              |
| Total outflow           | rose               |                                              |
| Net balance, positive   | violet             | identity colour, not a status                |
| Net balance, negative   | **deep maroon**    | deliberately *not* rose — see below          |
| Still to pay            | amber, green at ₹0 |                                              |
| GPay / Cash / Card      | blue / green / violet | Expenses tab                              |
| Committed / Paid / Due  | violet / green / rose | Outflow tab                               |

A negative net gets its own darker maroon rather than reusing the outflow rose.
With both on rose, "Total outflow" and "Net balance" render as two identical
crimson tiles side by side — precisely when telling them apart matters most.

### Section cards

Each carries a 4px coloured left stripe, a matching title, and a 4.5% wash of
the same hue: **violet** upcoming obligations, **rose** card dues this cycle,
**blue** moving into next cycle, **teal** long-term dues.

### Status badges — solid pills, white type

`[paid]` green · `[due]` rose · `[₹8K left]` amber · `[set up]` violet ·
`[next cycle]` blue

### Progress bars

The cycle bar is white on the banner gradient. Each long-term due draws a
colour from a five-hue rotation (violet, blue, teal, amber, rose), repeated as a
dot beside its label so bar and row are linked. A completed tracker turns green.
The track sits at 13% black so a 0%-complete bar reads as "nothing paid yet"
rather than a rendering glitch.

### Everything else

Amounts are absolute rupees with Indian grouping (₹4,50,000), abbreviated only
in tight captions (₹4.5L, ₹18K, ₹1.2Cr). White type on filled surfaces uses the
darker gradient stop, which clears 4.5:1. All hues have dark-mode variants: the
gradients carry over unchanged, while the *ink* used for titles and chips on
card surfaces lifts to a lighter shade.
