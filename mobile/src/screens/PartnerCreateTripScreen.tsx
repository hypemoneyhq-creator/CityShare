import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerCreateTrip'>;

// Recreated from CityShare App.dc.html ("List your journey" screen). No
// map/place picker exists (maps are placeholders throughout this build),
// so origin/destination coordinates are plain numeric fields defaulted
// to the seeded Western corridor rather than a map pin. The design's
// recurring-trip toggle isn't included — there's no backend support for
// repeating trips.
export function PartnerCreateTripScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [originName, setOriginName] = useState('Total Kasoa Toll');
  const [destinationName, setDestinationName] = useState('Circle');
  const [departTime, setDepartTime] = useState('06:30');
  const [seats, setSeats] = useState(3);
  const [fare, setFare] = useState('20');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [comfortAc, setComfortAc] = useState(true);
  const [comfortUsb, setComfortUsb] = useState(true);
  const [comfortBoot, setComfortBoot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fareNum = parseInt(fare, 10) || 0;
  const potentialEarning = seats * fareNum;

  async function onPublish() {
    if (!session) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const [h, m] = departTime.split(':').map(Number);
      const departAt = new Date();
      departAt.setUTCHours(h || 0, m || 0, 0, 0);
      if (departAt.getTime() < Date.now()) departAt.setUTCDate(departAt.getUTCDate() + 1);

      await api.createPartnerTrip(session.token, {
        originName,
        originLat: 5.5301,
        originLng: -0.4231,
        destinationName,
        destLat: 5.5717,
        destLng: -0.2107,
        departAt: departAt.toISOString(),
        seatsTotal: seats,
        farePerSeatCedis: fareNum,
        vehicleDescription: vehicleDescription || 'Not specified',
        comfortAc,
        comfortUsb,
        comfortBoot,
      });
      navigation.navigate('PartnerHome');
    } catch {
      setError('Could not publish this trip. Check the details and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← DRIVE</Text>
        </Pressable>
        <Text style={styles.title}>List your journey</Text>
        <Text style={styles.subtitle}>
          You're going anyway. Tell CityShare where and when, and we'll fill the empty seats.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>FROM · PICKUP POINT</Text>
            <TextInput style={styles.fieldInput} value={originName} onChangeText={setOriginName} placeholderTextColor={colors.mutedOnDarkAlt} />
          </View>
          <View style={[styles.fieldRow, { borderTopWidth: 1, borderTopColor: colors.darkSurfaceBorder }]}>
            <Text style={styles.fieldLabel}>TO</Text>
            <TextInput style={styles.fieldInput} value={destinationName} onChangeText={setDestinationName} placeholderTextColor={colors.mutedOnDarkAlt} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>DEPARTURE</Text>
          <TextInput
            style={styles.timeInput}
            value={departTime}
            onChangeText={setDepartTime}
            placeholder="HH:MM"
            placeholderTextColor={colors.mutedOnDarkAlt}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SEATS YOU'RE OFFERING</Text>
          <View style={styles.seatsRow}>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={[styles.pip, { backgroundColor: i < seats ? colors.partnerTan : colors.darkSurfaceBorder }]} />
              ))}
            </View>
            <View style={styles.stepperRow}>
              <Pressable style={styles.stepperBtn} onPress={() => setSeats((s) => Math.max(1, s - 1))}>
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{seats}</Text>
              <Pressable style={styles.stepperBtn} onPress={() => setSeats((s) => Math.min(4, s + 1))}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.fareRow}>
            <View>
              <Text style={styles.fareLabel}>Fare per seat</Text>
              <Text style={styles.fareHint}>CityShare suggests ₵18–22 on this corridor</Text>
            </View>
            <TextInput style={styles.fareInput} value={fare} onChangeText={setFare} keyboardType="number-pad" />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>THE VEHICLE</Text>
          <TextInput
            style={styles.fieldInput}
            value={vehicleDescription}
            onChangeText={setVehicleDescription}
            placeholder="e.g. Toyota Corolla · silver"
            placeholderTextColor={colors.mutedOnDarkAlt}
          />
          <ComfortRow label="Air conditioning" value={comfortAc} onChange={setComfortAc} />
          <ComfortRow label="USB charging" value={comfortUsb} onChange={setComfortUsb} />
          <ComfortRow label="Boot space" value={comfortBoot} onChange={setComfortBoot} />
        </View>

        <View style={styles.earnCard}>
          <View>
            <Text style={styles.earnLabel}>You could earn</Text>
            <Text style={styles.earnHint}>{seats} seats × ₵{fareNum}</Text>
          </View>
          <Text style={styles.earnValue}>₵{potentialEarning}</Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable style={[styles.publishBtn, submitting && { opacity: 0.6 }]} disabled={submitting} onPress={onPublish}>
          {submitting ? <ActivityIndicator color="#1C1A12" /> : <Text style={styles.publishBtnText}>Publish trip</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function ComfortRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={styles.comfortLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.partnerTan }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 44, paddingHorizontal: spacing.xl, paddingBottom: 16 },
  backLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.mutedOnDark, letterSpacing: 0.6 },
  title: { fontFamily: fonts.displaySemiBold, fontSize: 25, letterSpacing: -0.4, color: colors.textOnDark, marginTop: 14 },
  subtitle: { fontFamily: fonts.display, fontSize: 13, lineHeight: 19, color: colors.mutedOnDark, marginTop: 6, maxWidth: 290 },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 14, padding: 15, gap: 12 },
  fieldRow: { paddingVertical: 4, gap: 4 },
  fieldLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: '#8B918A' },
  fieldInput: { fontFamily: fonts.displayMedium, fontSize: 15.5, color: colors.textOnDark, padding: 0 },
  cardLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B918A' },
  timeInput: { fontFamily: fonts.monoSemiBold, fontSize: 30, letterSpacing: -0.6, color: colors.textOnDark, padding: 0 },
  seatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pip: { width: 13, height: 13, borderRadius: 3 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.darkSurfaceBorderAlt, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontFamily: fonts.displayMedium, fontSize: 20, color: colors.textOnDark },
  stepperValue: { fontFamily: fonts.monoSemiBold, fontSize: 20, color: colors.textOnDark },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.darkSurfaceBorder,
  },
  fareLabel: { fontFamily: fonts.display, fontSize: 13, color: '#C9CEC8' },
  fareHint: { fontFamily: fonts.display, fontSize: 11.5, color: '#8B918A', marginTop: 2 },
  fareInput: { fontFamily: fonts.monoSemiBold, fontSize: 22, letterSpacing: -0.4, color: colors.textOnDark, minWidth: 50, textAlign: 'right' },
  comfortLabel: { fontFamily: fonts.display, fontSize: 13.5, color: '#C9CEC8' },
  earnCard: {
    backgroundColor: colors.darkSurfaceCard,
    borderWidth: 1,
    borderColor: colors.darkSurfaceBorder,
    borderRadius: 14,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earnLabel: { fontFamily: fonts.display, fontSize: 13.5, color: '#C9CEC8' },
  earnHint: { fontFamily: fonts.display, fontSize: 11.5, color: '#8B918A', marginTop: 2 },
  earnValue: { fontFamily: fonts.monoSemiBold, fontSize: 24, letterSpacing: -0.5, color: '#D8C79A' },
  bottomBar: { padding: 16, paddingBottom: 30, backgroundColor: '#0D0F0B', borderTopWidth: 1, borderTopColor: colors.darkSurfaceBorder, gap: 9 },
  errorText: { fontFamily: fonts.display, fontSize: 12.5, color: colors.disputeRed, textAlign: 'center' },
  publishBtn: { borderRadius: radii.button, padding: 17, backgroundColor: colors.partnerTan, alignItems: 'center' },
  publishBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: '#1C1A12' },
});
