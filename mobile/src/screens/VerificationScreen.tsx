import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { UserProfile } from '../api/client';
import { useVerification } from '../hooks/useVerification';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, radii, spacing } from '../theme/tokens';

// Recreated from CityShare App.dc.html ("Verification" screen, vstep 0-2).
// The prototype hardcoded the phone number and jumped straight to a filled
// code; here the phone step is a real two-part flow (enter number, then
// confirm the code) using the same box styling the design specifies.

interface StepCopy {
  kicker: string;
  title: string;
  body: string;
}

const STEP_COPY: Record<'phone' | 'identity' | 'done', StepCopy> = {
  phone: {
    kicker: 'STEP 1 OF 3',
    title: 'Verify your\nphone number',
    body: 'CityShare connects strangers. Everyone on the platform is verified before they ride or drive.',
  },
  identity: {
    kicker: 'STEP 2 OF 3',
    title: 'Verify your\nidentity',
    body: 'Your Ghana Card is matched against a live selfie. Riders see only your first name and rating.',
  },
  done: {
    kicker: 'VERIFIED',
    title: "You're ready\nto ride",
    body: '',
  },
};

export function VerificationScreen() {
  const v = useVerification();
  const { setSession } = useAuth();
  const copy = STEP_COPY[v.step];

  const seg2Active = v.step === 'identity' || v.step === 'done';
  const seg3Active = v.step === 'done';

  const cta = useMemo(() => {
    if (v.step === 'phone') return v.codeSent ? 'Confirm code' : 'Send code';
    if (v.step === 'identity') return 'Continue';
    return 'Find my first seat';
  }, [v.step, v.codeSent]);

  const ctaDisabled =
    v.loading ||
    (v.step === 'phone' && v.codeSent && v.code.length < 4) ||
    (v.step === 'identity' && v.identityStatus !== 'done');

  const onPressCta = () => {
    if (v.step === 'phone') {
      if (!v.codeSent) v.sendCode();
      else v.confirmCode();
      return;
    }
    if (v.step === 'identity') {
      v.continueFromIdentity();
      return;
    }
    if (v.user && v.token) setSession({ token: v.token, user: v.user });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.progressRow}>
        <View style={[styles.progressSeg, { backgroundColor: colors.greenOnDark }]} />
        <View style={[styles.progressSeg, { backgroundColor: seg2Active ? colors.greenOnDark : colors.darkSurfaceBorderAlt }]} />
        <View style={[styles.progressSeg, { backgroundColor: seg3Active ? colors.greenOnDark : colors.darkSurfaceBorderAlt }]} />
      </View>

      <Text style={styles.kicker}>{copy.kicker}</Text>
      <Text style={styles.title}>{copy.title}</Text>
      {copy.body ? <Text style={styles.body}>{copy.body}</Text> : null}

      <View style={styles.content}>
        {v.step === 'phone' && (
          <PhoneStep
            phone={v.phone}
            setPhone={v.setPhone}
            code={v.code}
            setCode={v.setCode}
            codeSent={v.codeSent}
            resendSeconds={v.resendSeconds}
            devCode={v.devCode}
            onResend={v.sendCode}
          />
        )}
        {v.step === 'identity' && <IdentityStep status={v.identityStatus} />}
        {v.step === 'done' && v.user && <DoneStep user={v.user} />}
      </View>

      <View style={styles.footer}>
        {v.error ? <Text style={styles.errorText}>{v.error}</Text> : null}
        <Pressable
          onPress={onPressCta}
          disabled={ctaDisabled}
          style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
        >
          {v.loading ? (
            <ActivityIndicator color={colors.darkSurfaceBg} />
          ) : (
            <Text style={styles.ctaText}>{cta}</Text>
          )}
        </Pressable>
        <Text style={styles.footnote}>
          Verification requirements will be finalised with legal, insurance and transport specialists.
        </Text>
      </View>
    </View>
  );
}

function PhoneStep({
  phone,
  setPhone,
  code,
  setCode,
  codeSent,
  resendSeconds,
  devCode,
  onResend,
}: {
  phone: string;
  setPhone: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  codeSent: boolean;
  resendSeconds: number;
  devCode?: string;
  onResend: () => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.fieldBox}>
        <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          editable={!codeSent}
          keyboardType="phone-pad"
          placeholder="+233 24 418 7702"
          placeholderTextColor={colors.mutedOnDarkAlt}
          style={styles.fieldValue}
        />
      </View>

      {codeSent && (
        <>
          <View style={styles.digitRow}>
            {[0, 1, 2, 3].map((i) => {
              const filled = code[i];
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.digitBox,
                    active && styles.digitBoxActive,
                  ]}
                >
                  <Text style={styles.digitText}>{filled ?? ''}</Text>
                </View>
              );
            })}
            {/* Invisible input drives all four boxes so digit entry works
                with the platform keyboard without a custom key handler. */}
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={4}
              style={styles.hiddenInput}
              autoFocus
            />
          </View>
          <Pressable onPress={onResend} disabled={resendSeconds > 0}>
            <Text style={styles.hint}>
              {resendSeconds > 0
                ? `Code sent by SMS. Resend in 0:${String(resendSeconds).padStart(2, '0')}`
                : 'Code sent by SMS. Resend code'}
              {devCode ? ` (dev: ${devCode})` : ''}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function IdentityStep({ status }: { status: 'idle' | 'pending' | 'done' }) {
  const matched = status === 'done';
  return (
    <View style={{ gap: spacing.smd }}>
      <MatchedCard title="Ghana Card" subtitle="GHA‑7248‑1190‑4" matched={matched} />
      <MatchedCard title="Selfie check" subtitle="Liveness passed" matched={matched} />
      <View style={[styles.fieldBox, styles.dashedBox]}>
        <View>
          <Text style={styles.matchedTitle}>Vehicle documents</Text>
          <Text style={styles.matchedSubtitle}>Only needed to become a Partner</Text>
        </View>
        <Text style={styles.laterLabel}>LATER</Text>
      </View>
    </View>
  );
}

