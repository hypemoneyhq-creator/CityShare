import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CorridorStrip } from '../components/CorridorStrip';
import { api, PartnerTrip, Run, RunStop, Service } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

interface ExpressCard {
  kind: 'RUN';
  service: Service;
  run: Run;
  stops: RunStop[];
  fareCedis: number;
  seatsAvailable: number;
}

interface PartnerCard {
  kind: 'PARTNER';
  trip: PartnerTrip;
  availableSeats: number;
}

type ResultCard = ExpressCard | PartnerCard;

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function dateLabel(d: Date): string {
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}
function timeOfDay(iso: string): string {
  return iso.slice(11, 16);
}

type Filter = 'all' | 'express' | 'partner';

export function ResultsScreen({ route, navigation }: Props) {
  const { corridorId, corridorLabel, seats } = route.params;
  const [cards, setCards] = useState<ResultCard[] | undefined>();
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const corridors = await api.getCorridors();
      const corridor = corridors.corridors.find((c) => c.id === corridorId);
      const expressCards: ExpressCard[] = [];
      for (const service of corridor?.services ?? []) {
        const runsRes = await api.getServiceRuns(service.id);
        const run = runsRes.runs[0];
        if (!run) continue;
        const seg = await api.getRunSegments(run.id);
        const fareCedis =
          service.type === 'DIRECT'
            ? service.flatFareCedis ?? 0
            : seg.stops.reduce((sum, s) => sum + (s.legFareCedis ?? 0), 0);
        const legAvail = seg.stops.map((s) => s.legAvailability).filter((n): n is number => n != null);
        const seatsAvailable = legAvail.length ? Math.min(...legAvail) : 0;
        expressCards.push({ kind: 'RUN', service, run, stops: seg.stops, fareCedis, seatsAvailable });
      }

      const partnerRes = await api.getPartnerTrips(corridorId);
      const partnerCards: PartnerCard[] = partnerRes.trips.map(({ trip, availableSeats }) => ({
        kind: 'PARTNER',
        trip,
        availableSeats,
      }));

      if (!cancelled) setCards([...expressCards, ...partnerCards]);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [corridorId]);

  const cheapestExpressServiceId = useMemo(() => {
    const express = (cards ?? []).filter((c): c is ExpressCard => c.kind === 'RUN');
    if (!express.length) return undefined;
    return express.reduce((a, b) => (b.fareCedis < a.fareCedis ? b : a)).service.id;
  }, [cards]);

  const visibleCards = (cards ?? []).filter((c) => {
    if (filter === 'express') return c.kind === 'RUN';
    if (filter === 'partner') return c.kind === 'PARTNER';
    return true;
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.routeRow}>
          <Text style={styles.routeText}>{corridorLabel}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{dateLabel(new Date())}</Text>
          <Text style={styles.metaText}>DEP 06:00+</Text>
          <Text style={styles.metaText}>{seats} SEAT{seats > 1 ? 'S' : ''}</Text>
        </View>
        <View style={styles.pillRow}>
          {(['all', 'express', 'partner'] as Filter[]).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.pill, filter === f && styles.pillActive]}>
              <Text style={[styles.pillText, filter === f && styles.pillTextActive]}>
                {f === 'all' ? 'All' : f === 'express' ? 'Express only' : 'Partner only'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!cards ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.shareGreen} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {visibleCards.length === 0 && <Text style={styles.emptyText}>No seats found for this search.</Text>}
          {visibleCards.map((card) =>
            card.kind === 'RUN' ? (
              <ExpressResultCard
                key={card.service.id}
                card={card}
                isCheapest={card.service.id === cheapestExpressServiceId}
                onPress={() =>
                  navigation.navigate('TripDetail', {
                    seats,
                    selection: {
                      kind: 'RUN',
                      runId: card.run.id,
                      serviceType: card.service.type,
                      serviceCode: card.service.code,
                      serviceName: card.service.name,
                    },
                  })
                }
              />
            ) : (
              <PartnerResultCard
                key={card.trip.id}
                card={card}
                onPress={() => navigation.navigate('TripDetail', { seats, selection: { kind: 'PARTNER', tripId: card.trip.id } })}
              />
            ),
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ExpressResultCard({
  card,
  isCheapest,
  onPress,
}: {
  card: ExpressCard;
  isCheapest: boolean;
  onPress: () => void;
}) {
  const { service, run, stops, fareCedis, seatsAvailable } = card;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const full = seatsAvailable <= 0;
  const statusLabel = full ? 'FULL' : isCheapest ? 'CHEAPEST' : `${seatsAvailable} LEFT`;
  const filledPips = Math.max(0, Math.min(run.capacity, seatsAvailable));

  return (
    <Pressable onPress={onPress} disabled={full} style={[styles.card, full && styles.cardDisabled]}>
      <View style={styles.expressHeader}>
        <Text style={styles.expressHeaderCode}>
          {service.name.toUpperCase()} · {service.code}
        </Text>
        <Text style={styles.expressHeaderStatus}>{statusLabel}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.timeRow}>
          <View style={styles.timePair}>
            <Text style={styles.timeMono}>{first?.scheduledDeparture ?? '--:--'}</Text>
            <Text style={styles.arrow}>→</Text>
            <Text style={styles.timeMono}>{last?.scheduledArrival ?? '--:--'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.fareText}>₵{fareCedis}</Text>
            <Text style={styles.fareCaption}>PER SEAT</Text>
          </View>
        </View>
        <CorridorStrip stopCount={stops.length} />
        <View style={styles.stopNamesRow}>
          {stops.length === 2 ? (
            <>
              <Text style={styles.stopCode}>{first.name.toUpperCase()}</Text>
              <Text style={styles.stopCode}>NO STOPS</Text>
              <Text style={styles.stopCode}>{last.name.toUpperCase()}</Text>
            </>
          ) : (
            stops.map((s, i) => (
              <Text
                key={s.id}
                style={[styles.stopCode, i === 0 ? { textAlign: 'left' } : i === stops.length - 1 ? { textAlign: 'right' } : { textAlign: 'center', flex: 1 }]}
              >
                {s.name.toUpperCase()}
              </Text>
            ))
          )}
        </View>
        <View style={styles.operatorRow}>
          <View style={styles.operatorTile}>
            <Text style={styles.operatorTileText}>{service.code}</Text>
          </View>
          <Text style={styles.operatorName}>{service.name}</Text>
          <Text style={styles.operatorStats}>{run.capacity}-SEATER</Text>
        </View>
        <View style={styles.footerRow}>
          <View style={styles.pipsRow}>
            {Array.from({ length: run.capacity }).map((_, i) => (
              <View key={i} style={[styles.pip, { backgroundColor: i < filledPips ? colors.shareGreen : '#E2E1DC' }]} />
            ))}
          </View>
          <Text style={styles.footerText}>
            {seatsAvailable} OF {run.capacity} LEFT
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function PartnerResultCard({ card, onPress }: { card: PartnerCard; onPress: () => void }) {
  const { trip, availableSeats } = card;
  const initials = (trip.partner.firstName?.[0] ?? '?') + (trip.partner.lastName?.[0] ?? '');
  const name = `${trip.partner.firstName ?? 'Partner'} ${trip.partner.lastName?.[0] ?? ''}.`;
  const full = availableSeats <= 0;
  const comforts = [
    trip.comfortAc && { label: 'AC', ac: true },
    trip.comfortUsb && { label: 'USB CHARGING' },
    trip.comfortBoot && { label: 'BOOT SPACE' },
  ].filter((c): c is { label: string; ac?: boolean } => Boolean(c));

  return (
    <Pressable onPress={onPress} disabled={full} style={[styles.card, full && styles.cardDisabled]}>
      <View style={styles.partnerHeader}>
        <Text style={styles.partnerHeaderLabel}>CITYSHARE PARTNER</Text>
        <Text style={styles.partnerHeaderStatus}>{full ? 'FULL' : 'VERIFIED'}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}>
          <View style={styles.partnerAvatar}>
            <Text style={styles.partnerAvatarText}>{initials.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.partnerName}>{name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.fareText}>₵{trip.farePerSeatCedis}</Text>
            <Text style={styles.fareCaption}>PER SEAT</Text>
          </View>
        </View>
        <View style={styles.partnerTimeRow}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
            <Text style={styles.partnerTime}>{timeOfDay(trip.departAt)}</Text>
            <Text style={styles.partnerPickup}>{trip.originName}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
            {Array.from({ length: trip.seatsTotal }).map((_, i) => (
              <View key={i} style={[styles.pip, { backgroundColor: i < availableSeats ? colors.partnerTan : '#E2E1DC' }]} />
            ))}
            <Text style={styles.footerText}>{availableSeats} OF {trip.seatsTotal}</Text>
          </View>
        </View>
        <Text style={styles.vehicleLine}>{trip.vehicleDescription}</Text>
        {comforts.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {comforts.map((c) => (
              <Text key={c.label} style={[styles.comfortChip, c.ac && styles.comfortChipAc]}>
                {c.label}
              </Text>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { backgroundColor: colors.ink, paddingTop: 44, paddingHorizontal: spacing.xl, paddingBottom: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  routeText: { fontFamily: fonts.displaySemiBold, fontSize: 25, letterSpacing: -0.5, color: colors.textOnDark },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  metaText: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.mutedOnDark, letterSpacing: 0.5 },
  pillRow: { flexDirection: 'row', gap: 7, marginTop: 11, flexWrap: 'wrap' },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,.1)' },
  pillActive: { backgroundColor: colors.greenOnDark },
  pillText: { fontFamily: fonts.displayMedium, fontSize: 11.5, color: colors.textOnDark },
  pillTextActive: { fontFamily: fonts.displaySemiBold, color: '#0E120E' },
  list: { padding: 16, paddingTop: 10, gap: 7 },
  emptyText: { fontFamily: fonts.display, fontSize: 14, color: colors.mutedOnDarkAlt, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: colors.card, borderRadius: radii.card, overflow: 'hidden' },
  cardDisabled: { opacity: 0.55 },
  cardBody: { padding: 15, gap: 9 },
  expressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 15,
    backgroundColor: colors.greenTint,
  },
  expressHeaderCode: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#235B28' },
  expressHeaderStatus: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#3F7A46' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  timePair: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  timeMono: { fontFamily: fonts.monoSemiBold, fontSize: 24, letterSpacing: -0.6, color: colors.ink },
  arrow: { color: '#A8ADA7' },
  fareText: { fontFamily: fonts.displaySemiBold, fontSize: 21, letterSpacing: -0.2, color: colors.ink },
  fareCaption: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.mutedOnDarkAlt },
  stopNamesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stopCode: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#6D736C', letterSpacing: 0.4 },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineOnWhite,
  },
  operatorTile: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#E6E8E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorTileText: { fontFamily: fonts.displaySemiBold, fontSize: 8, color: '#5D635C' },
  operatorName: { fontFamily: fonts.display, fontSize: 12, color: '#3D403B', flex: 1 },
  operatorStats: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.mutedOnDarkAlt },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineOnWhite,
  },
  pipsRow: { flexDirection: 'row', gap: 3 },
  pip: { width: 9, height: 9, borderRadius: 2 },
  footerText: { fontFamily: fonts.monoMedium, fontSize: 11, color: '#6D736C' },
  partnerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 15,
    backgroundColor: colors.tanTint,
  },
  partnerHeaderLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#7D7154' },
  partnerHeaderStatus: { fontFamily: fonts.monoMedium, fontSize: 10.5, color: '#8E8465' },
  partnerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ECE9E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: '#7D7154' },
  partnerName: { fontFamily: fonts.displaySemiBold, fontSize: 15.5, color: colors.ink },
  partnerTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineOnWhite,
  },
  partnerTime: { fontFamily: fonts.monoSemiBold, fontSize: 20, letterSpacing: -0.4, color: colors.ink },
  partnerPickup: { fontFamily: fonts.display, fontSize: 12.5, color: '#6D736C' },
  vehicleLine: { fontFamily: fonts.display, fontSize: 12.5, color: '#6D736C' },
  comfortChip: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.4,
    backgroundColor: '#F1F0EC',
    color: '#5D635C',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  comfortChipAc: { backgroundColor: colors.acBlueBg, color: colors.acBlueInk },
});
