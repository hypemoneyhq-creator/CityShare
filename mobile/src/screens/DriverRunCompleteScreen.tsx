import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { colors, fonts, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverRunComplete'>;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Recreated from CityShare Driver.dc.html ("Run complete" screen). The
// design's subtitle calls out a specific stop's dwell overrun and claims
// the record "feeds your operator's corridor performance" — this build
// has no Operator entity or performance-scoring system (that's step 10),
// and stopRecord only carries arrival times, not per-stop dwell length, so
// both are replaced with what's actually derivable: overall lateness at
// the last stop and a stop-by-stop on-time record.
export function DriverRunCompleteScreen({ route, navigation }: Props) {
  const { summary, serviceLabel } = route.params;
  const { stopRecord, seatsCarried, noShows } = summary;

  const timed = stopRecord.filter((s) => s.scheduled && s.arrivedAt);
  const onTimeCount = timed.filter((s) => toMinutes(s.arrivedAt!.slice(11, 16)) <= toMinutes(s.scheduled!)).length;
  const lastTimed = timed[timed.length - 1];
  const lastDelayMin = lastTimed
    ? toMinutes(lastTimed.arrivedAt!.slice(11, 16)) - toMinutes(lastTimed.scheduled!)
    : null;
  const lastStop = stopRecord[stopRecord.length - 1];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>RUN COMPLETE · {serviceLabel}</Text>
        <Text style={styles.title}>
          {lastStop?.arrivedAt ? `Arrived ${lastStop.stopName} at ${lastStop.arrivedAt.slice(11, 16)}` : 'Run complete'}
        </Text>
        {lastDelayMin != null && (
          <Text style={styles.subtitle}>
            {lastDelayMin <= 0
              ? 'On schedule at the final stop.'
              : `${lastDelayMin} minute${lastDelayMin === 1 ? '' : 's'} behind schedule at the final stop.`}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{seatsCarried}</Text>
            <Text style={styles.statLabel}>seats carried</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{noShows}</Text>
            <Text style={styles.statLabel}>no-show{noShows === 1 ? '' : 's'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: '#D8C79A' }]}>
              {onTimeCount}/{timed.length}
            </Text>
            <Text style={styles.statLabel}>stops on time</Text>
          </View>
        </View>

        <View style={styles.stopsCard}>
          <Text style={styles.stopsHeader}>STOP RECORD</Text>
          {stopRecord.map((s, i) => {
            const onTime = s.scheduled && s.arrivedAt ? toMinutes(s.arrivedAt.slice(11, 16)) <= toMinutes(s.scheduled) : null;
            const delayMin = s.scheduled && s.arrivedAt ? toMinutes(s.arrivedAt.slice(11, 16)) - toMinutes(s.scheduled) : null;
            return (
              <View key={i} style={[styles.stopRow, i !== stopRecord.length - 1 && styles.stopRowBorder]}>
                <Text style={styles.stopRowName}>{s.stopName}</Text>
                <Text style={[styles.stopRowTime, onTime === false && { color: '#D8C79A' }, onTime === true && { color: colors.greenOnDarkHover }]}>
                  {s.arrivedAt
                    ? `${s.arrivedAt.slice(11, 16)} · ${onTime ? 'ON TIME' : `${delayMin} MIN LATE`}`
                    : 'NOT RECORDED'}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.footnote}>Nothing here is visible to riders beyond their own trip.</Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={styles.backBtn} onPress={() => navigation.navigate('DriverShift')}>
          <Text style={styles.backBtnText}>Back to shift</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 56, paddingHorizontal: spacing.xl, paddingBottom: 18 },
  kicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.5, color: colors.greenOnDark },
  title: { fontFamily: fonts.displaySemiBold, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, color: colors.textOnDark, marginTop: 11 },
  subtitle: { fontFamily: fonts.display, fontSize: 13, color: '#9AA09A', marginTop: 7 },
  body: { padding: 16, paddingTop: 8, gap: 10, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 9 },
  statCard: { flex: 1, backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 14, padding: 15, gap: 4 },
  statNum: { fontFamily: fonts.monoSemiBold, fontSize: 22, letterSpacing: -0.3, color: colors.textOnDark },
  statLabel: { fontFamily: fonts.display, fontSize: 11.5, color: '#8B918A' },
  stopsCard: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 16, overflow: 'hidden' },
  stopsHeader: { padding: 13, borderBottomWidth: 1, borderBottomColor: colors.darkSurfaceBorder, fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B918A' },
  stopRow: { padding: 13, flexDirection: 'row', justifyContent: 'space-between' },
  stopRowBorder: { borderBottomWidth: 1, borderBottomColor: '#22261F' },
  stopRowName: { fontFamily: fonts.displayMedium, fontSize: 13.5, color: colors.textOnDark },
  stopRowTime: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.mutedOnDark },
  footnote: { fontFamily: fonts.display, fontSize: 11.5, lineHeight: 17, color: '#6D736C', padding: 4 },
  bottomBar: { padding: 16, paddingBottom: 30, backgroundColor: '#0D0F0B', borderTopWidth: 1, borderTopColor: colors.darkSurfaceBorder },
  backBtn: { borderRadius: 14, padding: 19, backgroundColor: colors.greenOnDark, alignItems: 'center' },
  backBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: '#0E120E' },
});
