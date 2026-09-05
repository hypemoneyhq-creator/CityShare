import type { Tab } from '../App';
import { useAuth } from '../state/AuthContext';

const NAV: { key: Tab; label: string }[] = [
  { key: 'live', label: 'Live ops' },
  { key: 'disputes', label: 'Escrow & disputes' },
  { key: 'corridors', label: 'Corridors & stops' },
];

export function Sidebar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { session, setSession } = useAuth();

  return (
    <div
      style={{
        width: 212,
        flex: 'none',
        background: 'var(--sidebar-bg)',
        color: 'var(--sidebar-ink)',
        padding: '22px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
        minHeight: '100vh',
      }}
    >
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ font: '600 15px var(--font-display)', letterSpacing: '-0.02em' }}>CityShare</span>
        <span style={{ font: '500 9px var(--font-mono)', letterSpacing: '0.14em', color: 'var(--sidebar-muted)' }}>
          OPERATIONS
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' }}>
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => onTab(n.key)}
            style={{
              textAlign: 'left',
              border: 'none',
              borderRadius: 8,
              padding: '10px 12px',
              background: tab === n.key ? 'var(--sidebar-active-bg)' : 'transparent',
              color: tab === n.key ? 'var(--sidebar-ink)' : 'var(--sidebar-muted)',
              font: '500 13px var(--font-display)',
              cursor: 'pointer',
            }}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 9, marginTop: 'auto' }}>
        <span style={{ font: '400 11.5px/1.5 var(--font-display)', color: 'var(--sidebar-muted)' }}>
          {session?.user.firstName ?? session?.user.phone}
        </span>
        <button
          onClick={() => setSession(undefined)}
          style={{
            textAlign: 'left',
            border: '1px solid var(--sidebar-border)',
            background: 'none',
            borderRadius: 8,
            padding: '8px 10px',
            color: 'var(--sidebar-ink)',
            font: '500 11.5px var(--font-display)',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
