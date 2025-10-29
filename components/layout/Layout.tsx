'use client';

import { ReactNode } from 'react';
import { Header } from './Header';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toaster';
import { CatalogueProvider } from '@/contexts/CatalogueContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <CatalogueProvider autoRefreshInterval={30000}>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 pt-20">
            {children}
          </main>
          <Toaster />
        </div>
      </CatalogueProvider>
    </ThemeProvider>
  );
}