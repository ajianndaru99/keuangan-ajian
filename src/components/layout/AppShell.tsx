'use client';

// ==============================================================================
// COMPONENT: src/components/layout/AppShell.tsx
// Shell Layout Utama (Sidebar + TopBar + Kunci Sesi 1 Jam)
// ==============================================================================

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import SessionLockModal from '@/components/auth/SessionLockModal';
import { useSessionTimeout } from '@/lib/auth/useSessionTimeout';

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
}

export default function AppShell({
  children,
  displayName,
}: AppShellProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { isLocked, unlock } = useSessionTimeout(true);

  return (
    <div className="min-h-screen flex bg-[var(--bg-main)] text-[var(--text-main)]">
      <SessionLockModal
        isOpen={isLocked}
        userRole="suami"
        displayName={displayName}
        onUnlock={unlock}
      />

      <Sidebar
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopBar
          displayName={displayName}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
