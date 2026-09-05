import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, DriverRun } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverShift'>;

const CHECKS = [
  { key: 'walk', label: 'Walk-around inspection', note: 'TYRES · LIGHTS · DOORS' },
  { key: 'docs', label: 'Insurance and licence aboard', note: 'CHECK VALIDITY' },
  { key: 'fuel', label: 'Fuel sufficient for the run', note: 'THERE AND BACK' },
  { key: 'clean', label: 'Cabin clean, AC working', note: 'RIDER-RATED' },
] as const;

// Recreated from CityShare Driver.dc.html ("Shift start & checks"
// screen). Pre-trip checks are local UI state only — there's no backend
// field for them, since they gate a button rather than feed the escrow
// or manifest. "Assigned by ops" is a real constraint here: driver
// assignment has no UI yet (that's the ops dashboard, step 9), so a
// driver with no assigned run sees an honest empty state rather than a
// way to assign themselves.
export function DriverShiftScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [runs, setRuns] = useState<DriverRun[] | undefined>();
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (session) api.getDriverRuns(session.token).then((res) => setRuns(res.runs));
  }, [session]);

  const run = runs?.find((r) => r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS');
  const checkCount = CHECKS.filter((c) => checks[c.key]).length;
  const allChecked = checkCount === CHECKS.length;
  const firstStop = run?.service.stops[0];

  async function onStart() {
    if (!session || !run || !allChecked) return;
    await api.startRun(session.token, run.id);
    navigation.navigate('DriverStop', { runId: run.id, stopIndex: 0 });
  }

  if (!runs) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.greenOnDark} />
      </View>
    );
  }

  if (!run) {
    return (
      <View style={[styles.screen, { padding: spacing.xl, paddingTop: 60 }]}>
        <Text style={styles.emptyTitle}>No run assigned yet</Text>
        <Text style={styles.emptyBody}>
          Ops assigns drivers to runs (there's no self-assignment — that keeps the manifest trustworthy). Check back
          once you've been assigned one.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.kicker}>{run.service.corridor.name.toUpperCase()} · EXPRESS</Text>
          <Text style={styles.driverName}>{session?.user.firstName?.toUpperCase() ?? 'DRIVER'}</Text>
        </View>
        <Text style={styles.title}>Your run: {run.service.name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>{run.service.code} · {run.service.name.toUpperCase()}</Text>
            <Text style={styles.seatsSold}>{run.seatsSold} SEATS SOLD</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text style={styles.time}>{firstStop?.scheduledDeparture ?? '--:--'}</Text>
            <Text style={styles.route}>
              {run.service.corridor.origin} → {run.service.corridor.destination}
            </Text>
          </View>
        </View>

        <View style={styles.checksCard}>
          <View style={styles.checksHeader}>
            <Text style={styles.cardLabel}>PRE-TRIP CHECKS</Text>
            <Text style={[styles.checkCount, allChecked && { color: colors.greenOnDark }]}>{checkCount} OF {CHECKS.length}</Text>
          </View>
          {CHECKS.map((c) => {
            const on = Boolean(checks[c.key]);
            return (
              <Pressable
                key={c.key}
                style={styles.checkRow}
                onPress={() => setChecks((p) => ({ ...p, [c.key]: !p[c.key] }))}
              >
                <View style={[styles.checkBox, on && { backgroundColor: colors.greenOnDark, borderColor: colors.greenOnDark }]} />
                <Text style={[styles.checkLabel, on && { color: colors.textOnDark }]}>{c.label}</Text>
                <Text style={styles.checkNote}>{c.note}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>TODAY'S SCHEDULE RULE</Text>
          <Text style={styles.ruleText}>
            Arrive at each stop before the scheduled time. Maximum dwell is three minutes. Depart on schedule even if
            a passenger has not appeared — they are marked no-show automatically.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={[styles.startBtn, !allChecked && styles.startBtnDisabled]} disabled={!allChecked} onPress={onStart}>
          <Text style={[styles.startBtnText, !allChecked && styles.startBtnTextDisabled]}>
            {allChecked ? 'Start run' : 'Complete checks to start'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 46, paddingHorizontal: spacing.xl, paddingBottom: 18 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.5, color: colors.greenOnDark },
  driverName: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: '#8B918A' },
  title: { fontFamily: fonts.displaySemiBold, fontSize: 22, letterSpacing: -0.4, color: colors.textOnDark, marginTop: 12 },
  body: { padding: 16, paddingTop: 8, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 16, padding: 16, gap: 12 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B918A' },
  seatsSold: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.greenOnDarkHover },
  time: { fontFamily: fonts.monoSemiBold, fontSize: 28, letterSpacing: -0.5, color: colors.textOnDark },
  route: { fontFamily: fonts.display, fontSize: 14, color: colors.mutedOnDark },
  checksCard: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 16, overflow: 'hidden' },
  checksHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkSurfaceBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  checkCount: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#D8C79A' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderBottomWidth: 1, borderBottomColor: '#22261F' },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#3A3F33' },
  checkLabel: { flex: 1, fontFamily: fonts.displayMedium, fontSize: 14.5, color: colors.mutedOnDark },
  checkNote: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#6D736C' },
  ruleText: { fontFamily: fonts.display, fontSize: 12.5, lineHeight: 19, color: '#C9CEC8' },
  emptyTitle: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.textOnDark, marginBottom: 10 },
  emptyBody: { fontFamily: fonts.display, fontSize: 14, lineHeight: 21, color: colors.mutedOnDark },
  bottomBar: { padding: 16, paddingBottom: 30, backgroundColor: '#0D0F0B', borderTopWidth: 1, borderTopColor: colors.darkSurfaceBorder },
  startBtn: { borderRadius: 14, padding: 19, backgroundColor: colors.greenOnDark, alignItems: 'center' },
  startBtnDisabled: { backgroundColor: '#22261F' },
  startBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: '#0E120E' },
  startBtnTextDisabled: { color: '#6D736C' },
});
