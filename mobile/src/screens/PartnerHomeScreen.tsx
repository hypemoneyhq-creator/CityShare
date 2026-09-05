import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, Earnings, PartnerTrip } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerHome'>;

// Recreated from CityShare App.dc.html ("Partner mode" / isDrive screen).
// The design shows a status ladder (New/Verified/Trusted/Preferred), a
// star rating and a lifetime trip count — none of that is tracked in
// this backend (no rating system, no status-ladder field), so this
// screen shows only what's real: the partner's own trips and earnings.
export function PartnerHomeScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [trips, setTrips] = useState<{ trip: PartnerTrip; availableSeats: number }[] | undefined>();
  const [earnings, setEarnings] = useState<Earnings | undefined>();

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      api.getMyPartnerTrips(session.token).then((res) => setTrips(res.trips));
      api.getPartnerEarnings(session.token).then(setEarnings);
    }, [session]),
  );

  const nextTrip = trips?.find((t) => t.trip.status === 'SCHEDULED');
  const bookedSeats = nextTrip ? nextTrip.trip.seatsTotal - nextTrip.availableSeats : 0;
  const totalSeats = trips?.reduce((s, t) => s + t.trip.seatsTotal, 0) ?? 0;
  const totalBooked = trips?.reduce((s, t) => s + (t.trip.seatsTotal - t.availableSeats), 0) ?? 0;
  const fillRate = totalSeats > 0 ? Math.round((totalBooked / totalSeats) * 100) : 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.kicker}>PARTNER MODE</Text>
          <Pressable style={styles.switchBtn} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.switchBtnText}>Switch to riding</Text>
          </Pressable>
        </View>
        <Text style={styles.greeting}>
          {nextTrip
            ? `Morning, ${session?.user.firstName ?? 'Partner'}.\n${nextTrip.availableSeats} seat${nextTrip.availableSeats === 1 ? '' : 's'} still open.`
            : `Morning, ${session?.user.firstName ?? 'Partner'}.`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!trips ? (
          <ActivityIndicator color={colors.partnerTan} style={{ marginTop: 20 }} />
        ) : nextTrip ? (
          <View style={styles.tripCard}>
            <View style={styles.tripCardHeader}>
              <Text style={styles.tripCardLabel}>NEXT TRIP</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
              <Text style={styles.tripTime}>{isoTime(nextTrip.trip.departAt)}</Text>
              <Text style={styles.tripRoute}>
                {nextTrip.trip.originName} → {nextTrip.trip.destinationName}
              </Text>
            </View>
            <View style={styles.tripFooterRow}>
              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                {Array.from({ length: nextTrip.trip.seatsTotal }).map((_, i) => (
                  <View key={i} style={[styles.pip, { backgroundColor: i < bookedSeats ? colors.partnerTan : colors.darkSurfaceBorder }]} />
                ))}
                <Text style={styles.tripFooterText}>{bookedSeats} OF {nextTrip.trip.seatsTotal} BOOKED</Text>
              </View>
              <Text style={styles.tripFare}>₵{nextTrip.trip.farePerSeatCedis}</Text>
            </View>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('PartnerPassengerList', { tripId: nextTrip.trip.id })}
            >
              <Text style={styles.primaryBtnText}>Open passenger list</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.emptyText}>No scheduled trips yet.</Text>
        )}

        <View style={{ flexDirection: 'row', gap: 9 }}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>₵{earnings?.availableCedis ?? 0}</Text>
            <Text style={styles.statLabel}>available now</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{fillRate}%</Text>
            <Text style={styles.statLabel}>seats filled</Text>
          </View>
        </View>

        <Pressable style={styles.createBtn} onPress={() => navigation.navigate('PartnerCreateTrip')}>
          <Text style={styles.createBtnText}>+  Create a new trip</Text>
        </Pressable>

        <Pressable style={styles.earningsLink} onPress={() => navigation.navigate('PartnerEarnings')}>
          <Text style={styles.earningsLinkText}>View earnings →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function isoTime(iso: string): string {
  return iso.slice(11, 16);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 48, paddingHorizontal: spacing.xl, paddingBottom: 18 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.5, color: colors.partnerTan },
  switchBtn: { borderWidth: 1, borderColor: colors.darkSurfaceBorderAlt, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 11 },
  switchBtnText: { fontFamily: fonts.displayMedium, fontSize: 11, color: '#C9CEC8' },
  greeting: { fontFamily: fonts.displaySemiBold, fontSize: 26, lineHeight: 30, letterSpacing: -0.4, color: colors.textOnDark, marginTop: 12 },
  body: { padding: 16, paddingTop: 6, gap: 10, paddingBottom: 40 },
  tripCard: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 16, padding: 16, gap: 12 },
  tripCardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  tripCardLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: colors.partnerTan },
  tripTime: { fontFamily: fonts.monoSemiBold, fontSize: 26, letterSpacing: -0.5, color: colors.textOnDark },
  tripRoute: { fontFamily: fonts.display, fontSize: 14, color: colors.mutedOnDark },
  tripFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.darkSurfaceBorder,
  },
  pip: { width: 11, height: 11, borderRadius: 3 },
  tripFooterText: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.mutedOnDark, marginLeft: 6 },
  tripFare: { fontFamily: fonts.displaySemiBold, fontSize: 17, color: colors.textOnDark },
  primaryBtn: { borderRadius: radii.button, padding: 15, backgroundColor: colors.partnerTan, alignItems: 'center' },
  primaryBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: '#1C1A12' },
  emptyText: { fontFamily: fonts.display, fontSize: 14, color: colors.mutedOnDarkAlt, textAlign: 'center', marginVertical: 16 },
  statCard: { flex: 1, backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 14, padding: 14, gap: 3 },
  statValue: { fontFamily: fonts.monoSemiBold, fontSize: 21, letterSpacing: -0.4, color: colors.textOnDark },
  statLabel: { fontFamily: fonts.display, fontSize: 11.5, color: colors.mutedOnDark },
  createBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#4A5145', borderRadius: 14, padding: 18 },
  createBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.textOnDark },
  earningsLink: { alignItems: 'center', paddingVertical: 10 },
  earningsLinkText: { fontFamily: fonts.displayMedium, fontSize: 13, color: colors.mutedOnDark },
});
