import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, Corridor } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

// Recreated from CityShare App.dc.html ("Search home" screen). The design
// shows a free-text origin/destination search plus a "your commute" /
// savings section — this build only has one seeded corridor and no trip
// history to compute real savings from, so this screen shows that one
// corridor as a fixed search card and drops the savings section rather
// than fabricate numbers.

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function SearchHomeScreen({ navigation }: Props) {
  const { session, setSession } = useAuth();
  const [corridor, setCorridor] = useState<Corridor | undefined>();
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(true);

  async function goPartnerMode() {
    if (!session) return;
    if (!session.user.isPartner) {
      const res = await api.becomePartner(session.token);
      setSession({ token: session.token, user: res.user });
    }
    navigation.navigate('PartnerHome');
  }

  async function goDriverMode() {
    if (!session) return;
    if (!session.user.isDriver) {
      const res = await api.becomeDriver(session.token);
      setSession({ token: session.token, user: res.user });
    }
    navigation.navigate('DriverShift');
  }

  useEffect(() => {
    api
      .getCorridors()
      .then((res) => setCorridor(res.corridors[0]))
      .finally(() => setLoading(false));
  }, []);

  const initials = (session?.user.firstName?.[0] ?? session?.user.phone.slice(-2, -1) ?? '?').toUpperCase();
  const firstName = session?.user.firstName ?? 'Rider';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.dateLine}>Today</Text>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>
        <Text style={styles.greeting}>Where are you{'\n'}going, {firstName}?</Text>
      </View>

      <View style={styles.cardWrap}>
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator style={{ padding: 20 }} color={colors.shareGreen} />
          ) : corridor ? (
            <>
              <View style={[styles.field, styles.fieldBorder]}>
                <View style={[styles.dot, { backgroundColor: colors.shareGreen, borderRadius: 4.5 }]} />
                <View style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>FROM</Text>
                  <Text style={styles.fieldValue}>{corridor.origin}</Text>
                </View>
              </View>
              <View style={styles.field}>
                <View style={[styles.dot, { backgroundColor: colors.ink, borderRadius: 2 }]} />
                <View style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>TO</Text>
                  <Text style={styles.fieldValue}>{corridor.destination}</Text>
                </View>
              </View>
              <View style={styles.row}>
                <View style={[styles.halfField, styles.rightBorder]}>
                  <Text style={styles.fieldLabel}>DEPART AFTER</Text>
                  <Text style={styles.mono}>06:00</Text>
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>SEATS</Text>
                  <View style={styles.seatStepper}>
                    <Pressable onPress={() => setSeats((s) => Math.max(1, s - 1))} hitSlop={8}>
                      <Text style={styles.stepperBtn}>−</Text>
                    </Pressable>
                    <Text style={styles.mono}>{seats}</Text>
                    <Pressable onPress={() => setSeats((s) => Math.min(4, s + 1))} hitSlop={8}>
                      <Text style={styles.stepperBtn}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              <Pressable
                style={styles.findButton}
                onPress={() =>
                  navigation.navigate('Results', {
                    corridorId: corridor.id,
                    corridorLabel: `${corridor.origin} → ${corridor.destination}`,
                    seats,
                  })
                }
              >
                <Text style={styles.findButtonText}>Find seats</Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ padding: 20, color: colors.mutedOnDarkAlt }}>No corridors available.</Text>
          )}
        </View>
      </View>

      <View style={styles.modeRow}>
        <Pressable style={styles.modeBtn} onPress={goPartnerMode}>
          <Text style={styles.modeBtnText}>{session?.user.isPartner ? 'Partner mode' : 'Become a Partner'}</Text>
        </Pressable>
        <Pressable style={styles.modeBtn} onPress={goDriverMode}>
          <Text style={styles.modeBtnText}>{session?.user.isDriver ? 'Driver mode' : 'Become a driver'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { backgroundColor: colors.ink, paddingTop: 48, paddingHorizontal: spacing.xl, paddingBottom: 18 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLine: { fontFamily: fonts.display, fontSize: 13, color: colors.mutedOnDark },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.darkSurfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: colors.greenOnDarkHover },
  greeting: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.6,
    color: colors.textOnDark,
    marginTop: 8,
  },
  cardWrap: { paddingHorizontal: spacing.lg, marginTop: -14 },
  card: { backgroundColor: colors.card, borderRadius: radii.sheet - 4, overflow: 'hidden' },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 15 },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: colors.hairlineOnWhite },
  dot: { width: 9, height: 9 },
  fieldText: { flex: 1, gap: 1 },
  fieldLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: '#9A9D95' },
  fieldValue: { fontFamily: fonts.displayMedium, fontSize: 16, color: colors.ink },
  row: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.hairlineOnWhite },
  halfField: { flex: 1, padding: 13, gap: 2 },
  rightBorder: { borderRightWidth: 1, borderRightColor: colors.hairlineOnWhite },
  mono: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: colors.ink },
  seatStepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.ink, paddingHorizontal: 4 },
  findButton: { padding: 16, backgroundColor: colors.shareGreen, alignItems: 'center' },
  findButtonText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: '#fff' },
  modeRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D8D7D1',
    borderRadius: radii.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeBtnText: { fontFamily: fonts.displayMedium, fontSize: 13, color: colors.ink },
});
