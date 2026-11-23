'use client';

// ==============================================================================
// COMPONENT: src/components/layout/AppShell.tsx
// Shell Layout Utama: Menggabungkan Sidebar Monexa & TopBar
// ==============================================================================

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import SessionLockModal from '@/components/auth/SessionLockModal';
import AddTransactionModal from '@/components/transactions/AddTransactionModal';
import { useSessionTimeout } from '@/lib/auth/useSessionTimeout';

interface AppShellProps {
  children: React.ReactNode;
  userRole?: 'suami' | 'istri';
  displayName?: string;
  pendingCount?: number;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export default function AppShell({
  children,
  userRole = 'suami',
  displayName,
  pendingCount = 0,
  searchQuery,
  onSearchChange,
}: AppShellProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [modalCategories, setModalCategories] = useState<Array<{ id: string; name: string; type: 'expense' | 'income' }>>([]);
  const [modalAccounts, setModalAccounts] = useState<Array<{ id: string; name: string; owner: 'suami' | 'istri' }>>([]);
  const { isLocked, unlock } = useSessionTimeout(true);

  useEffect(() => {
    const handleOpenScan = async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('household_id')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.household_id) {
            const [catRes, accRes] = await Promise.all([
              supabase.from('categories').select('id, name, type').eq('household_id', profile.household_id),
              supabase.from('accounts').select('id, name, owner').eq('household_id', profile.household_id).eq('is_active', true),
            ]);
            if (catRes.data) setModalCategories(catRes.data as Array<{ id: string; name: string; type: 'expense' | 'income' }>);
            if (accRes.data) setModalAccounts(accRes.data as Array<{ id: string; name: string; owner: 'suami' | 'istri' }>);
          }
        }
      } catch (err) {
        console.warn('Gagal memuat kategori/akun untuk modal scan:', err);
      }
      setIsScanModalOpen(true);
    };

    window.addEventListener('open-scan-receipt-modal', handleOpenScan);
    return () => window.removeEventListener('open-scan-receipt-modal', handleOpenScan);
  }, []);

  return (
    <div className="min-h-screen flex bg-[var(--bg-main)] text-[var(--text-main)]">
      {/* Modal Kunci Sesi 1 Jam Inaktivitas */}
      <SessionLockModal
        isOpen={isLocked}
        userRole={userRole}
        displayName={displayName}
        onUnlock={unlock}
      />

      {/* Modal Cepat Pindai Nota Pembelian / Foto Struk (Kamera HP & Web) */}
      {isScanModalOpen && (
        <AddTransactionModal
          isOpen={isScanModalOpen}
          onClose={() => setIsScanModalOpen(false)}
          categories={modalCategories}
          accounts={modalAccounts}
          onSuccess={() => {
            setIsScanModalOpen(false);
            window.location.reload();
          }}
          userRole={userRole}
        />
      )}

      {/* Sidebar Kiri */}
      <Sidebar
        pendingCount={pendingCount}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Konten Utama di Sisi Kanan */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopBar
          userRole={userRole}
          displayName={displayName}
          pendingCount={pendingCount}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
