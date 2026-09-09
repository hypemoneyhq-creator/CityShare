import { useState } from 'react';
import { TopNav } from './components/TopNav';
import { ApplyScreen } from './screens/ApplyScreen';
import { CertificationScreen } from './screens/CertificationScreen';
import { ConsoleScreen } from './screens/ConsoleScreen';
import { LoginScreen } from './screens/LoginScreen';
import { WhyOperateScreen } from './screens/WhyOperateScreen';
import { useAuth } from './state/AuthContext';

export type Tab = 'why' | 'apply' | 'certification' | 'console';

// "Why operate" is public marketing, viewable without a session (matching
// the design, where the tab bar is visible before you've applied). The
// other three tabs need an account — there's no separate operator login,
// just the same phone+OTP flow every CityShare surface uses.
function App() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>('why');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>
      <TopNav tab={tab} onTab={setTab} />
      {tab === 'why' && <WhyOperateScreen onApply={() => setTab('apply')} onConsole={() => setTab('console')} />}
      {tab !== 'why' && !session && <LoginScreen />}
      {tab === 'apply' && session && <ApplyScreen onSubmitted={() => setTab('certification')} />}
      {tab === 'certification' && session && <CertificationScreen />}
      {tab === 'console' && session && <ConsoleScreen />}
    </div>
  );
}

export default App;
