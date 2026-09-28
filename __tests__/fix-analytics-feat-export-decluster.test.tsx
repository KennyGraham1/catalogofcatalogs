/**
 * A2 item 7a: the catalogue page's export menu offers Gardner-Knopoff declustering tags,
 * sent as decluster=gardner-knopoff to /api/catalogues/[id]/export (which computes and
 * records them, C12). Driven through the real page; only fetch, auth, navigation, the
 * download plumbing and the Radix dropdown (which needs real pointer events to open) are
 * stubbed.
 */
import '@testing-library/jest-dom';
import * as react from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cat-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' } }),
  usePermission: () => true,
}));
jest.mock('@/components/ui/dropdown-menu', () => {
  const passthrough = ({ children }: any) => react.createElement(react.Fragment, null, children);
  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuLabel: passthrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: (props: any) => react.createElement('button', { onClick: props.onClick }, props.children),
    DropdownMenuCheckboxItem: (props: any) => react.createElement('label', null,
      react.createElement('input', {
        type: 'checkbox', checked: props.checked,
        onChange: (e: any) => props.onCheckedChange(e.target.checked),
      }),
      props.children),
  };
});

import CatalogueDetailPage from '@/app/catalogues/[id]/page';
import { clearAllCache } from '@/hooks/use-cached-fetch';

const CATALOGUE = { id: 'cat-1', name: 'Test catalogue', event_count: 1, status: 'complete', created_at: '2024-01-01T00:00:00Z' };
const EVENTS = [{ id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.0 }];

const json = (body: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body }) as unknown as Response;

let exportRequests: URLSearchParams[] = [];
const originalFetch = global.fetch;
const originalCreateObjectURL = (window.URL as any).createObjectURL;
const originalRevokeObjectURL = (window.URL as any).revokeObjectURL;
let anchorClick: jest.SpyInstance;

beforeEach(() => {
  clearAllCache();
  exportRequests = [];
  (global as any).fetch = jest.fn((input: any) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return Promise.resolve(json([CATALOGUE]));
    if (url.pathname === '/api/catalogues/cat-1/events') {
      return Promise.resolve(json({ data: EVENTS, pagination: { hasMore: false, nextCursor: null, prevCursor: null, limit: 500 } }));
    }
    if (url.pathname === '/api/catalogues/cat-1/export') {
      exportRequests.push(url.searchParams);
      return Promise.resolve({
        ok: true, status: 200, headers: { get: () => null },
        blob: async () => new Blob(['id,time'], { type: 'text/csv' }),
      } as unknown as Response);
    }
    throw new Error(`Unexpected fetch: ${url.pathname}`);
  });
  (window.URL as any).createObjectURL = jest.fn(() => 'blob:test');
  (window.URL as any).revokeObjectURL = jest.fn();
  anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  (window.URL as any).createObjectURL = originalCreateObjectURL;
  (window.URL as any).revokeObjectURL = originalRevokeObjectURL;
  anchorClick.mockRestore();
});

it('exports without declustering by default and with Gardner-Knopoff tags once ticked', async () => {
  render(<CatalogueDetailPage />);
  const csv = await screen.findByRole('button', { name: /CSV \(Spreadsheet\)/ });
  fireEvent.click(csv);
  await waitFor(() => expect(exportRequests).toHaveLength(1));
  expect(exportRequests[0].get('format')).toBe('csv');
  expect(exportRequests[0].has('decluster')).toBe(false);

  const option = screen.getByLabelText('Include Gardner-Knopoff declustering tags');
  expect(option).not.toBeChecked();
  fireEvent.click(option);
  fireEvent.click(screen.getByRole('button', { name: /QuakeML \(Seismology\)/ }));
  await waitFor(() => expect(exportRequests).toHaveLength(2));
  expect(exportRequests[1].get('format')).toBe('quakeml');
  expect(exportRequests[1].get('decluster')).toBe('gardner-knopoff');
});
