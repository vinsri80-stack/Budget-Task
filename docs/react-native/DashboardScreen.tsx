/**
 * DashboardScreen.tsx — summary cards, upcoming EMIs, consolidated card dues
 * and long-term progress. Every number comes from ../core/calc, unchanged
 * from the web build.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useBudget, useSummary } from './BudgetContext';
import { progressTrackers, upcomingObligations, formatINR, formatShortINR } from '../core/calc';
import { cycleMonthLabel, cycleRangeLabel, cycleProgress, nextCycle } from '../core/cycle';
import { T, statusTone } from './theme';

export default function DashboardScreen() {
  const { state, cycle } = useBudget();
  const s = useSummary();
  const prog = cycleProgress(cycle);
  const trackers = progressTrackers(state, cycle);
  const upcoming = upcomingObligations(state, cycle, 3);

  return (
    <ScrollView style={st.screen} contentContainerStyle={st.content}>

      {/* ---- cycle banner: the 15th → 14th window is never ambiguous ---- */}
      <View style={st.banner}>
        <View style={st.bannerHead}>
          <View style={{ flex: 1 }}>
            <Text style={st.bannerTitle}>Cycle {cycleMonthLabel(cycle)}</Text>
            <Text style={st.bannerRange}>{cycleRangeLabel(cycle)}</Text>
          </View>
          <View style={[st.pill, prog.isCurrent && st.pillLive]}>
            <Text style={[st.pillText, prog.isCurrent && st.pillLiveText]}>
              {prog.isCurrent ? `${prog.daysLeft} days left` : `Day 1–${prog.total}`}
            </Text>
          </View>
        </View>
        <Bar pct={prog.isCurrent ? prog.pct : 0} color={T.peachInk} />
        <Text style={st.bannerFoot}>
          Runs 15th → 14th · card spend here is billed in {cycleMonthLabel(nextCycle(cycle))}
        </Text>
      </View>

      {/* ---- four summary cards ---- */}
      <View style={st.statGrid}>
        <Stat label="Total inflow" value={formatINR(s.inflow.total)} bg={T.inBg} fg={T.in}
              caption={`${formatShortINR(s.inflow.carriedForward)} carried + ${formatShortINR(s.inflow.earned)} earned`} />
        <Stat label="Total outflow" value={formatINR(s.outflow.total)} bg={T.outBg} fg={T.out}
              caption={`${formatShortINR(s.outflow.commitments)} committed + ${formatShortINR(s.outflow.dailySpend)} spend`} />
        <Stat label="Net balance" value={formatINR(s.net)}
              bg={s.net >= 0 ? T.inBg : T.card} fg={s.net >= 0 ? T.in : T.bad}
              caption={`carries into ${cycleMonthLabel(nextCycle(cycle))}`} />
        <Stat label="Still to pay" value={formatINR(s.unpaid)}
              bg={s.unpaid > 0 ? T.warnBg : T.inBg} fg={s.unpaid > 0 ? T.warn : T.in}
              caption={s.unpaid > 0 ? 'unticked obligations' : 'everything settled'} />
      </View>

      {/* ---- upcoming EMI obligations ---- */}
      <Card title="Upcoming obligations">
        {upcoming.map((u) => (
          <View key={u.cycle} style={st.upcoming}>
            <View style={st.rowBetween}>
              <Text style={st.upcomingMonth}>{cycleMonthLabel(u.cycle)}</Text>
              <Text style={st.upcomingTotal}>{formatINR(u.total)}</Text>
            </View>
            <View style={st.chips}>
              {u.items.map((i, n) => {
                const tone = statusTone(i.status);
                return (
                  <View key={n} style={[st.chip, { borderColor: tone.fg }]}>
                    <Text style={[st.chipText, { color: tone.fg }]}>{i.label}</Text>
                    <Text style={[st.chipAmt, { color: tone.fg }]}>{formatShortINR(i.amount)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </Card>

      {/* ---- consolidated card dues owed THIS cycle ---- */}
      <Card title={`Card dues this cycle · from ${cycleMonthLabel(s.cardDues.sourceCycle)} spend`}>
        {s.cardDues.total === 0 ? (
          <Text style={st.empty}>No card spend logged in the previous cycle.</Text>
        ) : (
          <>
            {s.cardDues.cards.map((c) => (
              <Row key={c.cardId}
                   label={c.label}
                   detail={c.settled ? 'paid' : `${formatINR(c.outstanding)} outstanding`}
                   amount={formatINR(c.due)}
                   badge={c.settled ? 'paid' : c.paid > 0 ? 'part' : 'due'} />
            ))}
            <Row label="Total" amount={formatINR(s.cardDues.total)} total />
          </>
        )}
      </Card>

      {/* ---- what next cycle will owe ---- */}
      <Card title={`Moving into ${cycleMonthLabel(s.nextCardDues.payableInCycle)}`}>
        <Text style={st.bigNumber}>{formatINR(s.nextCardDues.total)}</Text>
        <Text style={st.bigCaption}>consolidated card dues you will owe next cycle</Text>
        <View style={st.chips}>
          {s.nextCardDues.cards.map((c) => (
            <View key={c.cardId} style={st.chip}>
              <Text style={st.chipText}>{c.label}</Text>
              <Text style={st.chipAmt}>{formatShortINR(c.amount)}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* ---- Chitra / Indus PL / home loan progress ---- */}
      <Card title="Long-term dues">
        {trackers.length === 0
          ? <Text style={st.empty}>Set EMI amounts in Settings to track them here.</Text>
          : trackers.map((t) => (
            <View key={t.id} style={st.tracker}>
              <View style={st.rowBetween}>
                <Text style={st.trackerLabel}>{t.label}</Text>
                <Text style={st.trackerRemaining}>{formatShortINR(t.remaining)} left</Text>
              </View>
              <Bar pct={t.pct} color={t.pct >= 1 ? T.in : T.peachStrong} />
              <Text style={st.trackerFoot}>
                {t.caption} · {formatShortINR(t.perMonth)}/month · {t.monthsLeft ?? '—'} months to go
                {t.finalCycle ? ` · ends ${cycleMonthLabel(t.finalCycle)}` : ''}
              </Text>
            </View>
          ))}
      </Card>
    </ScrollView>
  );
}

/* ---------------- small shared pieces ---------------- */

const Bar = ({ pct, color }: { pct: number; color: string }) => (
  <View style={st.bar}>
    <View style={[st.barFill, { width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`, backgroundColor: color }]} />
  </View>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={st.card}>
    <Text style={st.cardTitle}>{title.toUpperCase()}</Text>
    {children}
  </View>
);

const Stat = ({ label, value, caption, bg, fg }: {
  label: string; value: string; caption: string; bg: string; fg: string;
}) => (
  <View style={[st.stat, { backgroundColor: bg }]}>
    <Text style={[st.statLabel, { color: fg }]}>{label}</Text>
    <Text style={[st.statValue, { color: fg }]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
    <Text style={st.statCaption}>{caption}</Text>
  </View>
);

const Row = ({ label, detail, amount, badge, total }: {
  label: string; detail?: string; amount: string; badge?: string; total?: boolean;
}) => {
  const tone = badge ? statusTone(badge) : null;
  return (
    <View style={[st.row, total && st.rowTotal]}>
      <View style={{ flex: 1 }}>
        <Text style={[st.rowLabel, total && st.bold]}>{label}</Text>
        {detail ? <Text style={st.rowDetail}>{detail}</Text> : null}
      </View>
      <Text style={[st.rowAmount, total && st.bold]}>{amount}</Text>
      {tone && (
        <View style={[st.badge, { backgroundColor: tone.bg }]}>
          <Text style={[st.badgeText, { color: tone.fg }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: T.space, gap: T.space, paddingBottom: 40 },

  banner: { backgroundColor: T.peach, borderRadius: T.radius, padding: 14, borderWidth: 1, borderColor: T.borderStrong },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  bannerTitle: { fontSize: 16, fontWeight: '600', color: T.peachInk },
  bannerRange: { fontSize: 12.5, color: T.peachInk, opacity: 0.8, marginTop: 1 },
  bannerFoot: { fontSize: 11.5, color: T.peachInk, opacity: 0.78, marginTop: 8 },
  pill: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillLive: { backgroundColor: T.peachStrong },
  pillText: { fontSize: 11, color: T.peachInk },
  pillLiveText: { color: '#fff', fontWeight: '600' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', flexGrow: 1, borderRadius: T.radiusSm, padding: 12 },
  statLabel: { fontSize: 11.5, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '600' },
  statCaption: { fontSize: 11, color: T.textMuted, marginTop: 4 },

  card: { backgroundColor: T.card, borderRadius: T.radius, borderWidth: 1, borderColor: T.border, padding: 14 },
  cardTitle: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.7, color: T.textSecondary, marginBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border },
  rowTotal: { borderBottomWidth: 0, borderTopWidth: 2, borderTopColor: T.borderStrong, marginTop: 4, paddingTop: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 14, color: T.text },
  rowDetail: { fontSize: 11.5, color: T.textMuted },
  rowAmount: { fontSize: 14.5, fontWeight: '500', color: T.text },
  bold: { fontWeight: '700' },

  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10.5 },

  bar: { height: 7, backgroundColor: T.border, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },

  upcoming: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  upcomingMonth: { fontSize: 13.5, color: T.text },
  upcomingTotal: { fontSize: 13.5, fontWeight: '700', color: T.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { flexDirection: 'row', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, color: T.textSecondary },
  chipAmt: { fontSize: 12, fontWeight: '600', color: T.text },

  bigNumber: { fontSize: 30, fontWeight: '600', color: T.peachInk, textAlign: 'center' },
  bigCaption: { fontSize: 12, color: T.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 10 },

  tracker: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  trackerLabel: { fontSize: 14, fontWeight: '500', color: T.text, marginBottom: 6 },
  trackerRemaining: { fontSize: 13, color: T.textSecondary },
  trackerFoot: { fontSize: 11.5, color: T.textMuted, marginTop: 6 },

  empty: { fontSize: 13, color: T.textMuted, paddingVertical: 6 },
});
