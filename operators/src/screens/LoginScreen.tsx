import { useState } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth } from '../state/AuthContext';

// Same phone+OTP flow as every CityShare surface — there's no separate
// company-account login system in this build (spec doesn't call for one,
// and one Operator per contact user is the same simplification
// PartnerTrip.partnerId already makes for Partners).
export function LoginScreen() {
  const { setSession } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.startPhoneVerification(phone);
      setDevCode(res.devCode);
      setStage('code');
    } catch {
      setError('Could not send a code to that number.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.verifyPhoneCode(phone, code);
      setSession({ token: res.token, user: res.user });
    } catch (err) {
      if (err instanceof ApiError) setError('Incorrect code.');
      else setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ width: 360, padding: 28, margin: '60px auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 22 }}>
        <span style={{ font: '600 15px var(--font-display)', letterSpacing: '-0.02em' }}>CityShare</span>
        <span className="card-kicker">EXPRESS OPERATORS</span>
      </div>

      {stage === 'phone' ? (
        <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="stat-label">PHONE</span>
            <input
              type="tel"
              required
              placeholder="+233244000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
            />
          </label>
          {error && <span className="error-text">{error}</span>}
          <button className="btn btn-dark" type="submit" disabled={busy} style={{ padding: '12px' }}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {devCode && (
            <div className="chip chip-amber" style={{ width: 'fit-content' }}>
              DEV CODE {devCode}
            </div>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="stat-label">4-DIGIT CODE</span>
            <input
              type="text"
              inputMode="numeric"
              required
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={inputStyle}
            />
          </label>
          {error && <span className="error-text">{error}</span>}
          <button className="btn btn-dark" type="submit" disabled={busy} style={{ padding: '12px' }}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  font: '500 14px var(--font-display)',
};
