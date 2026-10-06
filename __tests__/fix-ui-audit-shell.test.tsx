/**
 * UI audit 2026-10-05 (UI_AUDIT_2026-10-05.md): the app shell, shared controls, settings
 * and onboarding.
 *
 *  - Finding 8: the header's brand pushed its buttons off a 320 px screen; the mobile menu
 *    ran past a 500 px-high screen with no scrolling; Settings showed only its icon; and
 *    Escape left the menu open.
 *  - Finding 6/5: numbered pagination used anchors without href (no keyboard operation)
 *    and did not fit narrow containers; settings tabs widened the page.
 *  - Finding 10: inactive tabs measured 4.34:1.
 *  - Finding 11: Settings disabled the theme for non-admins.
 *  - Finding 9: registration did not say it creates a Viewer account, blocked workflows
 *    offered no way to ask for Editor access, and sign-in links lost the destination.
 *  - Finding 12: the auth pages had no h1, and there was no skip link.
 */
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';
import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = jest.fn();
let mockPathname = '/catalogues';
let mockQuery = '';
let mockSession: { data: unknown; status: 'loading' | 'authenticated' | 'unauthenticated' } = {
  data: null,
  status: 'unauthenticated',
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockQuery),
}));
jest.mock('next-auth/react', () => ({
  useSession: () => mockSession,
  signOut: jest.fn(),
  signIn: jest.fn(),
}));
// Not under test: the catalogue provider fetches on mount, and the dialogs are closed.
jest.mock('@/contexts/CatalogueContext', () => ({
  CatalogueProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/ui/command-palette', () => ({ CommandPalette: () => null }));
jest.mock('@/components/ui/keyboard-shortcuts-help', () => ({ KeyboardShortcutsHelp: () => null }));
jest.mock('@/components/ui/global-search-dialog', () => ({ GlobalSearchDialog: () => null }));
// The settings panels fetch their own data; only the page's gating is under test here.
jest.mock('@/components/settings/DefaultFieldMappings', () => ({
  DefaultFieldMappings: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="field-mappings" data-readonly={String(readOnly)} />
  ),
}));
jest.mock('@/components/settings/MergeAuthoritySettings', () => ({
  MergeAuthoritySettings: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="merge-authority" data-readonly={String(readOnly)} />
  ),
}));

import { Header } from '@/components/layout/Header';
import { Layout } from '@/components/layout/Layout';
import { ReadOnlyBanner } from '@/components/ui/read-only-banner';
import { DataPagination } from '@/components/ui/data-pagination';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import SettingsPage from '@/app/settings/page';
import LoginPage from '@/app/(auth)/login/page';
import RegisterPage from '@/app/(auth)/register/page';
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';
import ProfilePage from '@/app/(auth)/profile/page';
import { Permission, UserRole } from '@/lib/auth/types';

const signedOut = () => { mockSession = { data: null, status: 'unauthenticated' }; };
const signedInAs = (role: UserRole) => {
  mockSession = {
    data: { user: { id: 'u1', name: 'Ann Example', email: 'ann@example.test', role } },
    status: 'authenticated',
  };
};

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

const originalFetch = global.fetch;

beforeEach(() => {
  push.mockClear();
  mockPathname = '/catalogues';
  mockQuery = '';
  signedOut();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------------------
// Finding 8: header and mobile menu
// ---------------------------------------------------------------------------------------

describe('header (finding 8)', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    const toggle = screen.getByRole('button', { name: 'Toggle menu' });
    await user.click(toggle);
    return { toggle, menu: document.getElementById('mobile-nav')! };
  };

  it('shows a short wordmark below sm and keeps the full name as the link name', () => {
    render(<Header />);
    const home = screen.getByRole('link', { name: 'EarthQuake Catalogue' });
    expect(home).toHaveAttribute('href', '/');

    const short = home.querySelector('[data-brand="short"]')!;
    expect(short).toHaveTextContent('EQ Catalogue');
    expect(short).toHaveAttribute('aria-hidden', 'true');
    expect(short).toHaveClass('sm:hidden', 'truncate');

    const full = home.querySelector('[data-brand="full"]')!;
    expect(full).toHaveClass('sr-only', 'sm:not-sr-only');
    // The brand may shrink below sm instead of pushing the buttons off screen.
    expect(home).toHaveClass('min-w-0');
    expect(home).not.toHaveClass('shrink-0');
  });

  it('caps the open menu at the viewport height below the header and scrolls inside it', async () => {
    const user = userEvent.setup();
    render(<Header />);
    const { toggle, menu } = await openMenu(user);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-nav');
    expect(menu.className).toMatch(/max-h-\[calc\(100vh-4\.5rem\)\]/);
    expect(menu.className).toMatch(/max-h-\[calc\(100dvh-4\.5rem\)\]/);
    expect(menu).toHaveClass('overflow-y-auto', 'overscroll-contain');
  });

  it('labels the Settings entry in the menu with visible text', async () => {
    const user = userEvent.setup();
    render(<Header />);
    const { menu } = await openMenu(user);
    const settings = within(menu).getByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('href', '/settings');
    expect(settings).toHaveTextContent('Settings');
    expect(settings).not.toHaveAttribute('aria-label');
  });

  it('closes on Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup();
    render(<Header />);
    const { toggle, menu } = await openMenu(user);
    within(menu).getByRole('link', { name: 'Dashboard' }).focus();

    await user.keyboard('{Escape}');

    expect(document.getElementById('mobile-nav')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('still closes when the route changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Header />);
    await openMenu(user);
    mockPathname = '/merge';
    rerender(<Header />);
    expect(document.getElementById('mobile-nav')).toBeNull();
  });

  it('sends Login and Sign Up back to the current page', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await openMenu(user);
    const logins = screen.getAllByRole('link', { name: /^login$/i });
    // Desktop row and mobile menu.
    expect(logins).toHaveLength(2);
    for (const link of logins) expect(link).toHaveAttribute('href', '/login?callbackUrl=%2Fcatalogues');
    for (const link of screen.getAllByRole('link', { name: /^sign up$/i })) {
      expect(link).toHaveAttribute('href', '/register?callbackUrl=%2Fcatalogues');
    }
  });

  it('names its icon-only buttons', () => {
    signedInAs(UserRole.EDITOR);
    render(<Header onShowSearch={() => {}} onShowShortcuts={() => {}} />);
    expect(screen.getByRole('button', { name: 'Search events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Account menu for Ann Example' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('title', 'Settings');
  });
});

describe('skip link (finding 12)', () => {
  it('is the first stop for the keyboard and targets a focusable <main>', async () => {
    const user = userEvent.setup();
    render(<Layout><p>page content</p></Layout>);
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(skip).toHaveClass('sr-only', 'focus:not-sr-only');

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(skip).toHaveFocus();
  });
});

// ---------------------------------------------------------------------------------------
// Findings 5, 6 and 7: shared pagination
// ---------------------------------------------------------------------------------------

describe('data pagination (findings 5, 6, 7)', () => {
  function Harness({ totalItems = 35 }: { totalItems?: number }) {
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(10);
    return (
      <DataPagination
        currentPage={page}
        totalPages={Math.ceil(totalItems / size)}
        totalItems={totalItems}
        pageSize={size}
        onPageChange={setPage}
        onPageSizeChange={setSize}
      />
    );
  }

  it('renders page numbers as native buttons that Enter and Space operate', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const page2 = screen.getByRole('button', { name: 'Go to page 2' });
    expect(page2.tagName).toBe('BUTTON');
    expect(page2).toHaveAttribute('type', 'button');

    page2.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Showing 11 to 20 of 35 results')).toBeInTheDocument();
    expect(page2).toHaveAttribute('aria-current', 'page');
    expect(page2).toHaveFocus();

    const page3 = screen.getByRole('button', { name: 'Go to page 3' });
    page3.focus();
    await user.keyboard(' ');
    expect(screen.getByText('Showing 21 to 30 of 35 results')).toBeInTheDocument();
    expect(page3).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Go to page 2' })).not.toHaveAttribute('aria-current');
  });

  it('puts the page buttons in the tab order after the rows-per-page selector', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const rows = screen.getByRole('combobox', { name: 'Rows per page' });
    rows.focus();
    // Previous is disabled on page 1, so the next stop is page 1.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveFocus();
  });

  it('names Previous and Next and moves focus off Next when it disables on the last page', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const previous = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(previous).toBeDisabled();

    next.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    expect(next).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('Showing 31 to 35 of 35 results')).toBeInTheDocument();
    expect(next).toBeDisabled();
    const last = screen.getByRole('button', { name: 'Go to page 4' });
    expect(last).toHaveAttribute('aria-current', 'page');
    expect(last).toHaveFocus();
  });

  it('stacks below sm and lets the page list wrap instead of overflowing', () => {
    const { container } = render(<Harness />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('flex-col', 'sm:flex-row', 'min-w-0');
    const controls = root.children[1] as HTMLElement;
    expect(controls).toHaveClass('flex-col', 'max-w-full', 'min-w-0');
    const list = within(screen.getByRole('navigation', { name: 'Pagination' })).getByRole('list');
    expect(list).toHaveClass('flex-wrap');
    // Previous/Next shrink to their chevrons below sm; the text stays their name.
    const previousText = within(screen.getByRole('button', { name: 'Previous' })).getByText('Previous');
    expect(previousText).toHaveClass('sr-only', 'sm:not-sr-only');
  });
});

// ---------------------------------------------------------------------------------------
// Findings 6 and 11: settings
// ---------------------------------------------------------------------------------------

describe('settings page (findings 6, 11)', () => {
  const asRole = (role: UserRole | null) => {
    if (role) signedInAs(role); else signedOut();
  };

  it.each([
    ['a guest', null],
    ['a viewer', UserRole.VIEWER],
    ['an editor', UserRole.EDITOR],
    ['an admin', UserRole.ADMIN],
  ])('lets %s change the theme', (_label, role) => {
    asRole(role as UserRole | null);
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeEnabled();
  });

  it('keeps schema mappings and merge authority admin-only', async () => {
    const user = userEvent.setup();
    asRole(UserRole.EDITOR);
    render(<SettingsPage />);
    expect(screen.getByText(/view-only settings/i)).toBeInTheDocument();
    expect(screen.getByText(/you can still change the theme/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Schema Mapping' }));
    expect(screen.getByTestId('field-mappings')).toHaveAttribute('data-readonly', 'true');
    await user.click(screen.getByRole('tab', { name: 'Merge Authority' }));
    expect(screen.getByTestId('merge-authority')).toHaveAttribute('data-readonly', 'true');
  });

  it('offers a guest sign-in that returns to Settings', () => {
    asRole(null);
    render(<SettingsPage />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fsettings');
  });

  it('shows no view-only notice or sign-in link while the session is still loading', () => {
    // Signed-in users (administrators included) used to see the guest notice flash first,
    // and production prefetched its /login link.
    mockSession = { data: null, status: 'loading' };
    render(<SettingsPage />);
    expect(screen.queryByText(/view-only settings/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeEnabled();
  });

  it('lays the tabs out in a two-column grid below sm', () => {
    asRole(UserRole.ADMIN);
    render(<SettingsPage />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('grid', 'grid-cols-2', 'w-full', 'sm:inline-flex');
    for (const tab of screen.getAllByRole('tab')) expect(tab).toHaveClass('whitespace-normal', 'sm:whitespace-nowrap');
  });

  it('has one h1 and card titles at h2', () => {
    asRole(UserRole.ADMIN);
    render(<SettingsPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: /general settings/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// Finding 9: onboarding, Editor access requests and sign-in callbacks
// ---------------------------------------------------------------------------------------

describe('onboarding (finding 9)', () => {
  it('registration explains what a new Viewer account can and cannot do', () => {
    render(<RegisterPage />);
    const note = screen.getByRole('region', { name: 'New accounts have Viewer access' });
    expect(note).toHaveTextContent(/browse catalogues, view maps and analytics, and export data/i);
    expect(note).toHaveTextContent(/uploading, importing and merging catalogues need editor access/i);
    expect(note).toHaveTextContent(/administrator/i);
    expect(note).toHaveTextContent(/request it from your profile/i);
  });

  it('registration keeps the destination through to sign-in', async () => {
    mockQuery = 'callbackUrl=%2Fmerge';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ user: {} }) });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    render(<RegisterPage />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fmerge');

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Ann Example' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough-1' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'long-enough-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?callbackUrl=%2Fmerge&registered=true'));
  });

  it('registration drops an off-site callback', () => {
    mockQuery = `callbackUrl=${encodeURIComponent('https://evil.example/x')}`;
    render(<RegisterPage />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('sign-in passes its callback on to registration and password recovery', () => {
    mockQuery = 'callbackUrl=%2Fupload';
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register?callbackUrl=%2Fupload');
    expect(screen.getByRole('link', { name: 'Forgot Password?' })).toHaveAttribute('href', '/forgot-password?callbackUrl=%2Fupload');
  });

  it('password recovery returns to sign-in with the same callback', () => {
    mockQuery = 'callbackUrl=%2Fimport';
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login?callbackUrl=%2Fimport');
  });

  it('the read-only banner offers a request path through sign-in to the request form', () => {
    mockPathname = '/merge';
    render(<ReadOnlyBanner />);
    const banner = screen.getByRole('region', { name: 'Read-only mode' });
    expect(within(banner).getByRole('link', { name: 'Request Editor access' }))
      .toHaveAttribute('href', '/login?callbackUrl=%2Fprofile%23request-access');
    expect(within(banner).getByRole('link', { name: /^login$/i })).toHaveAttribute('href', '/login?callbackUrl=%2Fmerge');
    expect(banner.className).toMatch(/dark:bg-amber-950/);
    expect(banner.className).toMatch(/dark:text-amber-100/);
  });

  describe('AuthGateCard', () => {
    it('gives a signed-in viewer a Request Editor access action to the profile form', () => {
      signedInAs(UserRole.VIEWER);
      mockPathname = '/upload';
      render(
        <AuthGateCard
          title="Editor access required"
          description="Editor or Admin access is required to upload catalogues."
          requiredRole={UserRole.EDITOR}
          action={{ label: 'Back to Dashboard', href: '/dashboard' }}
        />
      );
      expect(screen.getByRole('heading', { level: 1, name: 'Editor access required' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Request Editor access' })).toHaveAttribute('href', '/profile#request-access');
      expect(screen.getByText(/your account has viewer access/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/dashboard');
    });

    it('does not offer a request to someone who already has the role', () => {
      signedInAs(UserRole.EDITOR);
      render(<AuthGateCard title="Editor access required" requiredRole={UserRole.EDITOR} />);
      expect(screen.queryByRole('link', { name: /request editor access/i })).toBeNull();
    });

    it('offers the Editor request for an Editor permission, but none on admin-only gates', () => {
      signedInAs(UserRole.VIEWER);
      const { unmount } = render(<AuthGateCard title="Merge" requiredPermission={Permission.MERGE_CATALOGUES} />);
      expect(screen.getByRole('link', { name: 'Request Editor access' })).toHaveAttribute('href', '/profile#request-access');
      unmount();
      render(<AuthGateCard title="Admin access required" requiredRole={UserRole.ADMIN} />);
      expect(screen.queryByRole('link', { name: /request .* access/i })).toBeNull();
    });

    it('turns a guest\'s plain sign-in links into ones that return to the gated page', () => {
      mockPathname = '/merge';
      render(
        <AuthGateCard
          title="Login required"
          requiredRole={UserRole.EDITOR}
          action={{ label: 'Log in', href: '/login' }}
          secondaryAction={{ label: 'Back to Home', href: '/' }}
        />
      );
      expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fmerge');
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fmerge');
      expect(screen.getByRole('link', { name: /request editor access/i }))
        .toHaveAttribute('href', '/login?callbackUrl=%2Fprofile%23request-access');
      expect(screen.getByText(/new accounts have viewer access/i)).toBeInTheDocument();
    });

    it('uses a lower heading level when placed under a page heading', () => {
      render(<AuthGateCard title="Login required" headingLevel="h2" />);
      expect(screen.getByRole('heading', { level: 2, name: 'Login required' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    });
  });

  it('the profile page brings the request form into view for #request-access', async () => {
    signedInAs(UserRole.VIEWER);
    mockPathname = '/profile';
    (global as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ requests: [] }),
    });
    window.history.replaceState(null, '', '/profile#request-access');
    try {
      await act(async () => { render(<ProfilePage />); });
      const heading = screen.getByRole('heading', { level: 2, name: 'Role Upgrade Request' });
      expect(heading.closest('#request-access')).not.toBeNull();
      await waitFor(() => expect(heading).toHaveFocus());
      expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

// ---------------------------------------------------------------------------------------
// Finding 12: a level-one heading on each auth page
// ---------------------------------------------------------------------------------------

describe('auth page headings (finding 12)', () => {
  it.each([
    ['sign-in', () => <LoginPage />, 'Sign in'],
    ['registration', () => <RegisterPage />, 'Create an account'],
    ['password recovery', () => <ForgotPasswordPage />, 'Forgot password'],
  ])('the %s page has an h1', (_label, page, name) => {
    render(page());
    expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------
// Finding 10: tab and badge contrast, recomputed from the theme tokens in globals.css
// ---------------------------------------------------------------------------------------

describe('theme contrast (finding 10)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');
  const layer = css.slice(css.indexOf('@layer base'));

  function tokens(selector: ':root' | '.dark'): Record<string, [number, number, number]> {
    const start = layer.indexOf(`${selector} {`);
    const block = layer.slice(start, layer.indexOf('}', start));
    const out: Record<string, [number, number, number]> = {};
    for (const m of Array.from(block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g))) {
      out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
    return out;
  }

  type RGB = [number, number, number];
  function hslToRgb([h, s, l]: [number, number, number]): RGB {
    const sat = s / 100;
    const lig = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  const luminance = (rgb: RGB) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: RGB, b: RGB) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
    [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;

  const themes = { light: tokens(':root'), dark: tokens('.dark') };
  const tabsSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'ui', 'tabs.tsx'), 'utf8');
  const badgeSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'ui', 'badge.tsx'), 'utf8');

  it('reads the tokens it needs from both themes', () => {
    for (const t of Object.values(themes)) {
      for (const name of ['background', 'foreground', 'muted', 'muted-foreground', 'destructive', 'destructive-foreground']) {
        expect(t[name]).toBeDefined();
      }
    }
  });

  it('reproduces the audited failure for the old light value (4.34:1)', () => {
    expect(contrast(hslToRgb([0, 0, 45.1]), hslToRgb(themes.light.muted))).toBeCloseTo(4.34, 1);
  });

  it.each(['light', 'dark'] as const)('tab states meet 4.5:1 in the %s theme', (name) => {
    const t = themes[name];
    const c = (k: string) => hslToRgb(t[k]);
    const inactive = contrast(c('muted-foreground'), c('muted'));
    const hover = contrast(c('foreground'), c('muted'));
    const active = contrast(c('foreground'), c('background'));
    // Disabled tabs keep the inactive colour at full opacity (see tabs.tsx).
    const disabled = inactive;
    for (const ratio of [inactive, hover, active, disabled]) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('the tab trigger styles match those states', () => {
    expect(tabsSource).toMatch(/TabsPrimitive\.List[\s\S]*bg-muted p-1 text-muted-foreground/);
    expect(tabsSource).toContain('enabled:hover:text-foreground');
    expect(tabsSource).toContain('data-[state=active]:bg-background data-[state=active]:text-foreground');
    expect(tabsSource).not.toMatch(/disabled:opacity-\d+/);
  });

  it.each(['light', 'dark'] as const)('destructive badges and buttons keep 4.5:1 text in the %s theme', (name) => {
    const t = themes[name];
    const c = (k: string) => hslToRgb(t[k]);
    expect(contrast(c('destructive-foreground'), c('destructive'))).toBeGreaterThanOrEqual(4.5);
    // Badge and button hover backgrounds (destructive/90 over the page).
    expect(contrast(c('destructive-foreground'), over(c('destructive'), c('background'), 0.9))).toBeGreaterThanOrEqual(4.5);
    // Muted text on the page and on muted panels.
    expect(contrast(c('muted-foreground'), c('background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the destructive badge hovers at /90, which keeps its text at 4.5:1', () => {
    expect(badgeSource).toContain('bg-destructive text-destructive-foreground hover:bg-destructive/90');
    expect(badgeSource).not.toContain('hover:bg-destructive/80');
  });

  it('light-theme destructive text on the page background meets 4.5:1', () => {
    const t = themes.light;
    expect(contrast(hslToRgb(t.destructive), hslToRgb(t.background))).toBeGreaterThanOrEqual(4.5);
  });

  // text-destructive reads --destructive-text (tailwind.config.ts textColor): the dark
  // --destructive is a background red and measured 1.98:1 as text on the dark page.
  it.each(['light', 'dark'] as const)('error text and icons meet 4.5:1 on the page and on muted panels in the %s theme', (name) => {
    const t = themes[name];
    const c = (k: string) => hslToRgb(t[k]);
    expect(contrast(c('destructive-text'), c('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c('destructive-text'), c('muted'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c('destructive-text'), c('card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('text-destructive uses the text token, while backgrounds keep --destructive', () => {
    const config = fs.readFileSync(path.join(__dirname, '..', 'tailwind.config.ts'), 'utf8');
    expect(config).toMatch(/textColor:\s*{\s*destructive:\s*{\s*DEFAULT:\s*'hsl\(var\(--destructive-text\)\)'/);
    expect(config).toContain("DEFAULT: 'hsl(var(--destructive))'");
  });
});
