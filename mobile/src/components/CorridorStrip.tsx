import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

// The corridor strip from the Results screen anatomy: solid dots at the
// terminals, hollow dots at intermediate stops, connected by a line —
// this is what makes an Express row read as "timetable-shaped" at a
// glance (spec section 10).
export function CorridorStrip({ stopCount }: { stopCount: number }) {
  const dots = Array.from({ length: stopCount });
  return (
    <View style={styles.row}>
      {dots.map((_, i) => {
        const isTerminal = i === 0 || i === stopCount - 1;
        return (
          <View key={i} style={styles.segment}>
            <View style={isTerminal ? styles.solidDot : styles.hollowDot} />
            {i < stopCount - 1 && <View style={styles.line} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  segment: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  solidDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.shareGreen },
  hollowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.shareGreen,
  },
  line: { flex: 1, height: 2, backgroundColor: colors.shareGreen },
});
