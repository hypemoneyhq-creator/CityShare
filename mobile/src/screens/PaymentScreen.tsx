import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, Booking, ForceOutcome } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Payment'>;

// Recreated from CityShare App.dc.html ("Pay and hold" screen). The design
// adds an illustrative ₵1 booking fee on top of the fare; the backend
// doesn't charge one, so this screen shows exactly the amount that will
// actually be held in escrow rather than a number that wouldn't match
// what gets charged.
export function PaymentScreen({ route, navigation }: Props) {
  const { kind, holdId, fareCedis, seats, summary } = route.params;
  const { session } = useAuth();
  const [status, setStatus] = useState<'idle' | 'pending' | 'void' | 'error'>('idle');
  const [booking, setBooking] = useState<Booking | undefined>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  async function pay(forceOutcome?: ForceOutcome) {
    if (!session) return;
    setStatus('pending');
    try {
      const payFn = kind === 'RUN' ? api.payRunHold : api.payPartnerHold;
      const res = await payFn(session.token, holdId, forceOutcome);
      setBooking(res.booking);
      pollRef.current = setInterval(async () => {
        const fresh = await api.getBooking(session.token, res.booking.id);
        setBooking(fresh.booking);
        const state = fresh.booking.escrow?.state;
        if (state === 'HELD') {
          clearInterval(pollRef.current);
          navigation.replace('Ticket', { bookingId: fresh.booking.id });
        } else if (state === 'VOID') {
          clearInterval(pollRef.current);
          setStatus('void');
        }
      }, 2000);
    } catch {
      setStatus('error');
    }
  }

  const isPending = status === 'pending' && booking?.escrow?.state === 'PENDING';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} disabled={isPending}>
          <Text style={styles.backLink}>← TRIP</Text>
        </Pressable>
        <Text style={styles.title}>Pay and hold</Text>
        <Text style={styles.subtitle}>
          Your money goes to CityShare escrow, not to the driver. It is released after you confirm you boarded.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PAY WITH</Text>
          <View style={styles.momoOption}>
            <View style={styles.momoIcon} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.optionTitle}>Mobile Money</Text>
              <Text style={styles.optionMeta}>{session?.user.phone}</Text>
            </View>
            <View style={styles.radioSelected} />
          </View>
          <View style={styles.disabledOption}>
            <View style={styles.disabledIcon} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.optionTitle}>CityShare Wallet</Text>
              <Text style={styles.optionMeta}>NOT AVAILABLE YET</Text>
            </View>
            <View style={styles.radio} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SUMMARY</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{summary}</Text>
            <Text style={styles.summaryValue}>₵{fareCedis}</Text>
          </View>
          <View style={styles.escrowRow}>
            <Text style={styles.escrowLabel}>Held in escrow</Text>
            <Text style={styles.escrowValue}>₵{fareCedis}</Text>
          </View>
        </View>

        <View style={styles.explainerCard}>
          <Text style={styles.cardLabel}>WHAT HAPPENS NEXT</Text>
          <ExplainerStep n="01" text="Driver arrives at the pickup point and taps Boarded" />
          <ExplainerStep n="02" text="You get a notification and tap Confirm boarding" />
          <ExplainerStep n="03" text="Escrow releases the fare to the driver" />
        </View>

        {__DEV__ && (
          <View style={styles.devCard}>
            <Text style={styles.devLabel}>DEV TEST CONTROLS — force the mock MoMo outcome</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={styles.devBtn} onPress={() => pay('APPROVED')}>
                <Text style={styles.devBtnText}>Approve</Text>
              </Pressable>
              <Pressable style={styles.devBtn} onPress={() => pay('DECLINED')}>
                <Text style={styles.devBtnText}>Decline</Text>
              </Pressable>
              <Pressable style={styles.devBtn} onPress={() => pay('TIMEOUT')}>
                <Text style={styles.devBtnText}>Timeout</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        {status === 'void' && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>MOMO PROMPT NOT APPROVED</Text>
            <Text style={styles.errorBody}>
              Nothing was charged. Your seat has been released back to inventory — search again to rebook.
            </Text>
          </View>
        )}
        {status === 'error' && <Text style={styles.plainError}>Something went wrong. Try again.</Text>}
        <Pressable
          style={[styles.payBtn, (isPending || status === 'void') && styles.payBtnDisabled]}
          disabled={isPending || status === 'void'}
          onPress={() => pay()}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payBtnText}>{status === 'void' ? 'Back to results' : `Pay ₵${fareCedis}`}</Text>
          )}
        </Pressable>
        <Text style={styles.footnote}>
          {isPending ? 'Waiting for the MoMo prompt on your phone…' : 'Nothing is charged until you approve the prompt.'}
        </Text>
      </View>
    </View>
  );
}

