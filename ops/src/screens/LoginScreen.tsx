import { useState } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth } from '../state/AuthContext';

// Ops has no separate login system — it's the same phone+OTP flow every
// CityShare user goes through (see backend README: "ops identity is a
// stub, User.isOps set directly"). What's different here is what happens
// after: a verified phone that isn't isOps sees a plain "not an ops
// account" message instead of the dashboard, since there's no self-service
// way to grant that flag (unlike become-partner/become-driver — ops access
// control should not be self-assignable).
export function LoginScreen() {
  const { setSession } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [notOps, setNotOps] = useState(false);

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
    setNotOps(false);
    try {
      const res = await api.verifyPhoneCode(phone, code);
      if (!res.user.isOps) {
        setNotOps(true);
        return;
      }
      setSession({ token: res.token, user: res.user });
    } catch (err) {
      if (err instanceof ApiError) setError('Incorrect code.');
      else setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="card" style={{ width: 360, padding: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 22 }}>
          <span style={{ font: '600 15px var(--font-display)', letterSpacing: '-0.02em' }}>CityShare</span>
          <span className="card-kicker">OPERATIONS</span>
        </div>

        {notOps ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="error-text">This phone number isn't an ops account.</p>
            <p style={{ font: '400 12.5px/1.5 var(--font-display)', color: 'var(--muted-strong)' }}>
              Ops accounts are provisioned directly — there's no self-service signup here, unlike Partner or driver
              mode in the rider app.
            </p>
            <button
              className="btn btn-outline"
              onClick={() => {
                setNotOps(false);
                setStage('phone');
                setCode('');
              }}
            >
              Try a different number
            </button>
          </div>
        ) : stage === 'phone' ? (
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
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  font: '500 14px var(--font-display)',
};
