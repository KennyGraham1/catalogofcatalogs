/**
 * A2 item 7b: the real CatalogueProvider exposes its auto-refresh interval, so the
 * dashboard can state the cadence it actually refreshes at. Only fetch is stubbed.
 */
import '@testing-library/jest-dom';
import { act, cleanup, render, screen } from '@testing-library/react';
import { CatalogueProvider, useCatalogues } from '@/contexts/CatalogueContext';

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as any;
});
afterEach(() => { cleanup(); global.fetch = originalFetch; });

function Probe() {
  const { autoRefreshInterval } = useCatalogues();
  return <p data-testid="interval">{String(autoRefreshInterval)}</p>;
}

it('is 6 h by default', async () => {
  await act(async () => { render(<CatalogueProvider><Probe /></CatalogueProvider>); });
  expect(screen.getByTestId('interval')).toHaveTextContent('21600000');
});

it('is whatever the provider was given, 0 for off', async () => {
  await act(async () => { render(<CatalogueProvider autoRefreshInterval={0}><Probe /></CatalogueProvider>); });
  expect(screen.getByTestId('interval')).toHaveTextContent(/^0$/);
});
