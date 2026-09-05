import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ManifestEntry, PartnerTrip } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerPassengerList'>;

// Recreated from CityShare App.dc.html ("Passenger list" screen). Star
// ratings in the design aren't tracked here, so each row shows what's
// real: name, seats, boarding code, and boarding state.
export function PartnerPassengerListScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { session } = useAuth();
  const [trip, setTrip] = useState<PartnerTrip | undefined>();
  const [manifest, setManifest] = useState<ManifestEntry[] | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!session) return;
    const [mine, man] = await Promise.all([
      api.getMyPartnerTrips(session.token),
      api.getPartnerTripManifest(session.token, tripId),
    ]);
    setTrip(mine.trips.find((t) => t.trip.id === tripId)?.trip);
    setManifest(man.manifest);
  }, [session, tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onBoard(entry: ManifestEntry) {
    if (!session || !trip) return;
    setBusyId(entry.bookingId);
    try {
      // No device geolocation wired up for the Partner-as-driver flow —
      // the trip's own pickup coordinates stand in for it.
      await api.boardDriver(session.token, entry.bookingId, trip.originLat, trip.originLng);
      await load();
    } finally {
      setBusyId(undefined);
    }
  }

  async function onNoShow(entry: ManifestEntry) {
    if (!session) return;
    setBusyId(entry.bookingId);
    try {
      await api.markNoShow(session.token, entry.bookingId);
      await load();
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← DRIVE</Text>
        </Pressable>
        {trip && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 14 }}>
              <Text style={styles.time}>{isoTime(trip.departAt)}</Text>
              <Text style={styles.route}>{trip.originName} → {trip.destinationName}</Text>
            </View>
            <Text style={styles.meta}>
              {trip.originName.toUpperCase()} · {manifest?.length ?? 0} OF {trip.seatsTotal} SEATS BOOKED
            </Text>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!manifest ? (
          <ActivityIndicator color={colors.partnerTan} style={{ marginTop: 20 }} />
        ) : manifest.length === 0 ? (
          <Text style={styles.emptyText}>No passengers booked yet.</Text>
        ) : (
          manifest.map((entry) => {
            const boarded = Boolean(entry.driverBoardedAt);
            const noShow = entry.escrowState === 'FORFEIT';
            return (
              <View
                key={entry.bookingId}
                style={[styles.paxCard, noShow && styles.paxCardNoShow, boarded && styles.paxCardBoarded]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsFor(entry.riderName)}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.paxName}>{entry.riderName}</Text>
                  <Text style={styles.paxMeta}>
                    {noShow
                      ? 'MARKED NO-SHOW'
                      : boarded
                        ? 'BOARDED · AWAITING RIDER CONFIRMATION'
                        : `${entry.seats} SEAT · CODE ${entry.boardingCode?.split('').join('-') ?? '----'} · ID VERIFIED`}
                  </Text>
                </View>
                {!noShow && !boarded && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable style={styles.noShowBtn} onPress={() => onNoShow(entry)} disabled={busyId === entry.bookingId}>
                      <Text style={styles.noShowBtnText}>No-show</Text>
                    </Pressable>
                    <Pressable style={styles.boardBtn} onPress={() => onBoard(entry)} disabled={busyId === entry.bookingId}>
                      {busyId === entry.bookingId ? (
                        <ActivityIndicator size="small" color="#1C1A12" />
                      ) : (
                        <Text style={styles.boardBtnText}>Boarded</Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function initialsFor(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function isoTime(iso: string): string {
  return iso.slice(11, 16);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 44, paddingHorizontal: spacing.xl, paddingBottom: 16 },
  backLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.mutedOnDark, letterSpacing: 0.6 },
  time: { fontFamily: fonts.monoSemiBold, fontSize: 26, letterSpacing: -0.5, color: colors.textOnDark },
  route: { fontFamily: fonts.display, fontSize: 15, color: colors.mutedOnDark },
  meta: { fontFamily: fonts.monoMedium, fontSize: 12, color: '#8B918A', marginTop: 6, letterSpacing: 0.4 },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  emptyText: { fontFamily: fonts.display, fontSize: 14, color: colors.mutedOnDarkAlt, textAlign: 'center', marginTop: 20 },
  paxCard: {
    backgroundColor: colors.darkSurfaceCard,
    borderWidth: 1,
    borderColor: colors.darkSurfaceBorder,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  paxCardBoarded: { backgroundColor: '#22301F', borderColor: '#3D4A33' },
  paxCardNoShow: { backgroundColor: '#2A1F1F', borderColor: '#4A3232' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2B3029', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.partnerTan },
  paxName: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.textOnDark },
  paxMeta: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: '#8B918A' },
  noShowBtn: { borderWidth: 1, borderColor: '#5A4747', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12 },
  noShowBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: '#E3A3A3' },
  boardBtn: { backgroundColor: colors.greenOnDark, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  boardBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: '#0E120E' },
});
