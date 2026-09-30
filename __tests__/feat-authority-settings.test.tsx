/**
 * components/settings/MergeAuthoritySettings and its card on app/settings/page.tsx:
 * administrators edit the network hierarchy and regional overrides the merge ranks reports
 * with; everyone else sees the table read-only. The API is simulated with a fetch mock;
 * validation runs client-side with the same lib/merge-authority rules the API applies.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/lib/auth/hooks', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/settings/DefaultFieldMappings', () => ({
  DefaultFieldMappings: ({ readOnly }: { readOnly: boolean }) => <div data-testid="field-mappings" data-readonly={String(readOnly)} />,
}));

import { MergeAuthoritySettings } from '@/components/settings/MergeAuthoritySettings';
import { DEFAULT_MERGE_AUTHORITY, type MergeAuthorityTable } from '@/lib/merge-authority-table';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth/hooks';
import { UserRole } from '@/lib/auth/types';

type Call = { method: string; body: unknown };
let calls: Call[] = [];
let served: MergeAuthorityTable = DEFAULT_MERGE_AUTHORITY;
let putStatus = 200;
let putError = 'Server refused';

const customTable: MergeAuthorityTable = {
  hierarchy: [
    { patterns: ['usgs', 'neic'], priority: 1, description: 'USGS first', agency: 'usgs' },
    { patterns: ['geonet'], priority: 2, description: 'GeoNet', agency: 'geonet', region: 'NZ' },
  ],
  regions: [{ name: 'JP', bounds: { minLat: 24, maxLat: 46, minLon: 122, maxLon: 154 }, hierarchy: [{ patterns: ['jma'], priority: 1, agency: 'jma' }] }],
  source: 'custom',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  calls = [];
  served = DEFAULT_MERGE_AUTHORITY;
  putStatus = 200;
  (toast as jest.Mock).mockClear();
  (useAuth as jest.Mock).mockReturnValue({ user: { role: UserRole.ADMIN }, isAuthenticated: true, isLoading: false });
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, body });
    expect(String(input)).toBe('/api/settings/merge-authority');
    const json = (status: number, payload: unknown) => ({ ok: status < 400, status, json: async () => payload });
    if (method === 'GET') return json(200, served);
    if (method === 'PUT') {
      if (putStatus !== 200) return json(putStatus, { error: putError });
      return json(200, { success: true, table: { ...body, source: 'custom', updatedAt: '2026-09-30T12:00:00.000Z' } });
    }
    if (method === 'DELETE') return json(200, { success: true, table: DEFAULT_MERGE_AUTHORITY });
    throw new Error(`unexpected ${method}`);
  }) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

const waitLoaded = () => screen.findByRole('heading', { name: /network authority/i });

describe('MergeAuthoritySettings', () => {
  it('loads the effective table and renders every hierarchy row and region', async () => {
    render(<MergeAuthoritySettings />);
    await waitLoaded();
    expect(calls).toEqual([{ method: 'GET', body: undefined }]);
    expect(screen.getByText('Built-in default')).toBeInTheDocument();

    expect(screen.getByLabelText('Hierarchy 1 patterns')).toHaveValue('geonet, gns');
    expect(screen.getByLabelText('Hierarchy 1 priority')).toHaveValue(1);
    expect(screen.getByLabelText('Hierarchy 1 agency')).toHaveValue('geonet');
    expect(screen.getByLabelText('Hierarchy 1 description')).toHaveValue('GeoNet (NZ authoritative)');
    expect(screen.getByLabelText('Hierarchy 1 region')).toHaveValue('NZ');
    expect(screen.getByLabelText('Hierarchy 10 patterns')).toHaveValue('ign');

    expect(screen.getByLabelText('Region 1 name')).toHaveValue('NZ');
    // The NZ box crosses the date line: west edge 165, east edge -175, shown as stored.
    expect(screen.getByLabelText('Region 1 minLon')).toHaveValue(165);
    expect(screen.getByLabelText('Region 1 maxLon')).toHaveValue(-175);
    expect(screen.getByLabelText('Region 1 entry 1 patterns')).toHaveValue('geonet, gns');
    expect(screen.getByLabelText('Region 2 name')).toHaveValue('JP');
    expect(screen.getByLabelText('Region 2 entry 4 patterns')).toHaveValue('usgs, neic');

    // Nothing has changed yet, so there is nothing to save.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('shows a custom table as custom with its save time', async () => {
    served = customTable;
    render(<MergeAuthoritySettings />);
    await waitLoaded();
    expect(screen.getByText('Custom table')).toBeInTheDocument();
    expect(screen.getByText(/^Saved /)).toBeInTheDocument();
    expect(screen.getByLabelText('Hierarchy 1 patterns')).toHaveValue('usgs, neic');
    expect(screen.queryByLabelText('Hierarchy 3 patterns')).not.toBeInTheDocument();
  });

  it('falls back to the default table when the API cannot be reached', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<MergeAuthoritySettings />);
    await waitLoaded();
    expect(screen.getByLabelText('Hierarchy 1 patterns')).toHaveValue('geonet, gns');
    error.mockRestore();
  });

  it('saves an edited table: normalised body, PUT once, state taken from the response', async () => {
    const user = userEvent.setup();
    render(<MergeAuthoritySettings />);
    await waitLoaded();

    // Put the USGS row first by moving it up three places and re-numbering.
    await user.click(screen.getByRole('button', { name: 'Move hierarchy 4 up' }));
    await user.click(screen.getByRole('button', { name: 'Move hierarchy 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Move hierarchy 2 up' }));
    expect(screen.getByLabelText('Hierarchy 1 patterns')).toHaveValue('usgs, neic, anss, comcat');
    await user.clear(screen.getByLabelText('Hierarchy 1 priority'));
    await user.type(screen.getByLabelText('Hierarchy 1 priority'), '1');
    await user.clear(screen.getByLabelText('Hierarchy 2 priority'));
    await user.type(screen.getByLabelText('Hierarchy 2 priority'), '2');
    // Patterns typed with mixed case and a stray separator are normalised, not refused.
    await user.clear(screen.getByLabelText('Hierarchy 1 patterns'));
    await user.type(screen.getByLabelText('Hierarchy 1 patterns'), 'USGS, neic,, Usgs');
    // Drop the JP region.
    await user.click(screen.getByRole('button', { name: 'Remove region 2' }));

    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1));
    const put = calls.find(c => c.method === 'PUT')!.body as { hierarchy: unknown[]; regions: unknown[] };
    expect(put.hierarchy[0]).toEqual({ patterns: ['usgs', 'neic'], priority: 1, description: 'USGS/NEIC', agency: 'usgs' });
    expect(put.hierarchy[1]).toEqual({ patterns: ['geonet', 'gns'], priority: 2, description: 'GeoNet (NZ authoritative)', agency: 'geonet', region: 'NZ' });
    expect(put.hierarchy).toHaveLength(10);
    expect(put.regions).toHaveLength(1);
    expect((put.regions[0] as { name: string }).name).toBe('NZ');
    // Only the table is sent, not the GET-only status fields.
    expect(put).not.toHaveProperty('source');

    await waitFor(() => expect(screen.getByText('Custom table')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Settings saved' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses an invalid draft before any request and points at the row', async () => {
    const user = userEvent.setup();
    render(<MergeAuthoritySettings />);
    await waitLoaded();

    await user.clear(screen.getByLabelText('Hierarchy 3 patterns'));
    await user.type(screen.getByLabelText('Hierarchy 3 patterns'), 'isc-gem');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Invalid authority table: hierarchy\.2\.patterns\.0/);
    expect(calls.filter(c => c.method === 'PUT')).toHaveLength(0);
    // Editing again clears the message so the user is not shown a stale complaint.
    await user.type(screen.getByLabelText('Hierarchy 3 description'), '!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server\'s refusal and keeps the draft', async () => {
    const user = userEvent.setup();
    putStatus = 400;
    putError = 'Invalid authority table: hierarchy.0.priority: server says no';
    render(<MergeAuthoritySettings />);
    await waitLoaded();
    await user.type(screen.getByLabelText('Hierarchy 1 description'), ' edited');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('server says no');
    expect(screen.getByLabelText('Hierarchy 1 description')).toHaveValue('GeoNet (NZ authoritative) edited');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('adds a region and an entry, validating the new bounds', async () => {
    const user = userEvent.setup();
    render(<MergeAuthoritySettings />);
    await waitLoaded();
    await user.click(screen.getByRole('button', { name: /add region/i }));
    const region = screen.getByTestId('region-2');
    await user.type(within(region).getByLabelText('Region 3 name'), 'Tonga');
    await user.type(within(region).getByLabelText('Region 3 minLat'), '-25');
    await user.type(within(region).getByLabelText('Region 3 maxLat'), '-15');
    await user.type(within(region).getByLabelText('Region 3 minLon'), '-180');
    await user.type(within(region).getByLabelText('Region 3 maxLon'), '-170');
    await user.type(within(region).getByLabelText('Region 3 entry 1 patterns'), 'usgs');
    await user.selectOptions(within(region).getByLabelText('Region 3 entry 1 agency'), 'usgs');
    await user.click(within(region).getByRole('button', { name: /add entry/i }));
    await user.type(within(region).getByLabelText('Region 3 entry 2 patterns'), 'isc');

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1));
    const put = calls.find(c => c.method === 'PUT')!.body as { regions: Array<Record<string, unknown>> };
    expect(put.regions[2]).toEqual({
      name: 'Tonga',
      bounds: { minLat: -25, maxLat: -15, minLon: -180, maxLon: -170 },
      hierarchy: [{ patterns: ['usgs'], priority: 1, agency: 'usgs' }, { patterns: ['isc'], priority: 2 }],
    });
  });

  it('refuses a latitude outside the globe on a new region without a request', async () => {
    const user = userEvent.setup();
    render(<MergeAuthoritySettings />);
    await waitLoaded();
    await user.click(screen.getByRole('button', { name: /add region/i }));
    await user.type(screen.getByLabelText('Region 3 name'), 'Bad');
    await user.type(screen.getByLabelText('Region 3 minLat'), '-95');
    await user.type(screen.getByLabelText('Region 3 maxLat'), '0');
    await user.type(screen.getByLabelText('Region 3 minLon'), '0');
    await user.type(screen.getByLabelText('Region 3 maxLon'), '10');
    await user.type(screen.getByLabelText('Region 3 entry 1 patterns'), 'usgs');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/regions\.2\.bounds\.minLat/);
    expect(calls.filter(c => c.method === 'PUT')).toHaveLength(0);
  });

  it('resets to the defaults through DELETE after confirmation', async () => {
    const user = userEvent.setup();
    served = customTable;
    render(<MergeAuthoritySettings />);
    await waitLoaded();
    expect(screen.getByText('Custom table')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset to defaults/i }));
    await user.click(await screen.findByRole('button', { name: /^reset$/i }));

    await waitFor(() => expect(calls.filter(c => c.method === 'DELETE')).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('Built-in default')).toBeInTheDocument());
    expect(screen.getByLabelText('Hierarchy 1 patterns')).toHaveValue('geonet, gns');
    expect(screen.getByLabelText('Hierarchy 10 patterns')).toHaveValue('ign');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reset complete' }));
  });

  it('renders read-only for non-administrators: every control disabled, nothing sent', async () => {
    const user = userEvent.setup();
    served = customTable;
    render(<MergeAuthoritySettings readOnly />);
    await waitLoaded();

    expect(screen.getByLabelText('Hierarchy 1 patterns')).toHaveValue('usgs, neic');
    expect(screen.getByLabelText('Hierarchy 1 patterns')).toBeDisabled();
    expect(screen.getByLabelText('Hierarchy 1 agency')).toBeDisabled();
    expect(screen.getByLabelText('Region 1 minLat')).toBeDisabled();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /add region/i })).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: /^(Move|Remove) / })) expect(button).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(calls.map(c => c.method)).toEqual(['GET']);
  });
});

describe('Settings page: Merge authority card', () => {
  // The shadcn/Radix Tabs unmount inactive panels, so the tab must be opened first.
  it('shows the card to an administrator with editing enabled', async () => {
    const user = userEvent.setup();
    const { default: SettingsPage } = await import('@/app/settings/page');
    render(<SettingsPage />);
    await user.click(screen.getByRole('tab', { name: /merge authority/i }));
    expect(screen.getByText(/network hierarchy and regional overrides/i)).toBeInTheDocument();
    await waitLoaded();
    expect(screen.queryByText(/view-only settings/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hierarchy 1 patterns')).toBeEnabled();
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeEnabled();
  });

  it('shows the view-only notice and a read-only table to a viewer', async () => {
    const user = userEvent.setup();
    (useAuth as jest.Mock).mockReturnValue({ user: { role: UserRole.VIEWER }, isAuthenticated: true, isLoading: false });
    const { default: SettingsPage } = await import('@/app/settings/page');
    render(<SettingsPage />);
    expect(screen.getByText(/view-only settings/i)).toBeInTheDocument();
    expect(screen.getByText(/merge authority settings/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /merge authority/i }));
    await waitLoaded();
    expect(screen.getByLabelText('Hierarchy 1 patterns')).toBeDisabled();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });
});
