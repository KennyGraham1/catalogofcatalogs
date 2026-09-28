/**
 * Regression tests for app/settings/page.tsx (gc#5).
 *
 * gc#5: every one of the 16 General/Visualization/Advanced controls was saved to
 * localStorage and read by nothing else in the app; the magnitude colour legend
 * matched neither the maps nor the charts. Fix: remove the inert controls (never
 * implement the "custom post-processing script" — arbitrary code execution) and
 * render the legend from the real colour functions/components the maps use.
 *
 * @/lib/auth/hooks and @/components/settings/DefaultFieldMappings are owned by
 * other agents; they are mocked here so this test exercises only SettingsPage's own
 * behaviour (which controls exist, admin gating, the legend) rather than their
 * internals.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/lib/auth/hooks', () => ({
  useAuth: jest.fn(),
}));
jest.mock('@/components/settings/DefaultFieldMappings', () => ({
  DefaultFieldMappings: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="field-mappings" data-readonly={String(readOnly)} />
  ),
}));

import SettingsPage from '@/app/settings/page';
import { useAuth } from '@/lib/auth/hooks';
import { UserRole } from '@/lib/auth/types';
import { getMagnitudeColor } from '@/lib/earthquake-utils';

const mockUseAuth = useAuth as jest.Mock;

describe('Settings page (gc#5)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { role: UserRole.ADMIN }, isAuthenticated: true, isLoading: false });
    try { window.localStorage.clear(); } catch { /* ignore */ }
  });

  // The shadcn/Radix Tabs used here do not just visually hide inactive panels: they
  // unmount their content entirely (no forceMount), so any assertion about a
  // non-default tab's content must activate that tab first.
  async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await user.click(screen.getByRole('tab', { name }));
  }

  it('no longer offers the placebo controls anywhere, including the forbidden custom script', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    for (const tabName of [/^general$/i, /schema mapping/i, /visualization reference/i]) {
      await openTab(user, tabName);
      expect(screen.queryByText(/post-processing script/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/custom.*python/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/external data fetch interval/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/processing batch size/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/cache limit/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/map provider/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/cluster nearby events/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/email notifications/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/api endpoint url/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/default import format/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/default export format/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    }
  });

  it('does not persist anything to the old placebo localStorage key on mount', () => {
    render(<SettingsPage />);
    expect(window.localStorage.getItem('eqcat:settings')).toBeNull();
  });

  it('keeps the two controls that actually work: theme toggle and schema mapping', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    // General is the default active tab.
    expect(screen.getByText(/select your preferred theme/i)).toBeInTheDocument();

    await openTab(user, /schema mapping/i);
    expect(screen.getByTestId('field-mappings')).toHaveAttribute('data-readonly', 'false');
  });

  it('gates schema mapping edits to admins and shows the view-only notice for others', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: { role: UserRole.VIEWER }, isAuthenticated: true, isLoading: false });
    render(<SettingsPage />);
    // The notice is shown regardless of which tab is active.
    expect(screen.getByText(/view-only settings/i)).toBeInTheDocument();

    await openTab(user, /schema mapping/i);
    expect(screen.getByTestId('field-mappings')).toHaveAttribute('data-readonly', 'true');
  });

  it('renders the magnitude legend from the real (deprecated, uniform-colour) getMagnitudeColor function', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await openTab(user, /visualization reference/i);

    // The function the legend is built from is genuinely uniform across magnitudes —
    // this is what makes the old green/yellow/orange/red/purple legend dishonest.
    expect(getMagnitudeColor(2)).toBe(getMagnitudeColor(7));
    expect(screen.getByText(/deprecated/i)).toBeInTheDocument();
    expect(screen.getByText('M2')).toBeInTheDocument();
    expect(screen.getByText('M7+')).toBeInTheDocument();
  });

  it('renders the real depth legend (components/map/MapLegend.tsx, backed by getEarthquakeColor)', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await openTab(user, /visualization reference/i);

    expect(screen.getByText('< 15 km')).toBeInTheDocument();
    expect(screen.getByText('≥ 200 km')).toBeInTheDocument();
    expect(screen.getByText('Unknown depth')).toBeInTheDocument();
  });
});
