import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, Booking } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Ticket'>;

// Recreated from CityShare App.dc.html ("Digital ticket" screen). Spec
// section 11: "ticket, boarding code and today's manifest must render
// with no network." The trip/operator/stop names this screen needs come
// from separate lookups (run segments, or the Partner trip), so rather
// than re-fetch those every time, this screen resolves them once and
// caches the flattened result — that's what actually renders offline,
// no network calls needed on a cache hit.
interface TicketDisplay {
  kicker: string;
  boardName: string;
  alightName: string;
  operatedBy: string;
  seats: number;
  amountCedis: number;
  boardingCode: string;
}

async function buildDisplay(booking: Booking): Promise<TicketDisplay> {
  if (booking.kind === 'RUN' && booking.runHold) {
    const seg = await api.getRunSegments(booking.runHold.runId);
    const board = seg.stops.find((s) => s.id === booking.runHold!.boardStopId);
    const alight = seg.stops.find((s) => s.id === booking.runHold!.alightStopId);
    return {
      kicker: `${seg.service.name.toUpperCase()} · ${seg.service.code}`,
      boardName: board?.name ?? '—',
      alightName: alight?.name ?? '—',
      operatedBy: seg.service.name,
      seats: booking.seats,
      amountCedis: booking.fareCedis,
      boardingCode: booking.boardingCode ?? '----',
    };
  }
  const trip = booking.partnerHold?.trip;
  return {
    kicker: 'CITYSHARE PARTNER',
    boardName: trip?.originName ?? '—',
    alightName: trip?.destinationName ?? '—',
    operatedBy: trip ? `${trip.partner.firstName ?? 'Partner'} ${trip.partner.lastName?.[0] ?? ''}.` : 'Partner',
    seats: booking.seats,
    amountCedis: booking.fareCedis,
    boardingCode: booking.boardingCode ?? '----',
  };
}

export function TicketScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const { session } = useAuth();
  const [display, setDisplay] = useState<TicketDisplay | undefined>();
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `ticket:${bookingId}`;

    async function load() {
      try {
        if (!session) throw new Error('no session');
        const res = await api.getBooking(session.token, bookingId);
        const built = await buildDisplay(res.booking);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(built));
        if (!cancelled) {
          setDisplay(built);
          setOffline(false);
        }
      } catch {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && !cancelled) {
          setDisplay(JSON.parse(cached));
          setOffline(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [bookingId, session]);

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.greenOnDark} />
      </View>
    );
  }

  if (!display) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center', padding: 20 }]}>
        <Text style={{ color: colors.textOnDark, fontFamily: fonts.display, textAlign: 'center' }}>
          No ticket cached for this trip and no connection to load it.
        </Text>
      </View>
    );
  }

  const codeDisplay = display.boardingCode.split('').join('‑');

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>SEAT CONFIRMED · ESCROW HELD</Text>
        <Text style={styles.title}>Your digital ticket</Text>
        {offline && <Text style={styles.offlineNote}>Showing your last saved ticket — you're offline.</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.ticketCard}>
          <View style={styles.ticketTop}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={styles.ticketKicker}>{display.kicker}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.codeLabel}>BOARDING CODE</Text>
                <Text style={styles.codeValue}>{codeDisplay}</Text>
              </View>
            </View>
            <View style={styles.stopRow}>
              <Text style={styles.stopName}>{display.boardName.toUpperCase()}</Text>
              <Text style={styles.stopArrow}>→</Text>
              <Text style={styles.stopName}>{display.alightName.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.dashedDivider} />
          <View style={styles.ticketBottom}>
            <InfoRow label="Operated by" value={display.operatedBy} />
            <InfoRow label="Board at" value={display.boardName} />
            <InfoRow label="Seats" value={String(display.seats)} mono />
            <InfoRow label="Paid · held" value={`₵${display.amountCedis}`} mono />
            <View style={styles.barcode} />
            <Text style={styles.refLine}>CS‑{bookingId.slice(0, 8).toUpperCase()} · WORKS OFFLINE</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={styles.doneBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && { fontFamily: fonts.monoMedium }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 52, paddingHorizontal: spacing.xl, paddingBottom: 12 },
  kicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.5, color: colors.greenOnDark },
  title: { fontFamily: fonts.displaySemiBold, fontSize: 26, letterSpacing: -0.4, color: colors.textOnDark, marginTop: 9 },
  offlineNote: { fontFamily: fonts.display, fontSize: 12, color: colors.warningAmber, marginTop: 8 },
  body: { padding: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  ticketCard: { backgroundColor: colors.paper, borderRadius: 16, overflow: 'hidden' },
  ticketTop: { padding: 17, gap: 12 },
  ticketKicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#235B28' },
  codeLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10, letterSpacing: 1, color: '#8B918A' },
  codeValue: { fontFamily: fonts.monoSemiBold, fontSize: 20, letterSpacing: 0.5, color: colors.ink },
  stopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stopName: { fontFamily: fonts.monoMedium, fontSize: 11, color: '#6D736C', letterSpacing: 0.5 },
  stopArrow: { color: '#A8ADA7' },
  dashedDivider: { height: 1, backgroundColor: '#D5D3CC' },
  ticketBottom: { padding: 17, gap: 11 },
  infoLabel: { fontFamily: fonts.display, fontSize: 13, color: '#6D736C' },
  infoValue: { fontFamily: fonts.displayMedium, fontSize: 13, color: colors.ink },
  barcode: { height: 74, borderRadius: 9, backgroundColor: colors.ink, marginTop: 3 },
  refLine: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#8B918A', textAlign: 'center', letterSpacing: 1 },
  bottomBar: { padding: 16, paddingBottom: 30, backgroundColor: '#0F120F', borderTopWidth: 1, borderTopColor: '#2B3029' },
  doneBtn: { borderRadius: radii.button, padding: 16, backgroundColor: colors.greenOnDark, alignItems: 'center' },
  doneBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: '#0E120E' },
});
