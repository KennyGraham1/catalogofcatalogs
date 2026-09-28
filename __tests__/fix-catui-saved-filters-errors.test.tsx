/**
 * FEATURE (H2b brief): "saved-filter UI handles 404/ownership responses cleanly". Before this
 * fix, every /api/saved-filters failure (already-deleted filter, not logged in, no
 * permission, ...) surfaced as the same generic "Failed to save/delete/fetch filter" toast -
 * indistinguishable from a network error worth retrying. describeSavedFilterError (added to
 * components/catalogues/SavedFiltersDialog.tsx) turns 404/401/403 into a specific message,
 * and a 404 on delete is treated as a soft success (the row the user wanted gone is gone)
 * rather than a hard failure.
 */
import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { SavedFiltersDialog } from '@/components/catalogues/SavedFiltersDialog';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const originalFetch = global.fetch;
afterEach(() => {
  cleanup();
  mockToast.mockClear();
  (global as any).fetch = originalFetch;
});

const oneFilter = [{
  id: 'f1', name: 'My filter', description: null,
  filter_config: '{"minMagnitude":4}', created_at: '2024-01-01', updated_at: '2024-01-01',
}];

async function openDialog(currentFilters: unknown = { minMagnitude: 4 }) {
  render(<SavedFiltersDialog currentFilters={currentFilters} onLoadFilter={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /^Saved Filters$/i }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/saved-filters'));
}

describe('SavedFiltersDialog: delete handles 404 (already gone) as a soft success', () => {
  it('shows an "already deleted" toast, closes the confirm dialog and refreshes the list - not a hard failure', async () => {
    let listCalls = 0;
    (global as any).fetch = jest.fn((url: string, init?: any) => {
      if (url === '/api/saved-filters') { listCalls += 1; return Promise.resolve(jsonResponse(oneFilter)); }
      if (url === '/api/saved-filters/f1' && init?.method === 'DELETE') {
        return Promise.resolve(jsonResponse({ error: 'Saved filter not found' }, 404));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await openDialog();
    await screen.findByText('My filter');

    fireEvent.click(screen.getByRole('button', { name: 'Delete filter: My filter' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Already deleted',
      description: 'That saved filter no longer exists. It may already have been deleted.',
    })));
    // No "variant: destructive" - this is not presented as a failure.
    expect(mockToast.mock.calls[0][0].variant).not.toBe('destructive');
    // The confirm dialog closes and the list is refetched rather than left showing a
    // filter that the server says no longer exists.
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBe(2));
  });
});

describe('SavedFiltersDialog: ownership/auth errors get a specific message, not a generic failure', () => {
  it('DELETE 403 (not the owner) is reported as a permission error', async () => {
    (global as any).fetch = jest.fn((url: string, init?: any) => {
      if (url === '/api/saved-filters') return Promise.resolve(jsonResponse(oneFilter));
      if (url === '/api/saved-filters/f1' && init?.method === 'DELETE') {
        return Promise.resolve(jsonResponse({ error: 'Forbidden' }, 403));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await openDialog();
    await screen.findByText('My filter');
    fireEvent.click(screen.getByRole('button', { name: 'Delete filter: My filter' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Error',
      description: "You don't have permission to manage this saved filter.",
      variant: 'destructive',
    })));
  });

  it('POST (save) 401 (not logged in) tells the user to log in, not "Failed to save filter"', async () => {
    (global as any).fetch = jest.fn((url: string, init?: any) => {
      if (url === '/api/saved-filters' && (!init || init.method === undefined)) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url === '/api/saved-filters' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ error: 'Unauthorized' }, 401));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await openDialog();
    fireEvent.click(await screen.findByRole('button', { name: /Save Current Filters/i }));
    fireEvent.change(screen.getByLabelText(/Filter Name/i), { target: { value: 'New filter' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save Filter$/i }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Error',
      description: 'Log in to manage saved filters.',
      variant: 'destructive',
    })));
  });
});

describe('SavedFiltersDialog: falls back to the server-provided message for other errors', () => {
  it('surfaces the API error body rather than a generic "Failed to load" message', async () => {
    (global as any).fetch = jest.fn(() => Promise.resolve(jsonResponse({ error: 'Database not available' }, 500)));

    render(<SavedFiltersDialog currentFilters={{}} onLoadFilter={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Saved Filters$/i }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Error',
      description: 'Database not available',
      variant: 'destructive',
    })));
  });
});
