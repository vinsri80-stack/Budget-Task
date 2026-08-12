/**
 * App.tsx — bottom tab navigator with the 15th → 14th cycle switcher pinned
 * into the header, so the cycle you are editing is visible on every tab.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

import { BudgetProvider, useBudget } from './BudgetContext';
import DashboardScreen from './DashboardScreen';
import ExpensesScreen from './ExpensesScreen';

// NOT INCLUDED in this folder — port these three from js/ui/inflow.js,
// js/ui/outflow.js and js/ui/settings.js. They are plain list + modal screens
// using the same Card/Row/Stat pieces defined in DashboardScreen.tsx, and they
// call the same calc functions (inflowBreakdown, outflowRows,
// consolidatedCardDues). Nothing new is needed on the domain side.
import InflowScreen from './InflowScreen';
import OutflowScreen from './OutflowScreen';
import SettingsScreen from './SettingsScreen';

import { cycleMonthLabel, cycleRangeLabel, nextCycle, prevCycle, cycleProgress } from '../core/cycle';
import { cycleSummary, formatShortINR } from '../core/calc';
import { cycleCSV, cycleReportHTML } from '../core/export';   // pure string builders
import { T } from './theme';

const Tab = createBottomTabNavigator();

function CycleHeader() {
  const { state, cycle, setCycle } = useBudget();
  const s = cycleSummary(state, cycle);
  const prog = cycleProgress(cycle);

  const exportCSV = async () => {
    const uri = FileSystem.cacheDirectory + `budget-${cycle}.csv`;
    await FileSystem.writeAsStringAsync(uri, '﻿' + cycleCSV(state, cycle), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: `Budget ${cycle}` });
  };

  const exportPDF = async () => {
    const { uri } = await Print.printToFileAsync({ html: cycleReportHTML(state, cycle) });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  };

  return (
    <SafeAreaView edges={['top']} style={st.header}>
      <View style={st.headerTop}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Budget</Text>
          <Text style={st.subtitle}>{cycleRangeLabel(cycle)} · 15th → 14th</Text>
        </View>
        <Pressable onPress={exportCSV} style={st.headerBtn}>
          <Text style={st.headerBtnText}>CSV</Text>
        </Pressable>
        <Pressable onPress={exportPDF} style={st.headerBtn}>
          <Text style={st.headerBtnText}>PDF</Text>
        </Pressable>
      </View>

      <View style={st.switcher}>
        <Pressable onPress={() => setCycle(prevCycle(cycle))} style={st.navBtn}>
          <Text style={st.navText}>‹</Text>
        </Pressable>
        <View style={st.current}>
          <Text style={st.currentName}>{cycleMonthLabel(cycle)}</Text>
          <Text style={st.currentNet}>
            net {formatShortINR(s.net)}{prog.isCurrent ? ` · ${prog.daysLeft}d left` : ''}
          </Text>
        </View>
        <Pressable onPress={() => setCycle(nextCycle(cycle))} style={st.navBtn}>
          <Text style={st.navText}>›</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Tabs() {
  const { ready } = useBudget();
  if (!ready) {
    return (
      <View style={st.loading}><ActivityIndicator color={T.peachStrong} /></View>
    );
  }
  return (
    <>
      <CycleHeader />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: T.peachInk,
          tabBarInactiveTintColor: T.textMuted,
          tabBarStyle: { backgroundColor: T.card, borderTopColor: T.border },
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Inflow" component={InflowScreen} />
        <Tab.Screen name="Expenses" component={ExpensesScreen} />
        <Tab.Screen name="Outflow" component={OutflowScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <BudgetProvider>
        <NavigationContainer>
          <Tabs />
        </NavigationContainer>
      </BudgetProvider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  header: { backgroundColor: T.bg, paddingHorizontal: T.space, paddingBottom: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 22, fontWeight: '600', color: T.text },
  subtitle: { fontSize: 12.5, color: T.textSecondary, marginTop: 2 },
  headerBtn: { borderRadius: 999, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 6 },
  headerBtnText: { fontSize: 12.5, color: T.textSecondary },

  switcher: { flexDirection: 'row', gap: 8, marginTop: 12 },
  navBtn: {
    width: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: T.radiusSm, borderWidth: 1, borderColor: T.border, backgroundColor: T.card,
  },
  navText: { fontSize: 20, color: T.textSecondary },
  current: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
    borderRadius: T.radiusSm, borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.peach,
  },
  currentName: { fontSize: 15, fontWeight: '600', color: T.peachInk },
  currentNet: { fontSize: 11.5, color: T.peachInk, opacity: 0.85 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg },
});
