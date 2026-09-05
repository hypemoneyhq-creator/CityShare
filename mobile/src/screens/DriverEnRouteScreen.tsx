import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, IncidentCategory, ManifestEntry, RunSegments } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverEnRoute'>;

const INCIDENT_CATEGORIES: { key: IncidentCategory; label: string; danger?: boolean }[] = [
  { key: 'heavy_traffic', label: 'Heavy traffic' },
  { key: 'vehicle_fault', label: 'Vehicle fault' },
  { key: 'stop_blocked', label: 'Stop blocked' },
  { key: 'passenger_issue', label: 'Passenger issue' },
  { key: 'accident_sos', label: 'Accident · SOS', danger: true },
];

const ACTIVE_STATES = new Set(['PENDING', 'HELD', 'RELEASABLE', 'DISPUTED', 'SETTLED']);

// Recreated from CityShare Driver.dc.html ("En route" screen). The design
// shows a live map placeholder and a "4 MIN BEHIND SCHEDULE" pace readout —
// this build has no continuous GPS tracking (only tap-based boarding
// evidence), so there's no real position to render a map or compute a live
// ETA/pace from. Both are dropped rather than faked; the occupancy counts
// and remaining-stops list below are real, computed from the manifest.
export function DriverEnRouteScreen({ route, navigation }: Props) {
  const { runId, nextStopIndex } = route.params;
  const { session } = useAuth();
  const [segments, setSegments] = useState<RunSegments | undefined>();
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [reporting, setReporting] = useState<IncidentCategory | undefined>();
  const [sent, setSent] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [seg, man] = await Promise.all([api.getRunSegments(runId), api.getRunManifest(runId)]);
      if (cancelled) return;
      setSegments(seg);
      setManifest(man.manifest);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!segments) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.greenOnDark} />
      </View>
    );
  }

  const stops = segments.stops;
  const service = segments.service;
  const currentStop = stops[nextStopIndex - 1];
  const nextStop = stops[nextStopIndex];
  const isTerminus = nextStopIndex === stops.length - 1;
  const stopSeq = (id?: string) => stops.find((s) => s.id === id)?.sequence ?? -1;
  const isActive = (m: ManifestEntry) => ACTIVE_STATES.has(m.escrowState);

  const aboardNow = manifest.filter(
    (m) => isActive(m) && m.driverBoardedAt && stopSeq(m.alightStopId) > currentStop.sequence,
  ).length;
  const boardingAhead = manifest.filter(
    (m) => isActive(m) && !m.driverBoardedAt && stopSeq(m.boardStopId) >= nextStop.sequence,
  ).length;
  const alightingAhead = manifest.filter((m) => isActive(m) && stopSeq(m.alightStopId) >= nextStop.sequence).length;

  const remainingStops = stops.slice(nextStopIndex);

  async function onArrived() {
    if (!session) return;
    if (isTerminus) {
      setEnding(true);
      try {
        await api.arriveAtStop(session.token, runId, nextStop.id);
        const summary = await api.completeRun(session.token, runId);
        navigation.navigate('DriverRunComplete', { summary, serviceLabel: `${service.code} · ${service.name}` });
      } finally {
        setEnding(false);
      }
    } else {
      navigation.navigate('DriverStop', { runId, stopIndex: nextStopIndex });
    }
  }

  async function onReport(category: IncidentCategory) {
    if (!session) return;
    setReporting(category);
    try {
      await api.reportIncident(session.token, runId, category);
      setSent(true);
    } finally {
      setReporting(undefined);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapFade}>
          <Text style={styles.mapLabel}>NAVIGATION · NEXT STOP {nextStop.name.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardLabel, { color: colors.greenOnDark }]}>IN TRANSIT</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ gap: 4 }}>
              <Text style={styles.stopName}>{nextStop.name}</Text>
              <Text style={styles.stopMeta}>SCHEDULED {nextStop.scheduledArrival ?? nextStop.scheduledDeparture ?? '--:--'}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{aboardNow}</Text>
              <Text style={styles.statLabel}>aboard now</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{boardingAhead}</Text>
              <Text style={styles.statLabel}>boarding ahead</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{alightingAhead}</Text>
              <Text style={styles.statLabel}>alighting ahead</Text>
            </View>
          </View>
        </View>

        <View style={styles.stopsCard}>
          <Text style={[styles.cardLabel, styles.stopsHeader]}>REMAINING STOPS</Text>
          {remainingStops.map((s, i) => {
            const board = manifest.filter((m) => isActive(m) && m.boardStopId === s.id).length;
            const alight = manifest.filter((m) => isActive(m) && m.alightStopId === s.id).length;
            const isLast = i === remainingStops.length - 1;
            const dwellMin = Math.round(s.maxDwellSeconds / 60);
            return (
              <View key={s.id} style={[styles.stopRow, !isLast && styles.stopRowBorder]}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={[styles.dot, { backgroundColor: i === 0 ? colors.greenOnDark : colors.darkSurfaceBorder }]} />
                  <View style={{ gap: 2 }}>
                    <Text style={[styles.stopRowName, i !== 0 && { color: '#9AA09A' }]}>{s.name}</Text>
                    <Text style={[styles.stopRowMeta, i !== 0 && { color: '#6D736C' }]}>
                      {s.alightAllowed && !s.boardAllowed
                        ? `ALIGHT ONLY${isLast ? ' · TERMINUS' : ''}`
                        : `${board} BOARD · ${alight} ALIGHT · DWELL ${dwellMin}m`}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.stopRowTime, i !== 0 && { color: '#9AA09A' }]}>
                  {s.scheduledArrival ?? s.scheduledDeparture ?? '--:--'}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.actionRow}>
          {!isTerminus && (
            <Pressable style={styles.arriveBtn} onPress={onArrived}>
              <Text style={styles.arriveBtnText}>Arrived at stop</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.reportBtn, isTerminus && { flex: 1 }]}
            onPress={() => setIncidentOpen((v) => !v)}
          >
            <Text style={styles.reportBtnText}>Report</Text>
          </Pressable>
        </View>

        {incidentOpen && (
          <View style={styles.incidentCard}>
            <Text style={styles.incidentHeader}>REPORT TO OPERATIONS</Text>
            <View style={styles.chipRow}>
              {INCIDENT_CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.chip, c.danger && styles.chipDanger]}
                  onPress={() => onReport(c.key)}
                  disabled={reporting === c.key}
                >
                  {reporting === c.key ? (
                    <ActivityIndicator size="small" color={c.danger ? '#E3A3A3' : colors.textOnDark} />
                  ) : (
                    <Text style={[styles.chipText, c.danger && { color: '#E3A3A3' }]}>{c.label}</Text>
                  )}
                </Pressable>
              ))}
            </View>
            <Text style={styles.incidentFootnote}>
              {sent
                ? 'Sent to operations. Riders are notified of delays without you having to call anyone.'
                : "Operations sees your position and passenger list immediately. Riders are notified of delays without you having to call anyone."}
            </Text>
          </View>
        )}
      </ScrollView>

      {isTerminus && (
        <View style={styles.bottomBar}>
          <Pressable style={styles.endBtn} onPress={onArrived} disabled={ending}>
            {ending ? (
              <ActivityIndicator color="#0E120E" />
            ) : (
              <Text style={styles.endBtnText}>Arrived at {nextStop.name} · end run</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  mapPlaceholder: { height: 230, backgroundColor: '#171A14' },
  mapFade: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14 },
  mapLabel: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 1, color: '#8B918A' },
  body: { padding: 16, paddingTop: 8, gap: 10, paddingBottom: 40, marginTop: -16 },
  card: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 16, padding: 16, gap: 14 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B918A' },
  stopName: { fontFamily: fonts.displaySemiBold, fontSize: 22, letterSpacing: -0.4, color: colors.textOnDark },
  stopMeta: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: '#8B918A' },
  statsRow: { flexDirection: 'row', gap: 9, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.darkSurfaceBorder },
  stat: { flex: 1, gap: 3 },
  statNum: { fontFamily: fonts.monoSemiBold, fontSize: 20, letterSpacing: -0.3, color: colors.textOnDark },
  statLabel: { fontFamily: fonts.display, fontSize: 11, color: '#8B918A' },
  stopsCard: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 16, overflow: 'hidden' },
  stopsHeader: { padding: 13, borderBottomWidth: 1, borderBottomColor: colors.darkSurfaceBorder },
  stopRow: { padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stopRowBorder: { borderBottomWidth: 1, borderBottomColor: '#22261F' },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  stopRowName: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.textOnDark },
  stopRowMeta: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#8B918A' },
  stopRowTime: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.textOnDark },
  actionRow: { flexDirection: 'row', gap: 9 },
  arriveBtn: { flex: 1, borderWidth: 1, borderColor: '#3A3F33', borderRadius: 12, padding: 15, alignItems: 'center' },
  arriveBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 13, color: '#C9CEC8' },
  reportBtn: { borderWidth: 1, borderColor: '#5A4747', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 17, alignItems: 'center' },
  reportBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 13, color: '#E3A3A3' },
  incidentCard: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: '#4A3232', borderRadius: 14, padding: 15, gap: 10 },
  incidentHeader: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#E3A3A3' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { backgroundColor: '#22261F', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999 },
  chipDanger: { backgroundColor: '#2A1F1F' },
  chipText: { fontFamily: fonts.displayMedium, fontSize: 12, color: colors.textOnDark },
  incidentFootnote: { fontFamily: fonts.display, fontSize: 11.5, lineHeight: 17, color: '#8B918A' },
  bottomBar: { padding: 16, paddingBottom: 30, backgroundColor: '#0D0F0B', borderTopWidth: 1, borderTopColor: colors.darkSurfaceBorder },
  endBtn: { borderRadius: 14, padding: 19, backgroundColor: colors.greenOnDark, alignItems: 'center' },
  endBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: '#0E120E' },
});
