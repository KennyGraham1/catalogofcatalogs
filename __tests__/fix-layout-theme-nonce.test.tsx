/**
 * Hydration: browsers blank a script's nonce attribute once parsed (the value stays only
 * in the script's `nonce` property), so a client render that passed the real nonce made
 * React report "some attributes of the server rendered HTML didn't match" on every page.
 * The client render must not pass it; the server render does (fix-layout-theme-nonce-ssr).
 */
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
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

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

it('the client render does not put the nonce on the theme script', () => {
  const { container } = render(<Layout nonce="bm9uY2UtMTIz"><p>page</p></Layout>);
  const script = Array.from(container.querySelectorAll('script')).find(s => s.textContent?.includes('localStorage'));
  expect(script).toBeDefined();
  expect(script!.getAttribute('nonce') ?? '').toBe('');
});