function MatchedCard({ title, subtitle, matched }: { title: string; subtitle: string; matched: boolean }) {
  return (
    <View style={styles.fieldBox}>
      <View>
        <Text style={styles.matchedTitle}>{title}</Text>
        <Text style={styles.matchedSubtitle}>{subtitle}</Text>
      </View>
      {matched ? (
        <Text style={styles.matchedBadge}>MATCHED</Text>
      ) : (
        <ActivityIndicator size="small" color={colors.mutedOnDarkAlt} />
      )}
    </View>
  );
}

function DoneStep({ user }: { user: UserProfile }) {
  const initials = (user.firstName?.[0] ?? user.phone.slice(-2, -1)) + (user.lastName?.[0] ?? user.phone.slice(-1));
  return (
    <View style={{ gap: spacing.mdl, alignItems: 'flex-start' }}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
      </View>
      <View style={styles.chipRow}>
        <Text style={styles.chip}>ID VERIFIED</Text>
        <Text style={styles.chip}>PHONE VERIFIED</Text>
        <Text style={[styles.chip, styles.chipNeutral]}>RIDER · BASIC</Text>
      </View>
      <Text style={styles.doneBody}>
        Your seats are protected by CityShare escrow. Money only reaches the driver after you confirm you boarded.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.darkSurfaceBg,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  progressRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: 34 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2 },
  kicker: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10.5,
    letterSpacing: 2.2,
    color: colors.greenOnDark,
  },
  title: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.textOnDark,
    marginTop: spacing.md,
  },
  body: {
    fontFamily: fonts.display,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.mutedOnDark,
    marginTop: spacing.md,
    maxWidth: 300,
  },
  content: { marginTop: 32, flex: 1 },
  fieldBox: {
    backgroundColor: colors.darkSurfaceCardAlt,
    borderWidth: 1,
    borderColor: colors.darkSurfaceBorderAlt,
    borderRadius: radii.card,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  dashedBox: { borderStyle: 'dashed', borderColor: '#4A5145' },
  fieldLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.mutedOnDarkAlt,
  },
  fieldValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 19,
    letterSpacing: -0.2,
    color: colors.textOnDark,
    padding: 0,
    marginTop: 2,
  },
  digitRow: { flexDirection: 'row', gap: spacing.sm, position: 'relative' },
  digitBox: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.darkSurfaceCardAlt,
    borderWidth: 1,
    borderColor: colors.darkSurfaceBorderAlt,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitBoxActive: { borderWidth: 1.5, borderColor: colors.greenOnDark },
  digitText: { fontFamily: fonts.monoSemiBold, fontSize: 26, color: colors.textOnDark },
  hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
  hint: { fontFamily: fonts.display, fontSize: 12.5, color: colors.mutedOnDarkAlt },
  matchedTitle: { fontFamily: fonts.displayMedium, fontSize: 14.5, color: colors.textOnDark },
  matchedSubtitle: { fontFamily: fonts.display, fontSize: 12, color: colors.mutedOnDarkAlt, marginTop: 3 },
  matchedBadge: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.7,
    backgroundColor: colors.matchedChipBg,
    color: colors.matchedChipInk,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  laterLabel: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 0.7, color: colors.mutedOnDarkAlt },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.greenOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.displaySemiBold, fontSize: 30, color: '#0E120E' },
  chipRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.8,
    backgroundColor: colors.matchedChipBg,
    color: colors.matchedChipInk,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 4,
    overflow: 'hidden',
  },
  chipNeutral: { backgroundColor: colors.darkSurfaceCardAlt, color: colors.mutedOnDarkAlt },
  doneBody: { fontFamily: fonts.display, fontSize: 13.5, lineHeight: 20, color: colors.mutedOnDark },
  footer: { marginTop: 'auto', gap: spacing.md },
  errorText: { fontFamily: fonts.display, fontSize: 12.5, color: colors.disputeRed, textAlign: 'center' },
  cta: {
    width: '100%',
    borderRadius: radii.button,
    paddingVertical: 17,
    backgroundColor: colors.greenOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: '#0E120E' },
  footnote: { fontFamily: fonts.display, fontSize: 11.5, lineHeight: 16.5, color: '#6D736C', textAlign: 'center' },
});
