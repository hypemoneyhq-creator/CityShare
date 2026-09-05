import { Fragment, useEffect, useState } from 'react';
import { api, type CorridorOverview } from '../api/client';
import { useAuth } from '../state/AuthContext';

function dwellLabel(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

function rulesLabel(s: { boardAllowed: boolean; alightAllowed: boolean }): string {
  if (s.boardAllowed && s.alightAllowed) return 'BOARD + ALIGHT';
  if (s.boardAllowed) return 'BOARD ONLY';
  if (s.alightAllowed) return 'ALIGHT ONLY';
  return 'CLOSED';
}

// Recreated from CityShare Operations.dc.html ("Corridors & stops" tab).
// The design also shows a K03 "proposed" service reasoned from unfulfilled
// search counts — this build has no search log to compute that threshold
// from and no service-proposal workflow, so only real, seeded services
// appear here; there's nothing to propose from data that doesn't exist.
export function CorridorsTab() {
  const { session } = useAuth();
  const [corridors, setCorridors] = useState<CorridorOverview[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api
      .getCorridors(session.token)
      .then((res) => !cancelled && setCorridors(res.corridors))
      .catch(() => !cancelled && setError('Could not load corridor data.'));
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (error) return <p className="error-text">{error}</p>;
  if (!corridors) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      {corridors.map((c) => (
        <div key={c.id} className="card">
          <div className="card-header">
            <span className="card-kicker">
              {c.name.toUpperCase()} CORRIDOR · {c.services.length} SERVICE{c.services.length === 1 ? '' : 'S'}
            </span>
            <span className="card-note">
              {c.origin} → {c.destination}
            </span>
          </div>
          {c.services.map((svc) => (
            <div key={svc.id} style={{ padding: '17px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ font: '500 14px var(--font-display)' }}>
                  {svc.code} · {svc.stops.map((s) => s.name).join(' → ')}
                </span>
                <span className="chip chip-green">{svc.type}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                {svc.stops.map((s, i) => (
                  <Fragment key={s.id}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: 'var(--green)',
                        flex: 'none',
                      }}
                    />
                    {i < svc.stops.length - 1 && <span style={{ flex: 1, height: 2, background: 'var(--green)' }} />}
                  </Fragment>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '400 11px var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.04em' }}>
                <span>{svc.stops.map((s) => s.scheduledDeparture ?? s.scheduledArrival ?? '—').join(' · ')}</span>
                <span>{svc.runsToday} RUN{svc.runsToday === 1 ? '' : 'S'} TODAY</span>
              </div>
            </div>
          ))}

          {c.services.map((svc) => (
            <div key={`${svc.id}-stops`}>
              <div className="card-header" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="card-kicker">{svc.code} STOP PROFILES</span>
                <span className="card-note">Dwell is capped, not negotiated</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 66px 66px 66px 1fr',
                  gap: 10,
                  padding: '11px 18px',
                  borderBottom: '1px solid var(--border)',
                  font: '500 9.5px var(--font-mono)',
                  letterSpacing: '0.1em',
                  color: '#9a9d95',
                }}
              >
                <span>STOP</span>
                <span style={{ textAlign: 'right' }}>ARR</span>
                <span style={{ textAlign: 'right' }}>DEP</span>
                <span style={{ textAlign: 'right' }}>DWELL</span>
                <span style={{ textAlign: 'right' }}>BOARD / ALIGHT</span>
              </div>
              {svc.stops.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 66px 66px 66px 1fr',
                    gap: 10,
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--border)',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ font: '500 13.5px var(--font-display)' }}>{s.name}</span>
                    <span style={{ font: '400 10.5px var(--font-mono)', color: 'var(--muted)' }}>
                      {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                    </span>
                  </div>
                  <span style={{ textAlign: 'right', font: '500 13px var(--font-mono)' }}>{s.scheduledArrival ?? '—'}</span>
                  <span style={{ textAlign: 'right', font: '500 13px var(--font-mono)' }}>{s.scheduledDeparture ?? '—'}</span>
                  <span style={{ textAlign: 'right', font: '500 13px var(--font-mono)', color: 'var(--muted)' }}>
                    {dwellLabel(s.maxDwellSeconds)}
                  </span>
                  <span style={{ textAlign: 'right', font: '500 10px var(--font-mono)', letterSpacing: '0.05em', color: 'var(--muted-strong)' }}>
                    {rulesLabel(s)}
                  </span>
                </div>
              ))}
              <div className="card-footnote">
                Times shown are pilot values. Each stop profile feeds the driver's navigation and the passenger app,
                so a change here changes both.
              </div>
            </div>
          ))}
        </div>
      ))}
      {corridors.length === 0 && <p style={{ color: 'var(--muted)' }}>No corridors seeded.</p>}
    </div>
  );
}
