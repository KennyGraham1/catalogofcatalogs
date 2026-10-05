'use client';

import { ReactNode, useState } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toaster';
import { CatalogueProvider } from '@/contexts/CatalogueContext';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { CommandPalette } from '@/components/ui/command-palette';
import { KeyboardShortcutsHelp } from '@/components/ui/keyboard-shortcuts-help';
import { GlobalSearchDialog } from '@/components/ui/global-search-dialog';
import { ReadOnlyBanner } from '@/components/ui/read-only-banner';
import { useRouter } from 'next/navigation';

interface LayoutProps {
  children: ReactNode;
  nonce?: string;
}

export function Layout({ children, nonce }: LayoutProps) {
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
    // The nonce matters only in the server render, where it lets the CSP run next-themes'
    // inline theme script. Browsers then blank a script's nonce attribute (so page scripts
    // cannot read it), and hydrating with the real value made React report an attribute
    // mismatch on every page; on the client the script never runs again, so it gets ''.
    // (next-themes 0.4 does the same internally.)
    <ThemeProvider nonce={typeof window === 'undefined' ? nonce : ''} attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <CatalogueProvider>
        <div className="min-h-screen flex flex-col">
          <Header
            onShowShortcuts={() => setShortcutsHelpOpen(true)}
            onShowSearch={() => setGlobalSearchOpen(true)}
          />
          <main className="flex-1 pt-20">
            {/* Inside <main> so it starts below the fixed header, not underneath it. */}
            <ReadOnlyBanner />
            {children}
          </main>
          <Footer />
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
