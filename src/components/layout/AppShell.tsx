'use client';

// ==============================================================================
// COMPONENT: src/components/layout/AppShell.tsx
// Shell Layout Utama: Menggabungkan Sidebar Monexa & TopBar
// ==============================================================================

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import SessionLockModal from '@/components/auth/SessionLockModal';
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
  const { isLocked, unlock } = useSessionTimeout(true);

  return (
    <div className="min-h-screen flex bg-[var(--bg-main)] text-[var(--text-main)]">
      {/* Modal Kunci Sesi 1 Jam Inaktivitas */}
      <SessionLockModal
        isOpen={isLocked}
        userRole={userRole}
        displayName={displayName}
        onUnlock={unlock}
      />

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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
