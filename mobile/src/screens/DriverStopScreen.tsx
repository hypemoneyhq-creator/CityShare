import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, DwellStatus, ManifestEntry, RunSegments } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverStop'>;

// Recreated from CityShare Driver.dc.html ("At a stop · boarding"
// screen). The dwell countdown is real: it's computed from the server's
// recorded arrival time and the stop's actual maxDwellSeconds, ticking
// locally between refetches rather than a hardcoded demo timer.
export function DriverStopScreen({ route, navigation }: Props) {
  const { runId, stopIndex } = route.params;
  const { session } = useAuth();
  const [segments, setSegments] = useState<RunSegments | undefined>();
  const [dwell, setDwell] = useState<DwellStatus | undefined>();
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [busyId, setBusyId] = useState<string | undefined>();
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  const stop = segments?.stops[stopIndex];

  const refreshManifest = useCallback(async () => {
    const res = await api.getRunManifest(runId);
    setManifest(res.manifest);
  }, [runId]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function init() {
      const seg = await api.getRunSegments(runId);
      if (cancelled) return;
      setSegments(seg);
      const targetStop = seg.stops[stopIndex];
      await api.arriveAtStop(session!.token, runId, targetStop.id);
      const status = await api.getDwellStatus(runId, targetStop.id);
      if (cancelled) return;
      setDwell(status);
      setRemaining(status.remainingSeconds ?? status.maxDwellSeconds);
      await refreshManifest();
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [session, runId, stopIndex, refreshManifest]);

  useEffect(() => {
    tickRef.current = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  if (!segments || !stop || !dwell) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.greenOnDark} />
      </View>
    );
  }

  const over = remaining === 0;
  const tight = remaining > 0 && remaining < 45;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');

  const boardingHere = manifest.filter((m) => m.boardStopId === stop.id);
  const alightingHereOnly = manifest.filter((m) => m.alightStopId === stop.id && m.boardStopId !== stop.id);
  const boardedCount = boardingHere.filter((m) => m.driverBoardedAt).length;

  async function onBoard(entry: ManifestEntry) {
    if (!session) return;
    setBusyId(entry.bookingId);
    try {
      await api.boardDriver(session.token, entry.bookingId, stop!.lat, stop!.lng);
      await refreshManifest();
    } finally {
      setBusyId(undefined);
    }
  }

  async function onNoShow(entry: ManifestEntry) {
    if (!session) return;
    setBusyId(entry.bookingId);
    try {
      await api.markNoShow(session.token, entry.bookingId);
      await refreshManifest();
    } finally {
      setBusyId(undefined);
    }
  }

  async function onDepart() {
    if (!session) return;
    await api.departStop(session.token, runId, stop!.id, over);
    navigation.navigate('DriverEnRoute', { runId, nextStopIndex: stopIndex + 1 });
  }

  const headerBg = over ? '#2A1F1F' : tight ? '#2A2618' : colors.darkSurfaceCard;
  const kickerColor = over ? '#E3A3A3' : tight ? '#D8C79A' : colors.greenOnDark;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.kicker, { color: kickerColor }]}>
            {over ? 'DWELL EXCEEDED · DEPART NOW' : tight ? 'DWELL ENDING' : 'AT STOP · BOARDING'}
          </Text>
          <Text style={[styles.kicker, { color: kickerColor }]}>DEPART {stop.scheduledDeparture ?? stop.scheduledArrival}</Text>
        </View>
        <View style={styles.headerMain}>
          <View>
            <Text style={styles.stopName}>{stop.name}</Text>
            <Text style={styles.stopMeta}>
              STOP {stopIndex + 1} OF {segments.stops.length} · {stop.boardAllowed && stop.alightAllowed ? 'BOARD + ALIGHT' : stop.boardAllowed ? 'BOARD ONLY' : 'ALIGHT ONLY'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.dwellClock}>{mm}:{ss}</Text>
            <Text style={styles.dwellLabel}>DWELL REMAINING</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>BOARDING HERE</Text>
          <Text style={styles.boardedCount}>{boardedCount} OF {boardingHere.length} BOARDED</Text>
        </View>
        {boardingHere.map((entry) => {
          const boarded = Boolean(entry.driverBoardedAt);
          const late = over && !boarded;
          return (
            <View
              key={entry.bookingId}
              style={[styles.paxCard, boarded && styles.paxCardBoarded, late && styles.paxCardLate]}
            >
              <View style={styles.avatar}>
                <Text style={[styles.avatarText, { color: boarded ? colors.greenOnDarkHover : colors.partnerTan }]}>
                  {initialsFor(entry.riderName)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.paxName}>{entry.riderName}</Text>
                <Text style={styles.paxMeta}>
                  {boarded
                    ? 'BOARDED · AWAITING RIDER CONFIRMATION'
                    : late
                      ? 'NOT PRESENT · MARK NO-SHOW'
                      : `${entry.seats} SEAT · CODE ${entry.boardingCode?.split('').join('-') ?? '----'}`}
                </Text>
              </View>
              {!boarded && (
                <Pressable
                  style={[styles.paxBtn, late && styles.paxBtnLate]}
                  onPress={() => (late ? onNoShow(entry) : onBoard(entry))}
                  disabled={busyId === entry.bookingId}
                >
                  {busyId === entry.bookingId ? (
                    <ActivityIndicator size="small" color={late ? '#E3A3A3' : '#0E120E'} />
                  ) : (
                    <Text style={[styles.paxBtnText, late && { color: '#E3A3A3' }]}>{late ? 'No-show' : 'Boarded'}</Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}

        {alightingHereOnly.length > 0 && (
          <View style={styles.alightCard}>
            <View>
              <Text style={styles.alightTitle}>Alighting here</Text>
              <Text style={styles.alightMeta}>{alightingHereOnly.length} PASSENGER{alightingHereOnly.length > 1 ? 'S' : ''}</Text>
            </View>
            <Text style={styles.noActionBadge}>NO ACTION</Text>
          </View>
        )}

        <Text style={styles.footnote}>
          Each rider confirms on their own phone after you tap boarded. Their fare is released from escrow once both
          taps match.
        </Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        {over && (
          <View style={styles.overBanner}>
            <Text style={styles.overBannerText}>
              Dwell exceeded. Depart now — remaining passengers will be marked no-show and their seats released.
            </Text>
          </View>
        )}
        <Pressable
          style={[styles.departBtn, { backgroundColor: over ? colors.disputeRed : boardedCount === boardingHere.length && boardingHere.length > 0 ? colors.greenOnDark : '#22261F' }]}
          onPress={onDepart}
        >
          <Text style={[styles.departBtnText, { color: over ? '#fff' : boardedCount === boardingHere.length && boardingHere.length > 0 ? '#0E120E' : '#9AA09A' }]}>
            {over ? 'Depart · mark remaining no-show' : `Depart ${stop.name}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function initialsFor(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 44, paddingHorizontal: spacing.xl, paddingBottom: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.5 },
  headerMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
  stopName: { fontFamily: fonts.displaySemiBold, fontSize: 26, letterSpacing: -0.4, color: colors.textOnDark },
  stopMeta: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: '#8B918A', marginTop: 4 },
  dwellClock: { fontFamily: fonts.monoSemiBold, fontSize: 42, letterSpacing: -0.8, color: colors.textOnDark },
  dwellLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: '#8B918A' },
  body: { padding: 16, paddingTop: 12, gap: 9, paddingBottom: 40 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B918A' },
  boardedCount: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.greenOnDarkHover },
  paxCard: {
    backgroundColor: colors.darkSurfaceCard,
    borderWidth: 1,
    borderColor: colors.darkSurfaceBorder,
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  paxCardBoarded: { backgroundColor: '#22301F', borderColor: '#3D4A33' },
  paxCardLate: { backgroundColor: '#2A1F1F', borderColor: '#4A3232' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2B3029', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.displaySemiBold, fontSize: 13 },
  paxName: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.textOnDark },
  paxMeta: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: '#8B918A' },
  paxBtn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.greenOnDark },
  paxBtnLate: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#5A4747' },
  paxBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 12.5, color: '#0E120E' },
  alightCard: {
    backgroundColor: colors.darkSurfaceCard,
    borderWidth: 1,
    borderColor: colors.darkSurfaceBorder,
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  alightTitle: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.textOnDark },
  alightMeta: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: '#8B918A', marginTop: 3 },
  noActionBadge: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 0.6, backgroundColor: '#22261F', color: '#9AA09A', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 4, overflow: 'hidden' },
  footnote: { fontFamily: fonts.display, fontSize: 11.5, lineHeight: 17, color: '#6D736C', padding: 6 },
  bottomBar: { padding: 16, paddingBottom: 30, backgroundColor: '#0D0F0B', borderTopWidth: 1, borderTopColor: colors.darkSurfaceBorder, gap: 9 },
  overBanner: { backgroundColor: '#2A1F1F', borderWidth: 1, borderColor: '#4A3232', borderRadius: 12, padding: 11 },
  overBannerText: { fontFamily: fonts.display, fontSize: 12.5, lineHeight: 18, color: '#E3A3A3' },
  departBtn: { borderRadius: 14, padding: 19, alignItems: 'center' },
  departBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 16 },
});
