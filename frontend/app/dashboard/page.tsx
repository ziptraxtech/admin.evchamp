'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import DashboardView from '@/components/views/DashboardView';
import StationsView from '@/components/views/StationsView';
import ChargersView from '@/components/views/ChargersView';
import ChargerDetailView from '@/components/views/ChargerDetailView';
import RfidView from '@/components/views/RfidView';
import PricingView from '@/components/views/PricingView';
import TransactionsView from '@/components/views/TransactionsView';
import SettingsView from '@/components/views/SettingsView';
import type { View } from '@/lib/types';
import { AUTH_DISABLED } from '@/lib/api';

const TITLES: Record<View, string> = {
  dashboard: 'Dashboard', transactions: 'Transactions', stations: 'Stations',
  chargers: 'Charge Points', 'charger-detail': 'Charger Detail',
  rfid: 'RFID Tags', pricing: 'Price Groups', settings: 'Settings',
};

export default function DashboardPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('dashboard');
  const [currentChargerId, setCurrentChargerId] = useState<string | null>(null);
  const [gateway, setGateway] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Login removed for now — skip the auth guard (AUTH_DISABLED in lib/api).
    if (!AUTH_DISABLED && !localStorage.getItem('evchamp_token')) {
      router.replace('/');
      return;
    }
    const hash = window.location.hash.slice(1) as View;
    if (hash && TITLES[hash]) setView(hash);
  }, [router]);

  function nav(v: View) {
    setView(v);
    window.location.hash = v;
    window.scrollTo(0, 0);
  }

  function openCharger(id: string) {
    setCurrentChargerId(id);
    setView('charger-detail');
    window.location.hash = 'charger-detail';
    window.scrollTo(0, 0);
  }

  function logout() {
    localStorage.removeItem('evchamp_token');
    localStorage.removeItem('evchamp_company');
    localStorage.removeItem('evchamp_userId');
    router.push('/');
  }

  const crumb = view === 'charger-detail' && currentChargerId
    ? `Charge Points › ${currentChargerId}`
    : 'Console';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar view={view} onNav={nav} onLogout={logout} />

      <main style={{ flex: 1, marginLeft: 224, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header title={TITLES[view]} crumb={crumb} onRefresh={() => setRefreshKey(k => k + 1)} />

        <div style={{ flex: 1, padding: 24 }} key={refreshKey}>
          {view === 'dashboard' && <DashboardView onViewChargers={() => nav('chargers')} />}
          {view === 'stations' && <StationsView />}
          {view === 'chargers' && <ChargersView onOpenCharger={openCharger} />}
          {view === 'charger-detail' && currentChargerId && (
            <ChargerDetailView chargeboxId={currentChargerId} onBack={() => nav('chargers')} />
          )}
          {view === 'rfid' && <RfidView />}
          {view === 'pricing' && <PricingView onGatewayLoaded={setGateway} />}
          {view === 'transactions' && <TransactionsView />}
          {view === 'settings' && <SettingsView gateway={gateway} />}
        </div>
      </main>
    </div>
  );
}
