/**
 * A map whose events request is refused for want of a session (HTTP 401) must say so and
 * offer a way to sign in. It showed "Failed to load … (HTTP 401)" over an empty map, which
 * read as a broken map (the catalogue list is public; its events need an account).
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'cat-1' }) }));
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => function MapStub() { return <div data-testid="event-map" />; } }));

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function serve(eventsStatus: number) {
  const catalogue = { id: 'cat-1', name: 'Test catalogue', event_count: 3, status: 'complete', created_at: '2024-01-01T00:00:00Z' };
  global.fetch = jest.fn(async (input: any) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return { ok: true, status: 200, json: async () => [catalogue] } as unknown as Response;
    return { ok: eventsStatus < 400, status: eventsStatus, json: async () => ({ error: 'Authentication required' }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

it('asks the user to log in, returning to this map, when events need a session', async () => {
  serve(401);
  const { default: CatalogueMapPage } = await import('@/app/catalogues/[id]/map/page');
  render(<CatalogueMapPage />);
  expect(await screen.findByText(/Sign in to view this catalogue's events\./)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fcatalogues%2Fcat-1%2Fmap');
  expect(screen.queryByText(/HTTP 401/)).toBeNull();
});

it('keeps the retry for other failures', async () => {
  serve(500);
  const { default: CatalogueMapPage } = await import('@/app/catalogues/[id]/map/page');
  render(<CatalogueMapPage />);
  expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry loading events' })).toBeInTheDocument();
});
