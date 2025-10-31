'use client';

import { ReactNode, useState } from 'react';
import { Header } from './Header';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toaster';
import { CatalogueProvider } from '@/contexts/CatalogueContext';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { CommandPalette } from '@/components/ui/command-palette';
import { KeyboardShortcutsHelp } from '@/components/ui/keyboard-shortcuts-help';
import { GlobalSearchDialog } from '@/components/ui/global-search-dialog';
import { useRouter } from 'next/navigation';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const router = useRouter();

  // Register global keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'k',
        ctrl: true,
        description: 'Open command palette',
        action: () => setCommandPaletteOpen(true),
      },
      {
        key: '/',
        ctrl: true,
        description: 'Show keyboard shortcuts',
        action: () => setShortcutsHelpOpen(true),
      },
      {
        key: '/',
        description: 'Open global search',
        action: () => setGlobalSearchOpen(true),
        preventDefault: true,
      },
      {
        key: 'h',
        ctrl: true,
        description: 'Go to dashboard',
        action: () => router.push('/dashboard'),
      },
      {
        key: 'l',
        ctrl: true,
        description: 'Go to catalogues list',
        action: () => router.push('/catalogues'),
      },
      {
        key: 'i',
        ctrl: true,
        description: 'Go to import page',
        action: () => router.push('/import'),
      },
      {
        key: 'u',
        ctrl: true,
        description: 'Go to upload page',
        action: () => router.push('/upload'),
      },
      {
        key: 'm',
        ctrl: true,
        description: 'Go to merge page',
        action: () => router.push('/merge'),
      },
    ],
  });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <CatalogueProvider autoRefreshInterval={30000}>
        <div className="min-h-screen flex flex-col">
          <Header
            onShowShortcuts={() => setShortcutsHelpOpen(true)}
            onShowSearch={() => setGlobalSearchOpen(true)}
          />
          <main className="flex-1 pt-20">
            {children}
          </main>
          <Toaster />

          {/* Global keyboard shortcut components */}
          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
          />
          <KeyboardShortcutsHelp
            open={shortcutsHelpOpen}
            onOpenChange={setShortcutsHelpOpen}
          />
          <GlobalSearchDialog
            open={globalSearchOpen}
            onOpenChange={setGlobalSearchOpen}
          />
        </div>
      </CatalogueProvider>
    </ThemeProvider>
  );
}