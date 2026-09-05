import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, PartnerTrip, RunStop } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

const CANCELLATION_LADDER = [
  { label: '3+ hours before', pct: '100%' },
  { label: '2–3 hours before', pct: '80%' },
  { label: '1–2 hours before', pct: '50%' },
  { label: 'Under 30 minutes', pct: '0%' },
];

export function TripDetailScreen({ route, navigation }: Props) {
  const { selection, seats: initialSeats } = route.params;
  const { session } = useAuth();
  const [seats, setSeats] = useState(initialSeats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // RUN state
  const [stops, setStops] = useState<RunStop[]>([]);
  const [capacity, setCapacity] = useState(0);
  const [flatFareCedis, setFlatFareCedis] = useState<number | null>(null);
  const [boardStopId, setBoardStopId] = useState<string | undefined>();
  const [alightStopId, setAlightStopId] = useState<string | undefined>();

  // PARTNER state
  const [partnerTrip, setPartnerTrip] = useState<PartnerTrip | undefined>();
  const [partnerAvailable, setPartnerAvailable] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (selection.kind === 'RUN') {
        const seg = await api.getRunSegments(selection.runId);
        if (cancelled) return;
        setStops(seg.stops);
        setCapacity(seg.run.capacity);
        setFlatFareCedis(seg.service.flatFareCedis);
        setBoardStopId(seg.stops.find((s) => s.boardAllowed)?.id);
        setAlightStopId([...seg.stops].reverse().find((s) => s.alightAllowed)?.id);
      } else {
        const res = await api.getPartnerTrips();
        if (cancelled) return;
        const match = res.trips.find((t) => t.trip.id === selection.tripId);
        setPartnerTrip(match?.trip);
        setPartnerAvailable(match?.availableSeats ?? 0);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const boardSeq = stops.find((s) => s.id === boardStopId)?.sequence;
  const alightSeq = stops.find((s) => s.id === alightStopId)?.sequence;

  const legAvailability = useMemo(() => {
    if (boardSeq === undefined || alightSeq === undefined) return capacity;
    const legs = stops.filter((s) => s.sequence > boardSeq && s.sequence <= alightSeq);
    const avail = legs.map((s) => s.legAvailability ?? capacity);
    return avail.length ? Math.min(...avail) : capacity;
  }, [stops, boardSeq, alightSeq, capacity]);

  const farePerSeat = useMemo(() => {
    if (selection.kind === 'PARTNER') return partnerTrip?.farePerSeatCedis ?? 0;
    if (selection.serviceType === 'DIRECT') return flatFareCedis ?? 0;
    if (boardSeq === undefined || alightSeq === undefined) return 0;
    return stops
      .filter((s) => s.sequence > boardSeq && s.sequence <= alightSeq)
      .reduce((sum, s) => sum + (s.legFareCedis ?? 0), 0);
  }, [selection, stops, boardSeq, alightSeq, flatFareCedis, partnerTrip]);

  const fareCedis = farePerSeat * seats;

  const maxSeats = selection.kind === 'PARTNER' ? Math.min(4, partnerAvailable) : Math.min(8, legAvailability);
  const first = stops[0];
  const last = stops[stops.length - 1];

  const kicker =
    selection.kind === 'PARTNER' ? 'CITYSHARE PARTNER' : `${selection.serviceName.toUpperCase()} · ${selection.serviceCode}`;
  const depTime = selection.kind === 'PARTNER' ? partnerTrip && isoTime(partnerTrip.departAt) : first?.scheduledDeparture;
  const arrTime = selection.kind === 'PARTNER' ? undefined : last?.scheduledArrival;

  async function onReserve() {
    if (!session) return;
    setSubmitting(true);
    setError(undefined);
    try {
      if (selection.kind === 'RUN') {
        if (!boardStopId || !alightStopId) throw new Error('Choose where to board and get off.');
        const { hold, fareCedis: locked } = await api.createRunHold(session.token, selection.runId, boardStopId, alightStopId, seats);
        navigation.navigate('Payment', {
          kind: 'RUN',
          holdId: hold.id,
          fareCedis: locked,
          seats,
          summary: `${selection.serviceName} · ${first?.name} → ${last?.name}`,
        });
      } else {
        if (!partnerTrip) return;
        const { hold, fareCedis: locked } = await api.createPartnerHold(session.token, partnerTrip.id, seats);
        navigation.navigate('Payment', {
          kind: 'PARTNER',
          holdId: hold.id,
          fareCedis: locked,
          seats,
          summary: `Partner trip · ${partnerTrip.originName} → ${partnerTrip.destinationName}`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reserve this seat. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.shareGreen} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← RESULTS</Text>
        </Pressable>
        <Text style={styles.kicker}>{kicker}</Text>
        <View style={styles.timeRow}>
          <Text style={styles.timeMono}>{depTime ?? '--:--'}</Text>
          {arrTime && (
            <>
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.timeMono}>{arrTime}</Text>
            </>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {selection.kind === 'RUN' && selection.serviceType === 'STOPS' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardLabel}>YOUR LEG OF THIS SERVICE</Text>
              <Text style={styles.legLine}>
                {stops.find((s) => s.id === boardStopId)?.name} → {stops.find((s) => s.id === alightStopId)?.name}
              </Text>
            </View>
            <Text style={styles.subLabel}>BOARD AT</Text>
            <View style={styles.stopPickerRow}>
              {stops.map((s) => {
                const disabled = !s.boardAllowed || (alightSeq !== undefined && s.sequence >= alightSeq);
                const active = s.id === boardStopId;
                return (
                  <Pressable
                    key={s.id}
                    disabled={disabled}
                    onPress={() => setBoardStopId(s.id)}
                    style={[styles.stopPickerBtn, active && styles.stopPickerBtnActiveBoard, disabled && styles.stopPickerBtnDisabled]}
                  >
                    <Text style={[styles.stopPickerName, active && styles.stopPickerTextActive]}>{s.name}</Text>
                    <Text style={[styles.stopPickerTime, active && styles.stopPickerTextActive]}>
                      {s.scheduledDeparture ?? s.scheduledArrival}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.subLabel}>GET OFF AT</Text>
            <View style={styles.stopPickerRow}>
              {stops.map((s) => {
                const disabled = !s.alightAllowed || (boardSeq !== undefined && s.sequence <= boardSeq);
                const active = s.id === alightStopId;
                return (
                  <Pressable
                    key={s.id}
                    disabled={disabled}
                    onPress={() => setAlightStopId(s.id)}
                    style={[styles.stopPickerBtn, active && styles.stopPickerBtnActiveAlight, disabled && styles.stopPickerBtnDisabled]}
                  >
                    <Text style={[styles.stopPickerName, active && styles.stopPickerTextActive]}>{s.name}</Text>
                    <Text style={[styles.stopPickerTime, active && styles.stopPickerTextActive]}>
                      {s.scheduledDeparture ?? s.scheduledArrival}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.footnote}>
              You pay for your leg only — the same vehicle serves every approved pair of stops. Fares shown are
              illustrative and will be set from pilot data.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{selection.kind === 'PARTNER' ? 'BOARD AT' : 'PICKUP POINT'}</Text>
          <Text style={styles.pickupName}>
            {selection.kind === 'PARTNER' ? partnerTrip?.originName : stops.find((s) => s.id === boardStopId)?.name}
          </Text>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>MAP · PICKUP POINT</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>HOW MANY SEATS</Text>
          <View style={styles.seatsRow}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={[styles.pip, { backgroundColor: i < seats ? colors.shareGreen : '#E2E1DC' }]} />
              ))}
            </View>
            <View style={styles.stepperRow}>
              <Pressable onPress={() => setSeats((s) => Math.max(1, s - 1))} style={styles.stepperBtn}>
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{seats}</Text>
              <Pressable onPress={() => setSeats((s) => Math.min(Math.max(1, maxSeats), s + 1))} style={styles.stepperBtn}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              ₵{farePerSeat} × {seats} seat{seats > 1 ? 's' : ''}
            </Text>
            <Text style={styles.totalValue}>₵{fareCedis}</Text>
          </View>
        </View>

        {selection.kind === 'PARTNER' && partnerTrip && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>THE VEHICLE</Text>
            <View style={{ gap: 9 }}>
              <FactRow label="Air conditioning" value={partnerTrip.comfortAc ? 'Yes' : 'No'} />
              <FactRow label="USB charging" value={partnerTrip.comfortUsb ? 'Yes' : 'No'} />
              <FactRow label="Boot space" value={partnerTrip.comfortBoot ? 'Yes' : 'No'} />
              <FactRow label="Vehicle" value={partnerTrip.vehicleDescription} />
            </View>
            <Text style={styles.footnote}>
              Declared by the driver and rated by riders after every trip. If AC is listed but not used, rate it —
              repeated reports remove the listing.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CANCELLATION</Text>
          {CANCELLATION_LADDER.map((row) => (
            <View key={row.label} style={styles.cancelRow}>
              <Text style={styles.cancelLabel}>{row.label}</Text>
              <Text style={styles.cancelPct}>{row.pct}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.bottomLabel}>TOTAL</Text>
            <Text style={styles.bottomTotal}>₵{fareCedis}</Text>
          </View>
          <Pressable
            style={[styles.reserveBtn, submitting && { opacity: 0.6 }]}
            disabled={submitting || fareCedis <= 0}
            onPress={onReserve}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.reserveBtnText}>Reserve {seats > 1 ? `${seats} seats` : 'seat'}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function isoTime(iso: string): string {
  return iso.slice(11, 16);
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { backgroundColor: colors.ink, paddingTop: 44, paddingHorizontal: spacing.xl, paddingBottom: 18 },
  backLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.mutedOnDark, letterSpacing: 0.6 },
  kicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.5, color: colors.greenOnDark, marginTop: 14 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 9 },
  timeMono: { fontFamily: fonts.monoSemiBold, fontSize: 28, letterSpacing: -0.6, color: colors.textOnDark },
  arrow: { color: '#6D736C' },
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: radii.card, padding: 15, gap: 12 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B8E86' },
  legLine: { fontFamily: fonts.monoMedium, fontSize: 11, color: '#6D736C' },
  subLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: '#9A9D95' },
  stopPickerRow: { flexDirection: 'row', gap: 6 },
  stopPickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DEDCD5',
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
    gap: 2,
  },
  stopPickerBtnActiveBoard: { backgroundColor: colors.shareGreen, borderColor: colors.shareGreen },
  stopPickerBtnActiveAlight: { backgroundColor: colors.ink, borderColor: colors.ink },
  stopPickerBtnDisabled: { opacity: 0.35 },
  stopPickerName: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: colors.ink },
  stopPickerTime: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.ink, opacity: 0.75 },
  stopPickerTextActive: { color: '#fff' },
  footnote: { fontFamily: fonts.display, fontSize: 12, lineHeight: 17, color: '#6D736C', paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.hairlineOnWhite },
  pickupName: { fontFamily: fonts.displayMedium, fontSize: 16, color: colors.ink },
  mapPlaceholder: {
    height: 96,
    borderRadius: 10,
    backgroundColor: '#EEEDE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#9A9D95', letterSpacing: 0.6 },
  seatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pip: { width: 9, height: 9, borderRadius: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8D7D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontFamily: fonts.displayMedium, fontSize: 20, color: colors.ink },
  stepperValue: { fontFamily: fonts.monoSemiBold, fontSize: 20, minWidth: 16, textAlign: 'center', color: colors.ink },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineOnWhite,
  },
  totalLabel: { fontFamily: fonts.display, fontSize: 13.5, color: '#6D736C' },
  totalValue: { fontFamily: fonts.displaySemiBold, fontSize: 22, letterSpacing: -0.2, color: colors.ink },
  factLabel: { fontFamily: fonts.display, fontSize: 13.5, color: '#3D403B' },
  factValue: { fontFamily: fonts.displayMedium, fontSize: 13.5, color: colors.ink },
  cancelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelLabel: { fontFamily: fonts.display, fontSize: 12.5, color: '#3D403B' },
  cancelPct: { fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink },
  bottomBar: {
    padding: 16,
    paddingBottom: 30,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: '#E7E6E1',
    gap: 9,
  },
  errorText: { fontFamily: fonts.display, fontSize: 12.5, color: colors.disputeRed, textAlign: 'center' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bottomLabel: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#8B918A' },
  bottomTotal: { fontFamily: fonts.displaySemiBold, fontSize: 22, letterSpacing: -0.2, color: colors.ink },
  reserveBtn: {
    flex: 1,
    borderRadius: radii.button,
    padding: 16,
    backgroundColor: colors.shareGreen,
    alignItems: 'center',
  },
  reserveBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: '#fff' },
});
