import type { Tab } from '../App';
import { useAuth } from '../state/AuthContext';

const TABS: { key: Tab; label: string }[] = [
  { key: 'why', label: 'Why operate' },
  { key: 'apply', label: 'Apply' },
  { key: 'certification', label: 'Certification' },
  { key: 'console', label: 'Operator console' },
];

export function TopNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { session, setSession } = useAuth();

  return (
    <div
      style={{
        background: 'var(--sidebar-bg)',
        color: 'var(--sidebar-ink)',
        padding: '0 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        height: 64,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ font: '600 15px var(--font-display)', letterSpacing: '-0.02em' }}>CityShare</span>
        <span style={{ font: '500 9.5px var(--font-mono)', letterSpacing: '0.14em', color: 'var(--muted-strong)' }}>
          EXPRESS OPERATORS
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onTab(t.key)}
            style={{
              border: 'none',
              background: 'none',
              padding: '0 16px',
              color: tab === t.key ? 'var(--sidebar-ink)' : 'var(--sidebar-muted)',
              borderBottom: `2.5px solid ${tab === t.key ? 'var(--green)' : 'transparent'}`,
              font: '500 13px var(--font-display)',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
        {session && (
          <button
            onClick={() => setSession(undefined)}
            style={{
              border: 'none',
              background: 'none',
              padding: '0 16px',
              color: 'var(--sidebar-muted)',
              font: '500 13px var(--font-display)',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
