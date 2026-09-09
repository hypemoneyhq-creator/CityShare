// Recreated from CityShare Express Operators.dc.html ("Why operate" tab).
// This tab is pure marketing copy — nothing here is a number the backend
// tracks, so unlike every other screen in this build there's no
// real-vs-fabricated tension to resolve; it's reproduced close to verbatim.
export function WhyOperateScreen({ onApply, onConsole }: { onApply: () => void; onConsole: () => void }) {
  return (
    <div>
      <div
        style={{
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-ink)',
          padding: '64px 40px 72px',
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr',
          gap: 56,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span style={{ font: '600 10.5px var(--font-mono)', letterSpacing: '0.16em', color: 'var(--green)' }}>
            FOR TRANSPORT COMPANIES IN GREATER ACCRA
          </span>
          <div style={{ font: '600 46px/1.1 var(--font-display)', letterSpacing: '-0.035em', maxWidth: 600 }}>
            Sell your vans by the seat, not by the trip
          </div>
          <div style={{ font: '400 17px/1.55 var(--font-display)', color: 'var(--sidebar-muted)', maxWidth: 520 }}>
            You already run vehicles, drivers and schedules. CityShare Express adds a second way to fill them:
            individual commuters booking one seat at a time on the corridors you already serve.
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={onApply}
              style={{ border: 'none', borderRadius: 12, padding: '16px 24px', background: 'var(--green)', color: '#0e120e', font: '600 14.5px var(--font-display)', cursor: 'pointer' }}
            >
              Start an application
            </button>
            <button
              onClick={onConsole}
              style={{ border: '1px solid var(--sidebar-border)', background: 'none', borderRadius: 12, padding: '16px 24px', color: 'var(--sidebar-ink)', font: '600 14.5px var(--font-display)', cursor: 'pointer' }}
            >
              See the operator console
            </button>
          </div>
        </div>
        <div style={{ background: '#1c1f17', border: '1px solid #2e332a', borderRadius: 16, padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.13em', color: 'var(--muted-strong)' }}>
            ONE 11-SEATER, TWO BUSINESS MODELS
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: '500 13px var(--font-display)', color: 'var(--sidebar-muted)' }}>Charter, today</span>
            <span style={{ font: '400 14.5px/1.45 var(--font-display)', color: 'var(--sidebar-ink)' }}>
              One company hires the whole vehicle. One booking, one invoice, one relationship to win.
            </span>
          </div>
          <div style={{ height: 1, background: '#2e332a' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: '500 13px var(--font-display)', color: 'var(--green)' }}>Express, added</span>
            <span style={{ font: '400 14.5px/1.45 var(--font-display)', color: 'var(--sidebar-ink)' }}>
              Eleven commuters each book one seat on a scheduled run. Demand comes from CityShare, not from your
              sales team.
            </span>
          </div>
          <div style={{ font: '400 12px/1.5 var(--font-display)', color: 'var(--muted-strong)', paddingTop: 14, borderTop: '1px solid #2e332a' }}>
            Express is designed to complement charter work, not replace it. You choose which vehicles and which time
            windows you release.
          </div>
        </div>
      </div>

      <div style={{ padding: '44px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="card-kicker">YOU PROVIDE</span>
          <NumberedList
            items={[
              'Vehicles and vehicle availability',
              'Professional drivers and conduct standards',
              'Maintenance and fleet condition',
              'Operational management on the day',
              'Insurance covering fare-paying passengers',
            ]}
          />
        </div>
        <div className="card" style={{ padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="card-kicker">CITYSHARE PROVIDES</span>
          <NumberedList
            items={[
              'Commuter demand and route discovery',
              'Seat inventory and bookings',
              'Digital payments, escrow and payouts',
              'Passenger management and notifications',
              'Corridor and demand data',
            ]}
          />
        </div>
      </div>

      <div style={{ padding: '0 40px 52px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <FactCard title="Per seat" body="Riders buy single seats at one published fare. No seat tiers, no surge, no haggling at the roadside." />
        <FactCard title="On schedule" body="Every stop has a scheduled arrival, a boarding window and a maximum dwell. Vehicles do not wait indefinitely." />
        <FactCard title="Negotiated" body="Revenue share is agreed per operator before you run a single trip, and is set out in the operating agreement." />
      </div>
    </div>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {items.map((text, i) => (
        <div key={text} style={{ display: 'flex', gap: 11, alignItems: 'baseline' }}>
          <span style={{ font: '500 11px var(--font-mono)', color: '#278733' }}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{ font: '400 14.5px var(--font-display)' }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

function FactCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: '#ecebe5', borderRadius: 14, padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <span style={{ font: '600 30px var(--font-mono)', letterSpacing: '-0.03em' }}>{title}</span>
      <span style={{ font: '400 13.5px/1.5 var(--font-display)', color: '#5d635c' }}>{body}</span>
    </div>
  );
}
