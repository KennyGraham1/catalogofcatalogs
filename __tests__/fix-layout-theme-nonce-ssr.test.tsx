/** @jest-environment node */
/**
 * next-themes' inline theme script needs the CSP nonce in the SERVER render, or the browser
 * refuses to run it (the page flashes the wrong theme). The client render passes '' instead
 * (see fix-layout-theme-nonce.test.tsx), because browsers blank the attribute after parsing.
 */
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { Layout } from '@/components/layout/Layout';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signOut: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}));
jest.mock('@/contexts/CatalogueContext', () => ({
  CatalogueProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/ui/command-palette', () => ({ CommandPalette: () => null }));
jest.mock('@/components/ui/keyboard-shortcuts-help', () => ({ KeyboardShortcutsHelp: () => null }));
jest.mock('@/components/ui/global-search-dialog', () => ({ GlobalSearchDialog: () => null }));

it('the server render gives the theme script the request nonce', () => {
  const html = renderToString(<Layout nonce="bm9uY2UtMTIz"><p>page</p></Layout>);
  const script = /<script[^>]*>[^<]*localStorage[^<]*<\/script>/.exec(html)?.[0] ?? '';
  expect(script).toContain('nonce="bm9uY2UtMTIz"');
});