function ExplainerStep({ n, text }: { n: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 11 }}>
      <Text style={styles.stepNumber}>{n}</Text>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { backgroundColor: colors.ink, paddingTop: 44, paddingHorizontal: spacing.xl, paddingBottom: 18 },
  backLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.mutedOnDark, letterSpacing: 0.6 },
  title: { fontFamily: fonts.displaySemiBold, fontSize: 25, letterSpacing: -0.4, color: colors.textOnDark, marginTop: 14 },
  subtitle: { fontFamily: fonts.display, fontSize: 13, lineHeight: 19, color: colors.mutedOnDark, marginTop: 6, maxWidth: 290 },
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: radii.card, padding: 15, gap: 11 },
  cardLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1.2, color: '#8B8E86' },
  momoOption: {
    borderWidth: 1.5,
    borderColor: colors.shareGreen,
    borderRadius: 11,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F4FAF5',
  },
  momoIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.shareGreen },
  optionTitle: { fontFamily: fonts.displayMedium, fontSize: 14.5, color: colors.ink },
  optionMeta: { fontFamily: fonts.monoMedium, fontSize: 12, color: '#6D736C' },
  radioSelected: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.shareGreen },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#D0CFC9' },
  disabledOption: {
    borderWidth: 1,
    borderColor: '#E5E4DF',
    borderRadius: 11,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    opacity: 0.6,
  },
  disabledIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#E5E4DF' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: fonts.display, fontSize: 13.5, color: '#3D403B', flex: 1, marginRight: 8 },
  summaryValue: { fontFamily: fonts.monoMedium, fontSize: 13.5, color: colors.ink },
  escrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineOnWhite,
  },
  escrowLabel: { fontFamily: fonts.displayMedium, fontSize: 14.5, color: colors.ink },
  escrowValue: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.ink },
  explainerCard: { backgroundColor: colors.sand, borderRadius: radii.card, padding: 15, gap: 10 },
  stepNumber: { fontFamily: fonts.monoMedium, fontSize: 11, color: '#3F7A46', paddingTop: 2 },
  stepText: { fontFamily: fonts.display, fontSize: 13, lineHeight: 19, color: '#3D403B', flex: 1 },
  devCard: { backgroundColor: '#FFF7E6', borderRadius: radii.card, padding: 12, gap: 8 },
  devLabel: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 0.5, color: '#8A7130' },
  devBtn: { flex: 1, borderRadius: 8, padding: 9, backgroundColor: '#EFE0B8', alignItems: 'center' },
  devBtnText: { fontFamily: fonts.displayMedium, fontSize: 12, color: '#5A4A1F' },
  bottomBar: { padding: 16, paddingBottom: 30, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#E7E6E1', gap: 9 },
  errorBanner: { backgroundColor: '#F8EFEF', borderWidth: 1, borderColor: '#E6CCCC', borderRadius: 12, padding: 12, gap: 5 },
  errorTitle: { fontFamily: fonts.monoSemiBold, fontSize: 10.5, letterSpacing: 1, color: colors.disputeRed },
  errorBody: { fontFamily: fonts.display, fontSize: 12.5, lineHeight: 18, color: '#5D3D3D' },
  plainError: { fontFamily: fonts.display, fontSize: 12.5, color: colors.disputeRed, textAlign: 'center' },
  payBtn: { borderRadius: radii.button, padding: 17, backgroundColor: colors.shareGreen, alignItems: 'center' },
  payBtnDisabled: { backgroundColor: '#8B8E86' },
  payBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: '#fff' },
  footnote: { fontFamily: fonts.display, fontSize: 11, color: '#8B918A', textAlign: 'center' },
});
