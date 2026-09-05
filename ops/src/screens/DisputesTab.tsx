import { useEffect, useState } from 'react';
import { api, type DisputeCase } from '../api/client';
import { useAuth } from '../state/AuthContext';

function formatAge(ms: number | null): string {
  if (ms == null) return '—';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} MIN AGO`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}H ${rem}M AGO`;
}

// Recreated from CityShare Operations.dc.html ("Escrow & disputes" tab).
// The design shows a CODE USED/UNUSED chip — this build's boarding flow
// never checks the boarding code against anything (boarding is decided
// entirely by GPS-verified two-sided taps, spec section 4), so that chip
// would be fabricated; the real evidence available is which side raised
// the case and whether GPS was present/consistent, which is what's shown.
export function DisputesTab() {
  const { session } = useAuth();
  const [disputes, setDisputes] = useState<DisputeCase[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  async function refresh() {
    if (!session) return;
    try {
      const res = await api.getDisputes(session.token);
      setDisputes(res.disputes);
    } catch {
      setError('Could not load the dispute queue.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function resolve(bookingId: string, toState: 'RELEASABLE' | 'REFUNDING') {
    if (!session) return;
    const note = noteDraft[bookingId]?.trim();
    if (!note) {
      setError('A resolution note is required before closing a case.');
      return;
    }
    setBusyId(bookingId);
    setError(undefined);
    try {
      await api.resolveDispute(session.token, bookingId, toState, note);
      await refresh();
    } catch {
      setError('Could not resolve that case.');
    } finally {
      setBusyId(undefined);
    }
  }

  if (error && !disputes) return <p className="error-text">{error}</p>;
  if (!disputes) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  const heldTotal = disputes.reduce((sum, d) => sum + d.heldCedis, 0);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="stat-card">
          <span className="stat-label">OPEN DISPUTES</span>
          <span className="stat-value">{disputes.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">FUNDS HELD</span>
          <span className="stat-value">₵{heldTotal}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">GPS UNAVAILABLE</span>
          <span className="stat-value">{disputes.filter((d) => d.chips.includes('GPS UNAVAILABLE')).length}</span>
          <span className="stat-sub">manual review required</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-kicker">BOARDING DISPUTE QUEUE</span>
          <span className="card-note">Funds stay held until a case is closed</span>
        </div>
        {disputes.map((d) => (
          <div key={d.bookingId} style={{ padding: '15px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ font: '500 13.5px var(--font-display)' }}>{d.tripLabel}</span>
                <span style={{ font: '400 11.5px var(--font-display)', color: 'var(--muted-strong)' }}>{d.claim}</span>
                <span style={{ font: '400 10.5px var(--font-mono)', color: 'var(--muted)' }}>
                  {d.riderName} · {formatAge(d.ageMs)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ font: '500 13.5px var(--font-mono)' }}>₵{d.heldCedis}</span>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {d.chips.map((c) => (
                    <span key={c} className={c.startsWith('GPS') ? 'chip chip-amber' : 'chip chip-neutral'}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="Resolution note (required)"
                value={noteDraft[d.bookingId] ?? ''}
                onChange={(e) => setNoteDraft((p) => ({ ...p, [d.bookingId]: e.target.value }))}
                style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', font: '400 12.5px var(--font-display)' }}
              />
              <button className="btn btn-dark" disabled={busyId === d.bookingId} onClick={() => resolve(d.bookingId, 'RELEASABLE')}>
                Release to driver
              </button>
              <button className="btn btn-outline" disabled={busyId === d.bookingId} onClick={() => resolve(d.bookingId, 'REFUNDING')}>
                Refund rider
              </button>
            </div>
          </div>
        ))}
        {disputes.length === 0 && <div style={{ padding: '18px', color: 'var(--muted)' }}>No open disputes.</div>}
        <div className="card-footnote">
          Every case is decided on GPS, timestamps, driver confirmation and rider confirmation. Where GPS is
          unavailable or inconsistent with the stop's stored coordinates, the case routes here rather than defaulting
          to either party.
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </>
  );
}
