import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, Earnings } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerEarnings'>;

// Recreated from CityShare App.dc.html ("Earnings" screen). The design's
// "seats filled last 7 days" chart and "CityShare commission" line are
// omitted — there's no per-day history endpoint and no commission rate
// has been decided (spec: Operator revenue shares are "to be agreed";
// nothing analogous exists for Partners). "Cash out to MoMo" is shown
// disabled — payouts happen through the ops settlement cycle, not a
// rider-initiated withdrawal, so a live button here would be dishonest.
export function PartnerEarningsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [earnings, setEarnings] = useState<Earnings | undefined>();

  useEffect(() => {
    if (session) api.getPartnerEarnings(session.token).then(setEarnings);
  }, [session]);

  const lifetime = earnings ? earnings.availableCedis + earnings.pendingPayoutCedis + earnings.heldInEscrowCedis : 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← DRIVE</Text>
        </Pressable>
        <Text style={styles.kicker}>LIFETIME</Text>
        <Text style={styles.total}>
          ₵{lifetime}
          <Text style={styles.totalDecimals}>.00</Text>
        </Text>
      </View>

      {!earnings ? (
        <ActivityIndicator color={colors.partnerTan} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>AVAILABLE NOW</Text>
              <Text style={styles.rowValue}>₵{earnings.availableCedis}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>PENDING PAYOUT</Text>
              <Text style={[styles.rowValue, { color: '#D8C79A' }]}>₵{earnings.pendingPayoutCedis}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>HELD IN ESCROW</Text>
              <Text style={[styles.rowValue, { color: '#D8C79A' }]}>₵{earnings.heldInEscrowCedis}</Text>
            </View>
            <Pressable style={styles.cashOutBtn} disabled>
              <Text style={styles.cashOutBtnText}>Cash out to MoMo</Text>
            </Pressable>
            <Text style={styles.cashOutNote}>Escrow releases as riders confirm boarding; payouts follow the settlement cycle.</Text>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listHeader}>RECENT PAYOUTS</Text>
            {earnings.recentPayouts.length === 0 ? (
              <Text style={styles.emptyRow}>No payouts yet.</Text>
            ) : (
              earnings.recentPayouts.map((p) => (
                <View key={p.id} style={styles.listRow}>
                  <View>
                    <Text style={styles.listRowTitle}>{p.status}</Text>
                    <Text style={styles.listRowMeta}>{new Date(p.createdAt).toDateString()}</Text>
                  </View>
                  <Text style={styles.listRowValue}>+₵{p.amountCedis}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  header: { paddingTop: 44, paddingHorizontal: spacing.xl, paddingBottom: 18 },
  backLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.mutedOnDark, letterSpacing: 0.6 },
  kicker: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.5, color: colors.partnerTan, marginTop: 14 },
  total: { fontFamily: fonts.monoSemiBold, fontSize: 40, letterSpacing: -0.8, color: colors.textOnDark, marginTop: 8 },
  totalDecimals: { fontFamily: fonts.display, fontSize: 15, color: '#8B918A' },
  body: { padding: 16, paddingTop: 6, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 14, padding: 15, gap: 11 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B918A' },
  rowValue: { fontFamily: fonts.monoSemiBold, fontSize: 19, letterSpacing: -0.4, color: colors.textOnDark },
  cashOutBtn: { borderRadius: radii.button, padding: 15, backgroundColor: colors.darkSurfaceBorder, alignItems: 'center' },
  cashOutBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: '#8B918A' },
  cashOutNote: { fontFamily: fonts.display, fontSize: 11.5, color: '#8B918A', textAlign: 'center' },
  listCard: { backgroundColor: colors.darkSurfaceCard, borderWidth: 1, borderColor: colors.darkSurfaceBorder, borderRadius: 14, overflow: 'hidden' },
  listHeader: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: '#8B918A',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkSurfaceBorder,
  },
  emptyRow: { fontFamily: fonts.display, fontSize: 13, color: '#8B918A', padding: 15 },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkSurfaceBorder,
  },
  listRowTitle: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.textOnDark },
  listRowMeta: { fontFamily: fonts.monoMedium, fontSize: 11, color: '#8B918A', marginTop: 2 },
  listRowValue: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: colors.textOnDark },
});
