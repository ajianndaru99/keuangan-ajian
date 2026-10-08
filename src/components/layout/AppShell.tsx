'use client';

// ==============================================================================
// COMPONENT: src/components/layout/AppShell.tsx
// Shell Layout Utama: Menggabungkan Sidebar Monexa & TopBar
// ==============================================================================

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';

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

  return (
    <div className="min-h-screen flex bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-300">
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
