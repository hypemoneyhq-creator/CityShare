import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { CorridorsTab } from './screens/CorridorsTab';
import { DisputesTab } from './screens/DisputesTab';
import { LiveOpsTab } from './screens/LiveOpsTab';
import { LoginScreen } from './screens/LoginScreen';
import { useAuth } from './state/AuthContext';

export type Tab = 'live' | 'disputes' | 'corridors';

const TAB_TITLES: Record<Tab, [string, string]> = {
  live: ['LIVE OPERATIONS', 'Greater Accra network'],
  disputes: ['ESCROW & DISPUTES', 'Boarding disputes and held funds'],
  corridors: ['CORRIDORS & STOPS', 'Service patterns and stop profiles'],
};

function App() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>('live');

  if (!session) return <LoginScreen />;

  const [kicker, title] = TAB_TITLES[tab];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--paper)' }}>
      <Sidebar tab={tab} onTab={setTab} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '22px 28px 18px',
            borderBottom: '1px solid var(--border-strong)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="card-kicker">{kicker}</span>
            <span style={{ font: '600 24px var(--font-display)', letterSpacing: '-0.025em' }}>{title}</span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'live' && <LiveOpsTab onOpenDisputes={() => setTab('disputes')} />}
          {tab === 'disputes' && <DisputesTab />}
          {tab === 'corridors' && <CorridorsTab />}
        </div>
      </div>
    </div>
  );
}

export default App;
