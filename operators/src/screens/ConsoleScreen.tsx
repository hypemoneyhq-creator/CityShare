import { useEffect, useState } from 'react';
import { ApiError, api, type ConsoleData, type OperatorProfile } from '../api/client';
import { useAuth } from '../state/AuthContext';

function driverLabel(d: { name: string } | null): string {
  return d?.name || 'No driver yet';
}

// Recreated from CityShare Express Operators.dc.html ("Operator console"
// tab). The design also shows a "rider rating" stat and a "corridor
// offers from CityShare" panel sized from unmet-search data — this build
// has no rating system anywhere and no ops-side offer-creation workflow
// (step 9's dashboard doesn't cover it), so both are dropped rather than
// faked. What's real: seats sold, load factor and on-time departure
// computed from today's actual runs assigned to this Operator's
// vehicles, and payout figures from real Payout rows. Driver-roster
// add/remove lives on the Certification tab, not here — the console is
// gated on certification, and certification's driver-vetting check needs
// a roster to exist before that gate opens, so roster management can't
// live behind the gate it feeds.
export function ConsoleScreen() {
  const { session } = useAuth();
  const [data, setData] = useState<ConsoleData | undefined>();
  const [profile, setProfile] = useState<OperatorProfile | undefined>();
  const [gate, setGate] = useState<'loading' | 'ready' | 'not_certified' | 'no_application' | 'error'>('loading');
  const [assigningRun, setAssigningRun] = useState<string | undefined>();
  const [pickVehicle, setPickVehicle] = useState('');
  const [pickDriver, setPickDriver] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function refresh() {
    if (!session) return;
    try {
      const [consoleRes, mineRes] = await Promise.all([api.getConsole(session.token), api.getMine(session.token)]);
      setData(consoleRes);
      setProfile(mineRes.operator);
      setGate('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setGate('not_certified');
      else if (err instanceof ApiError && err.status === 404) setGate('no_application');
      else setGate('error');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function confirmAssign(runId: string) {
    if (!session || !pickVehicle) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.assignRun(session.token, runId, pickVehicle, pickDriver || undefined);
      setAssigningRun(undefined);
      await refresh();
    } catch {
      setError('Could not assign that run.');
    } finally {
      setBusy(false);
    }
  }

  if (gate === 'loading') return <p style={{ padding: '34px 40px', color: 'var(--muted)' }}>Loading…</p>;
  if (gate === 'no_application') {
    return <p style={{ padding: '34px 40px', color: 'var(--muted)' }}>Start an application on the Apply tab first.</p>;
  }
  if (gate === 'not_certified') {
    return (
      <p style={{ padding: '34px 40px', color: 'var(--muted)' }}>
        The console unlocks once certification completes — check the Certification tab for what's outstanding.
      </p>
    );
  }
  if (gate === 'error' || !data || !profile) return <p className="error-text" style={{ padding: '34px 40px' }}>Could not load the console.</p>;

  return (
    <div style={{ padding: '34px 40px 52px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <span className="card-kicker">{profile.registeredName.toUpperCase()} · OPERATOR CONSOLE</span>
        <h2 style={{ font: '600 26px var(--font-display)', letterSpacing: '-0.025em', margin: '7px 0 0' }}>Today's runs</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <div className="stat-card">
          <span className="stat-label">SEATS SOLD TODAY</span>
          <span className="stat-value">{data.soldTotal}</span>
          <span className="stat-sub">of {data.releasedTotal} released</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">LOAD FACTOR</span>
          <span className="stat-value">{data.loadPct != null ? `${data.loadPct}%` : '—'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">ON-TIME DEPARTURE</span>
          <span className="stat-value">{data.onTimeDeparturePct != null ? `${data.onTimeDeparturePct}%` : '—'}</span>
        </div>
        <div style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-ink)', borderRadius: 12, padding: '17px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ font: '500 9.5px var(--font-mono)', letterSpacing: '0.11em', color: 'var(--sidebar-muted)' }}>PAYOUT</span>
          <span style={{ font: '600 27px var(--font-mono)', letterSpacing: '-0.03em' }}>₵{data.availablePayoutCedis}</span>
          <span style={{ font: '400 11px var(--font-display)', color: 'var(--sidebar-muted)' }}>₵{data.pendingPayoutCedis} pending</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-kicker">TODAY'S RUNS</span>
            <span className="card-note">Assign a vehicle and driver to each scheduled run</span>
          </div>
          {data.runs.map((r) => (
            <div key={r.runId} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1.3fr 1fr 90px 130px', gap: 12, padding: '15px 20px', alignItems: 'center' }}>
                <span style={{ font: '600 16px var(--font-mono)', letterSpacing: '-0.02em' }}>{r.scheduledDeparture ?? '--:--'}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ font: '500 13.5px var(--font-display)' }}>{r.serviceCode} · {r.serviceName}</span>
                  <span style={{ font: '400 10.5px var(--font-mono)', color: 'var(--muted)' }}>{r.stops.join(' · ')}</span>
                </div>
                <span style={{ font: '400 12.5px var(--font-display)', color: r.vehicle ? 'var(--ink)' : '#8a7130' }}>
                  {r.vehicle ? `${r.vehicle.label} · ${driverLabel(r.driver)}` : 'Unassigned'}
                </span>
                <span style={{ textAlign: 'right', font: '500 13px var(--font-mono)' }}>{r.seatsSold} / {r.capacity}</span>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className={r.vehicle ? 'btn btn-outline' : 'btn btn-dark'}
                    onClick={() => {
                      setAssigningRun(assigningRun === r.runId ? undefined : r.runId);
                      setPickVehicle(r.vehicle?.id ?? '');
                      setPickDriver(r.driver?.id ?? '');
                    }}
                  >
                    {r.vehicle ? 'Reassign' : 'Assign vehicle'}
                  </button>
                </div>
              </div>
              {assigningRun === r.runId && (
                <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={pickVehicle} onChange={(e) => setPickVehicle(e.target.value)} style={selectStyle}>
                    <option value="">Select vehicle…</option>
                    {profile.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.label} · {v.vehicleType}</option>
                    ))}
                  </select>
                  <select value={pickDriver} onChange={(e) => setPickDriver(e.target.value)} style={selectStyle}>
                    <option value="">No driver yet</option>
                    {profile.drivers.map((d) => (
                      <option key={d.id} value={d.id}>{[d.firstName, d.lastName].filter(Boolean).join(' ') || d.phone}</option>
                    ))}
                  </select>
                  <button className="btn btn-dark" disabled={!pickVehicle || busy} onClick={() => confirmAssign(r.runId)}>
                    Confirm
                  </button>
                </div>
              )}
            </div>
          ))}
          {data.runs.length === 0 && <div style={{ padding: 20, color: 'var(--muted)' }}>No runs scheduled today on your corridors.</div>}
          <div className="card-footnote">Runs are open to any vehicle you've declared and any driver on your roster.</div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-kicker">YOUR ROSTER</span>
            <span className="card-note">Manage on the Certification tab</span>
          </div>
          {profile.vehicles.map((v) => (
            <div key={v.id} style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ font: '500 13.5px var(--font-display)' }}>{v.label}</span>
              <span style={{ font: '400 11px var(--font-mono)', color: 'var(--muted)', marginLeft: 8 }}>{v.seats} SEATS</span>
            </div>
          ))}
          {profile.drivers.map((d) => (
            <div key={d.id} style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ font: '500 13.5px var(--font-display)' }}>{[d.firstName, d.lastName].filter(Boolean).join(' ') || d.phone}</span>
              <span className={d.ghanaCardVerifiedAt ? 'chip chip-green' : 'chip chip-amber'}>
                {d.ghanaCardVerifiedAt ? 'VERIFIED' : 'UNVERIFIED'}
              </span>
            </div>
          ))}
          {profile.vehicles.length === 0 && profile.drivers.length === 0 && (
            <div style={{ padding: '13px 20px', color: 'var(--muted)', fontSize: 13 }}>No vehicles or drivers yet.</div>
          )}
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  font: '400 12.5px var(--font-display)',
};
