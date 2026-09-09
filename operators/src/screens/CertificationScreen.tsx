import { useEffect, useState } from 'react';
import { api, type CertificationCheck, type Operator, type OperatorProfile } from '../api/client';
import { useAuth } from '../state/AuthContext';

const STATUS_DOT: Record<CertificationCheck['status'], string> = {
  CLEARED: 'var(--green)',
  WAITING: '#d8b166',
  IN_PROGRESS: '#c9c7c0',
};
const STATUS_BADGE: Record<CertificationCheck['status'], string> = {
  CLEARED: 'CLEARED',
  WAITING: 'WAITING ON YOU',
  IN_PROGRESS: 'IN PROGRESS',
};

// Recreated from CityShare Express Operators.dc.html ("Certification"
// tab). The design's sidebar shows a "provisional corridor offer" with a
// specific fare and "revenue share: to be agreed" — that offer is
// something CityShare ops would size and extend, and step 9's ops
// dashboard doesn't have an offer-creation workflow, so there's nothing
// real to show there. What's shown instead is the Operator's own
// requested corridors and roster — real data this build actually has.
export function CertificationScreen() {
  const { session } = useAuth();
  const [operator, setOperator] = useState<Operator | undefined>();
  const [checks, setChecks] = useState<CertificationCheck[] | undefined>();
  const [profile, setProfile] = useState<OperatorProfile | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [driverPhone, setDriverPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!session) return;
    try {
      const [cert, mine] = await Promise.all([api.getCertification(session.token), api.getMine(session.token)]);
      setOperator(cert.operator);
      setChecks(cert.checks);
      setProfile(mine.operator);
    } catch {
      setError('Could not load certification status.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !driverPhone) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.addDriver(session.token, driverPhone);
      setDriverPhone('');
      await refresh();
    } catch {
      setError('No CityShare user with that phone number, or they already drive for another Operator.');
    } finally {
      setBusy(false);
    }
  }

  async function removeDriver(userId: string) {
    if (!session) return;
    await api.removeDriver(session.token, userId);
    await refresh();
  }

  if (error && !operator) return <p className="error-text" style={{ padding: '34px 40px' }}>{error}</p>;
  if (!operator || !checks || !profile) return <p style={{ padding: '34px 40px', color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div style={{ padding: '34px 40px 52px', display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 24, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span className="card-kicker">{operator.registeredName.toUpperCase()}</span>
          <h2 style={{ font: '600 26px var(--font-display)', letterSpacing: '-0.025em', margin: '7px 0 0' }}>
            {operator.status === 'CERTIFIED' ? 'Certified' : 'Certification in progress'}
          </h2>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-kicker">CITYSHARE SAFETY STANDARD · CERTIFICATION CHECKS</span></div>
          {checks.map((c) => (
            <div key={c.key} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_DOT[c.status], flex: 'none', marginTop: 6 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ font: '500 14.5px var(--font-display)' }}>{c.name}</span>
                <span style={{ font: '400 12.5px var(--font-display)', color: 'var(--muted-strong)' }}>{c.detail}</span>
              </div>
              <span className={c.status === 'CLEARED' ? 'chip chip-green' : c.status === 'WAITING' ? 'chip chip-amber' : 'chip chip-neutral'}>
                {STATUS_BADGE[c.status]}
              </span>
            </div>
          ))}
          <div className="card-footnote">
            Certification covers company registration, insurance, the Safety Standard agreement and driver identity
            verification. It's recomputed from your application data every time this page loads — there's no
            separate manual review queue in this build.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-ink)', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.13em', color: 'var(--sidebar-muted)' }}>REQUESTED CORRIDORS</span>
          {profile.corridorInterests.length === 0 && (
            <span style={{ font: '400 13px var(--font-display)', color: 'var(--sidebar-muted)' }}>None yet — add one on the Apply tab.</span>
          )}
          {profile.corridorInterests.map((c) => (
            <div key={c.corridorId} style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 10, borderBottom: '1px solid #2b3029' }}>
              <span style={{ font: '600 16px var(--font-display)', letterSpacing: '-0.01em' }}>{c.corridor.name}</span>
              <span style={{ font: '400 12px var(--font-mono)', color: 'var(--sidebar-muted)' }}>
                {c.corridor.origin.toUpperCase()} → {c.corridor.destination.toUpperCase()}
              </span>
            </div>
          ))}
          <span style={{ font: '400 11.5px/1.45 var(--font-display)', color: '#8b918a', paddingTop: 4 }}>
            {operator.status === 'CERTIFIED'
              ? 'Certified — the operator console is now available to assign vehicles to today\'s runs on these corridors.'
              : 'The console unlocks once every check above clears.'}
          </span>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-kicker">DRIVER ROSTER</span>
            <span className="card-note">{profile.vehicles.length} vehicle{profile.vehicles.length === 1 ? '' : 's'} declared</span>
          </div>
          {profile.drivers.map((d) => (
            <div key={d.id} style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ font: '500 13.5px var(--font-display)' }}>{[d.firstName, d.lastName].filter(Boolean).join(' ') || d.phone}</span>
                <span style={{ font: '400 10.5px var(--font-mono)', color: 'var(--muted)' }}>{d.phone}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={d.ghanaCardVerifiedAt ? 'chip chip-green' : 'chip chip-amber'}>
                  {d.ghanaCardVerifiedAt ? 'VERIFIED' : 'UNVERIFIED'}
                </span>
                <button className="btn btn-outline" onClick={() => removeDriver(d.id)}>Remove</button>
              </div>
            </div>
          ))}
          {profile.drivers.length === 0 && (
            <div style={{ padding: '13px 20px', color: 'var(--muted)', fontSize: 13 }}>No drivers on your roster yet.</div>
          )}
          <form onSubmit={addDriver} style={{ padding: '14px 20px', display: 'flex', gap: 8 }}>
            <input
              placeholder="Driver phone (+233…)"
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', font: '400 12.5px var(--font-display)' }}
            />
            <button className="btn btn-dark" type="submit" disabled={busy}>Add driver</button>
          </form>
          <div className="card-footnote">
            A driver must already be a verified CityShare user, found by phone — same lookup the rider app uses to
            reassign a booking. This is where roster management lives rather than the console, so driver vetting can
            clear before certification (and the console) unlocks.
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
