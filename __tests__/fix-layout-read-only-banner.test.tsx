/**
 * The read-only banner must not sit underneath the fixed header.
 *
 * The header is fixed to the top of the viewport and transparent until the page scrolls;
 * <main> clears it with an 80 px top padding. The banner was rendered between the two, in
 * normal flow, so it started at the very top of the page, underneath the header: signed-out
 * visitors saw its message and its Login/Sign Up buttons overlapping the header's.
 */
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { Layout } from '@/components/layout/Layout';

let mockSession: { data: unknown; status: 'loading' | 'authenticated' | 'unauthenticated' };
jest.mock('next-auth/react', () => ({
  useSession: () => mockSession,
  signOut: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/catalogues',
}));
// Not under test: the catalogue provider fetches on mount, and the dialogs are closed.
jest.mock('@/contexts/CatalogueContext', () => ({
  CatalogueProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/ui/command-palette', () => ({ CommandPalette: () => null }));
jest.mock('@/components/ui/keyboard-shortcuts-help', () => ({ KeyboardShortcutsHelp: () => null }));
jest.mock('@/components/ui/global-search-dialog', () => ({ GlobalSearchDialog: () => null }));

beforeAll(() => {
  // next-themes reads the colour-scheme preference; jsdom has no matchMedia.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

const BANNER_TEXT = /you are in read-only mode/i;
const signedOut = () => { mockSession = { data: null, status: 'unauthenticated' }; };

describe('read-only banner', () => {
  it('renders inside <main>, below the fixed header, ahead of the page content', () => {
    signedOut();
    render(<Layout><p>page content</p></Layout>);

    expect(screen.getByRole('banner')).toHaveClass('fixed', 'top-0');
    const main = screen.getByRole('main');
    expect(main).toHaveClass('pt-20');
    const banner = screen.getByText(BANNER_TEXT);
    expect(main).toContainElement(banner);
    expect(banner.compareDocumentPosition(screen.getByText('page content')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows Login and Sign Up exactly where the header does not', () => {
    // The header's buttons are in its desktop navigation; below its breakpoint they are
    // folded into the menu, and the banner's links take over, at the same breakpoint.
    signedOut();
    render(<Layout><p>page content</p></Layout>);
    const nav = within(screen.getByRole('banner')).getByRole('button', { name: /login/i }).closest('nav')!;
    const breakpoint = nav.className.match(/\bhidden (\w+):flex\b/)?.[1];
    expect(breakpoint).toBeDefined();

    const main = within(screen.getByRole('main'));
    const login = main.getByRole('link', { name: /login/i });
    expect(login).toHaveAttribute('href', '/login');
    expect(main.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
    expect(login.closest(`[class~="${breakpoint}:hidden"]`)).not.toBeNull();
  });

  it('is not shown to signed-in users', () => {
    mockSession = { data: { user: { id: 'u1', name: 'Ann Editor', role: 'editor' } }, status: 'authenticated' };
    render(<Layout><p>page content</p></Layout>);
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });
});
