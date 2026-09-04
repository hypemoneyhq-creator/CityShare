import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, UserProfile } from '../api/client';

export type VerificationStep = 'phone' | 'identity' | 'done';

const RESEND_COOLDOWN_SECONDS = 30;

// There is no NIA / Ghana Card OCR integration yet (README blocker #3),
// so the identity step submits fixed mock values that match the design
// copy ("GHA‑7248‑1190‑4") — the backend mocks an instant match behind
// the same /api/auth/identity contract a real verification vendor will use.
const MOCK_GHANA_CARD_NUMBER = 'GHA-7248-1190-4';
const MOCK_SELFIE_PLACEHOLDER = 'mock-selfie-capture';

export function useVerification() {
  const [step, setStep] = useState<VerificationStep>('phone');
  const [phone, setPhone] = useState('+233');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [identityStatus, setIdentityStatus] = useState<'idle' | 'pending' | 'done'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [user, setUser] = useState<UserProfile | undefined>();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSeconds]);

  const sendCode = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      const res = await api.startPhoneVerification(phone);
      setCodeSent(true);
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      setDevCode(res.devCode);
      setCode('');
    } catch (err) {
      setError(describeError(err, 'invalid_phone', 'Enter a valid mobile number.'));
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const identityRequested = useRef(false);
  const submitIdentity = useCallback(async () => {
    if (!token) return;
    setIdentityStatus('pending');
    try {
      const res = await api.submitIdentity(token, MOCK_GHANA_CARD_NUMBER, MOCK_SELFIE_PLACEHOLDER);
      setUser(res.user);
      setIdentityStatus('done');
    } catch (err) {
      setError(describeError(err, undefined, 'Could not verify your identity. Try again.'));
      setIdentityStatus('idle');
    }
  }, [token]);

  const confirmCode = useCallback(async () => {
    if (code.length !== 4) {
      setError('Enter the 4-digit code.');
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const res = await api.verifyPhoneCode(phone, code);
      setToken(res.token);
      setUser(res.user);
      setStep('identity');
    } catch (err) {
      setError(
        describeError(
          err,
          'mismatch',
          'That code did not match. Check it and try again.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [phone, code]);

  useEffect(() => {
    if (step === 'identity' && !identityRequested.current) {
      identityRequested.current = true;
      submitIdentity();
    }
  }, [step, submitIdentity]);

  const continueFromIdentity = useCallback(() => {
    if (identityStatus === 'done') setStep('done');
  }, [identityStatus]);

  const setCodeSanitized = useCallback((value: string) => {
    setCode(value.replace(/[^0-9]/g, '').slice(0, 4));
  }, []);

  return {
    step,
    phone,
    setPhone,
    code,
    setCode: setCodeSanitized,
    codeSent,
    resendSeconds,
    devCode,
    sendCode,
    confirmCode,
    identityStatus,
    continueFromIdentity,
    loading,
    error,
    user,
  };
}

function describeError(err: unknown, matchReason: string | undefined, fallback: string): string {
  if (err instanceof ApiError) {
    const reason = (err.body as { error?: string } | undefined)?.error;
    if (reason === matchReason) return fallback;
    if (reason === 'expired') return 'That code expired. Send a new one.';
    if (reason === 'too_many_attempts') return 'Too many attempts. Send a new code.';
    if (reason === 'not_found') return 'Send a code first.';
  }
  return fallback;
}
