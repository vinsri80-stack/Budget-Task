/**
 * ExpensesScreen.tsx — logging GPay / Cash / Credit Card spend.
 *
 * The one rule this screen has to make obvious: a credit card expense does not
 * come out of this cycle. It consolidates into next cycle's dues. That shows up
 * three times — on the tile, on every card row, and in the footer block.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Modal, StyleSheet, Alert,
} from 'react-native';
import { useBudget } from './BudgetContext';
import { PAY_METHOD, PAY_METHOD_LABEL, CARDS, cardLabel, createExpense } from '../core/models';
import { expenseBreakdown, cardDuesNextCycle, formatINR, formatShortINR } from '../core/calc';
import { cycleMonthLabel, nextCycle, cycleForDate, toISODate, shortDate, currentCycle } from '../core/cycle';
import { T } from './theme';

export default function ExpensesScreen() {
  const { state, cycle, update } = useBudget();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'all' | string>('all');

  const b = useMemo(() => expenseBreakdown(state, cycle), [state, cycle]);
  const next = useMemo(() => cardDuesNextCycle(state, cycle), [state, cycle]);

  const visible = (filter === 'all' ? b.rows : b.rows.filter((e) => e.method === filter))
    .slice()
    .sort((a, z) => String(z.date).localeCompare(String(a.date)));

  const remove = (id: string) =>
    update((s) => { s.expenses = s.expenses.filter((e) => e.id !== id); });

  return (
    <View style={st.screen}>
      <ScrollView contentContainerStyle={st.content}>

        <View style={st.tiles}>
          <Tile label="GPay" value={b.byMethod.gpay} total={b.total} />
          <Tile label="Cash" value={b.byMethod.cash} total={b.total} />
          <Tile label="Credit Card" value={b.byMethod.card} total={b.total}
                caption={`bills in ${cycleMonthLabel(nextCycle(cycle))}`} />
        </View>

        <View style={st.card}>
          <View style={st.filters}>
            {[['all', 'All'], [PAY_METHOD.GPAY, 'GPay'], [PAY_METHOD.CASH, 'Cash'], [PAY_METHOD.CARD, 'Card']]
              .map(([v, label]) => (
                <Pressable key={v} onPress={() => setFilter(v)}
                           style={[st.filter, filter === v && st.filterOn]}>
                  <Text style={[st.filterText, filter === v && st.filterOnText]}>{label}</Text>
                </Pressable>
              ))}
          </View>

          {visible.length === 0
            ? <Text style={st.empty}>No expenses logged for this cycle yet.</Text>
            : visible.map((e) => (
              <Pressable key={e.id} onLongPress={() =>
                Alert.alert('Delete expense?', e.note || PAY_METHOD_LABEL[e.method], [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => remove(e.id) },
                ])}>
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowLabel}>{e.note || e.category || PAY_METHOD_LABEL[e.method]}</Text>
                    <Text style={st.rowDetail}>
                      {[shortDate(e.date), PAY_METHOD_LABEL[e.method],
                        e.method === PAY_METHOD.CARD ? (e.cardId ? cardLabel(e.cardId) : 'no card set') : e.category]
                        .filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={st.rowAmount}>{formatINR(e.amount)}</Text>
                  {e.method === PAY_METHOD.CARD && (
                    <View style={st.badge}><Text style={st.badgeText}>next cycle</Text></View>
                  )}
                </View>
              </Pressable>
            ))}
        </View>

        <View style={st.card}>
          <Text style={st.cardTitle}>
            CARD SPEND CONSOLIDATING INTO {cycleMonthLabel(next.payableInCycle).toUpperCase()}
          </Text>
          {next.total === 0
            ? <Text style={st.empty}>No credit card spend logged this cycle.</Text>
            : (
              <>
                {next.cards.map((c) => (
                  <View key={c.cardId} style={st.row}>
                    <Text style={[st.rowLabel, { flex: 1 }]}>{c.label}</Text>
                    <Text style={st.rowAmount}>{formatINR(c.amount)}</Text>
                  </View>
                ))}
                <View style={[st.row, st.rowTotal]}>
                  <Text style={[st.rowLabel, st.bold, { flex: 1 }]}>Total due next cycle</Text>
                  <Text style={[st.rowAmount, st.bold]}>{formatINR(next.total)}</Text>
                </View>
              </>
            )}
        </View>
      </ScrollView>

      <Pressable style={st.fab} onPress={() => setAdding(true)}>
        <Text style={st.fabText}>+  Log expense</Text>
      </Pressable>

      <ExpenseModal visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}

/* ---------------- add-expense sheet ---------------- */

function ExpenseModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { cycle, update } = useBudget();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>(PAY_METHOD.GPAY);
  const [cardId, setCardId] = useState(CARDS[0].id);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() =>
    toISODate(cycle === currentCycle() ? new Date() : new Date()));

  const submit = () => {
    const value = Number(amount);
    if (!value) return Alert.alert('Enter an amount');

    // The DATE decides the cycle, not the tab you happen to be on.
    const targetCycle = cycleForDate(date);
    update((s) => {
      s.expenses.push(createExpense({
        cycle: targetCycle, date, amount: value, method,
        cardId: method === PAY_METHOD.CARD ? cardId : null, note,
      }));
    });

    if (targetCycle !== cycle) {
      Alert.alert('Logged elsewhere', `That date falls in ${cycleMonthLabel(targetCycle)}, so it went there.`);
    }
    setAmount(''); setNote('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.sheet}>
          <Text style={st.sheetTitle}>Log expense · {cycleMonthLabel(cycle)}</Text>

          <Text style={st.fieldLabel}>Amount (₹)</Text>
          <TextInput style={st.input} value={amount} onChangeText={setAmount}
                     keyboardType="number-pad" placeholder="0" autoFocus />

          <Text style={st.fieldLabel}>Paid with</Text>
          <View style={st.segment}>
            {[PAY_METHOD.GPAY, PAY_METHOD.CASH, PAY_METHOD.CARD].map((m) => (
              <Pressable key={m} onPress={() => setMethod(m)}
                         style={[st.segmentBtn, method === m && st.segmentOn]}>
                <Text style={[st.segmentText, method === m && st.segmentOnText]}>
                  {PAY_METHOD_LABEL[m]}
                </Text>
              </Pressable>
            ))}
          </View>

          {method === PAY_METHOD.CARD && (
            <>
              <Text style={st.fieldLabel}>Card</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {CARDS.map((c) => (
                    <Pressable key={c.id} onPress={() => setCardId(c.id)}
                               style={[st.cardChip, cardId === c.id && st.cardChipOn]}>
                      <Text style={[st.cardChipText, cardId === c.id && st.cardChipOnText]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Text style={st.hint}>
                Added to {cycleMonthLabel(nextCycle(cycle))}'s consolidated dues, not this cycle.
              </Text>
            </>
          )}

          <Text style={st.fieldLabel}>Date</Text>
          <TextInput style={st.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />

          <Text style={st.fieldLabel}>Description</Text>
          <TextInput style={st.input} value={note} onChangeText={setNote} placeholder="e.g. groceries" />

          <View style={st.sheetActions}>
            <Pressable onPress={onClose} style={[st.btn, st.btnGhost]}>
              <Text style={st.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={[st.btn, st.btnPrimary]}>
              <Text style={st.btnPrimaryText}>Log</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const Tile = ({ label, value, total, caption }: {
  label: string; value: number; total: number; caption?: string;
}) => (
  <View style={st.tile}>
    <Text style={st.tileLabel}>{label}</Text>
    <Text style={st.tileValue} adjustsFontSizeToFit numberOfLines={1}>{formatShortINR(value)}</Text>
    <Text style={st.tileCaption}>
      {caption ?? `${total > 0 ? Math.round((value / total) * 100) : 0}% of spend`}
    </Text>
  </View>
);

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: T.space, gap: T.space, paddingBottom: 96 },

  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: T.radiusSm, padding: 12 },
  tileLabel: { fontSize: 11.5, color: T.textSecondary },
  tileValue: { fontSize: 18, fontWeight: '600', color: T.text, marginTop: 4 },
  tileCaption: { fontSize: 10.5, color: T.textMuted, marginTop: 4 },

  card: { backgroundColor: T.card, borderRadius: T.radius, borderWidth: 1, borderColor: T.border, padding: 14 },
  cardTitle: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.7, color: T.textSecondary, marginBottom: 8 },

  filters: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  filter: { borderRadius: 999, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: T.bg },
  filterOn: { backgroundColor: T.peach, borderColor: T.borderStrong },
  filterText: { fontSize: 12.5, color: T.textSecondary },
  filterOnText: { color: T.peachInk, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border },
  rowTotal: { borderBottomWidth: 0, borderTopWidth: 2, borderTopColor: T.borderStrong, marginTop: 4 },
  rowLabel: { fontSize: 14, color: T.text },
  rowDetail: { fontSize: 11.5, color: T.textMuted },
  rowAmount: { fontSize: 14.5, fontWeight: '500', color: T.text },
  bold: { fontWeight: '700' },
  badge: { backgroundColor: T.peach, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10.5, color: T.peachInk },
  empty: { fontSize: 13, color: T.textMuted, paddingVertical: 6 },

  fab: {
    position: 'absolute', right: 16, bottom: 20,
    backgroundColor: T.peachStrong, borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 14, elevation: 3,
  },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(35,38,43,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontSize: 15, fontWeight: '600', color: T.text, marginBottom: 14 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },

  fieldLabel: { fontSize: 12, color: T.textSecondary, marginBottom: 4, marginTop: 10 },
  hint: { fontSize: 11, color: T.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: T.border, borderRadius: T.radiusSm,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: T.text, backgroundColor: T.bg,
  },

  segment: { flexDirection: 'row', gap: 6 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: T.radiusSm, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg },
  segmentOn: { backgroundColor: T.peach, borderColor: T.borderStrong },
  segmentText: { fontSize: 13, color: T.textSecondary },
  segmentOnText: { color: T.peachInk, fontWeight: '600' },

  cardChip: { borderRadius: 999, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: T.bg },
  cardChipOn: { backgroundColor: T.peach, borderColor: T.borderStrong },
  cardChipText: { fontSize: 12.5, color: T.textSecondary },
  cardChipOnText: { color: T.peachInk, fontWeight: '600' },

  btn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  btnPrimary: { backgroundColor: T.peachStrong },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: T.border },
  btnGhostText: { color: T.textSecondary, fontSize: 14 },
});
