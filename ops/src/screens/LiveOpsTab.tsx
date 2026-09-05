import { useEffect, useState } from 'react';
import { api, type LiveSummary } from '../api/client';
import { useAuth } from '../state/AuthContext';

// Recreated from CityShare Operations.dc.html ("Live ops" tab). The
// design's stat row also shows "active Partners" and "unfulfilled
// searches" network-wide, and a multi-corridor demand chart built from
// logged searches — this build has neither a search log nor more than
// one seeded corridor, so those are replaced with what's real: today's
// actual escrow position, run status, on-time rate and seat utilization,
// and a corridor capacity table showing Express + Partner supply (not
// demand, since nothing here counts unanswered searches).
export function LiveOpsTab({ onOpenDisputes }: { onOpenDisputes: () => void }) {
  const { session } = useAuth();
  const [summary, setSummary] = useState<LiveSummary | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api
      .getSummary(session.token)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setError('Could not load the live summary.'));
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (error) return <p className="error-text">{error}</p>;
  if (!summary) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  const { escrowPosition } = summary;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <Stat label="HELD IN ESCROW" value={`₵${escrowPosition.heldCedis}`} sub="awaiting boarding" />
        <Stat label="RELEASED TODAY" value={`₵${escrowPosition.releasedTodayCedis}`} sub="both taps confirmed" />
        <Stat
          label="HELD IN DISPUTE"
          value={`₵${escrowPosition.disputedCedis}`}
          sub={`${escrowPosition.openDisputes} open case${escrowPosition.openDisputes === 1 ? '' : 's'}`}
          warn={escrowPosition.openDisputes > 0}
        />
        <Stat
          label="ON-TIME DEPARTURE"
          value={summary.onTimeDeparturePct != null ? `${summary.onTimeDeparturePct}%` : '—'}
          sub="today's recorded stop arrivals"
        />
        <Stat
          label="SEAT UTILISATION"
          value={summary.seatUtilizationPct != null ? `${summary.seatUtilizationPct}%` : '—'}
          sub={`${summary.activeRunsToday} run${summary.activeRunsToday === 1 ? '' : 's'} today`}
        />
        <Stat label="PARTNER TRIPS TODAY" value={String(summary.partnerTripsToday)} sub="listed to depart today" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-kicker">CORRIDOR CAPACITY · TODAY</span>
            <span className="card-note">Express seats scheduled vs Partner seats listed</span>
          </div>
          {summary.corridorCapacity.map((c) => (
            <div key={c.corridorId} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ font: '500 14px var(--font-display)' }}>{c.name}</span>
                <span style={{ font: '400 10.5px var(--font-mono)', color: 'var(--muted)' }}>
                  {c.origin} → {c.destination}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {c.services.map((s) => (
                  <div key={s.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ font: '500 12.5px var(--font-display)', width: 170 }}>
                      {s.code} · {s.name}
                    </span>
                    <div style={{ flex: 1, height: 7, borderRadius: 4, background: '#efeee9', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, s.loadPct ?? 0)}%`,
                          height: '100%',
                          background: 'var(--green)',
                        }}
                      />
                    </div>
                    <span style={{ font: '500 11.5px var(--font-mono)', color: 'var(--muted-strong)', width: 90, textAlign: 'right' }}>
                      {s.seatsSold}/{s.capacity} seats
                    </span>
                    <span style={{ font: '500 11.5px var(--font-mono)', width: 40, textAlign: 'right' }}>
                      {s.loadPct != null ? `${s.loadPct}%` : '—'}
                    </span>
                  </div>
                ))}
                <div style={{ font: '400 11px var(--font-mono)', color: 'var(--muted)' }}>
                  {c.partnerSeatsListed} Partner seat{c.partnerSeatsListed === 1 ? '' : 's'} listed today
                </div>
              </div>
            </div>
          ))}
          {summary.corridorCapacity.length === 0 && (
            <div style={{ padding: '18px', color: 'var(--muted)' }}>No corridors seeded.</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: 'var(--sidebar-bg)',
              color: 'var(--sidebar-ink)',
              borderRadius: 14,
              padding: '17px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 13,
            }}
          >
            <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.13em', color: 'var(--sidebar-muted)' }}>
              ESCROW POSITION
            </span>
            <Row label="Held, awaiting boarding" value={`₵${escrowPosition.heldCedis}`} />
            <Row label="Released today" value={`₵${escrowPosition.releasedTodayCedis}`} accent="#96e498" />
            <Row label="Held in dispute" value={`₵${escrowPosition.disputedCedis}`} accent="#e3a3a3" />
            <button
              onClick={onOpenDisputes}
              style={{
                marginTop: 3,
                border: '1px solid var(--sidebar-border)',
                background: 'none',
                borderRadius: 10,
                padding: 12,
                color: 'var(--sidebar-ink)',
                font: '600 12.5px var(--font-display)',
                cursor: 'pointer',
              }}
            >
              Review {escrowPosition.openDisputes} open dispute{escrowPosition.openDisputes === 1 ? '' : 's'}
            </button>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-kicker">EXPRESS VEHICLES · NOW</span>
            </div>
            {summary.vehiclesNow.map((v) => (
              <div
                key={v.runId}
                style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ font: '500 13.5px var(--font-display)' }}>
                    {v.serviceCode} · {v.corridorName}
                  </span>
                  <span style={{ font: '400 10.5px var(--font-mono)', color: 'var(--muted)' }}>{v.statusLabel}</span>
                </div>
                <span style={{ font: '500 11px var(--font-mono)', color: 'var(--muted-strong)' }}>
                  {v.seatsSold}/{v.capacity}
                </span>
              </div>
            ))}
            {summary.vehiclesNow.length === 0 && (
              <div style={{ padding: '18px', color: 'var(--muted)' }}>No runs scheduled today.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="stat-card" style={warn ? { border: '1.5px solid var(--amber-border)' } : undefined}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-sub" style={warn ? { color: 'var(--amber-ink)' } : undefined}>
        {sub}
      </span>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ font: '400 13px var(--font-display)', color: '#c9cec8' }}>{label}</span>
      <span style={{ font: '600 19px var(--font-mono)', letterSpacing: '-0.02em', color: accent }}>{value}</span>
    </div>
  );
}
