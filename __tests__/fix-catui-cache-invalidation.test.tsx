/**
 * C5: "every UI flow that creates, modifies or deletes catalogues calls
 * invalidateCatalogueData() on success: ... catalogue delete/edit (H2b)". Without this, the
 * catalogue list (useCatalogues/CatalogueContext) and the detail/edit pages (useCachedFetch,
 * a separate module-level cache) each keep their own stale copy of /api/catalogues* for their
 * TTL after a delete or a metadata edit elsewhere.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

jest.mock('@/lib/client-cache', () => ({ invalidateCatalogueData: jest.fn() }));

jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' }, isLoading: false }),
  usePermission: () => true,
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cat-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));

// The factory below runs ONCE, when the module is first required, and its return value's
// useCatalogues closes over the SAME `catalogues` array / jest.fn()s on every call. Building
// them fresh *inside* useCatalogues instead (a natural first instinct) hands
// app/catalogues/page.tsx a new `contextCatalogues` array reference on every render; its
// useEffect syncing that into local state then never sees a stable dependency and loops
// forever. Not a bug in the page - purely a test-mock hazard, worth the warning for the next
// person who mocks this context.
jest.mock('@/contexts/CatalogueContext', () => {
  const catalogues = [{ id: 'cat-1', name: 'Doomed catalogue', event_count: 3, status: 'complete', created_at: '2024-01-01T00:00:00Z', source_catalogues: '[]', merge_config: '' }];
  const refreshCatalogues = jest.fn();
  const invalidateCache = jest.fn();
  return {
    // Only app/catalogues/page.tsx (the list) reads this; app/catalogues/[id]/edit/page.tsx
    // does not import CatalogueContext at all, so this has no effect on that page's test.
    useCatalogues: () => ({ catalogues, loading: false, refreshCatalogues, invalidateCache }),
  };
});

const DELETE_TARGET = { id: 'cat-1', name: 'Doomed catalogue' };

// Radix DropdownMenu and AlertDialog only render/open their content after real pointer
// interaction and focus-trap machinery that jsdom does not fully support; render both as
// plain elements (AlertDialog still gated on `open`) so the real confirmDelete handler - what
// C5 is actually testing - still runs from a real click (same pattern as dropdown-menu in
// __tests__/fix-merge-ui-page.test.tsx).
jest.mock('@/components/ui/dropdown-menu', () => {
  const react: typeof React = require('react');
  const passthrough = (props: any) => react.createElement('div', null, props.children);
  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuItem: (props: any) => react.createElement('button', { onClick: props.onClick, disabled: props.disabled }, props.children),
  };
});

jest.mock('@/components/ui/alert-dialog', () => {
  const react: typeof React = require('react');
  const passthrough = (props: any) => react.createElement('div', null, props.children);
  return {
    // role="alertdialog" (what the real Radix primitive renders) lets tests scope a query to
    // the confirm dialog's own "Delete" button, distinct from the dropdown menu item behind
    // it - the mocked DropdownMenuContent below has no open/close state, so unlike the real
    // app both stay in the DOM at once.
    AlertDialog: (props: any) => (props.open ? react.createElement('div', { role: 'alertdialog' }, props.children) : null),
    AlertDialogContent: passthrough,
    AlertDialogHeader: passthrough,
    AlertDialogFooter: passthrough,
    AlertDialogTitle: passthrough,
    AlertDialogDescription: passthrough,
    AlertDialogCancel: (props: any) => react.createElement('button', { onClick: props.onClick }, props.children),
    AlertDialogAction: (props: any) => react.createElement('button', { onClick: props.onClick, disabled: props.disabled }, props.children),
  };
});

import CataloguesPage from '@/app/catalogues/page';
import EditCataloguePage from '@/app/catalogues/[id]/edit/page';
import { invalidateCatalogueData } from '@/lib/client-cache';

const mockInvalidate = invalidateCatalogueData as jest.Mock;

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const originalFetch = global.fetch;
afterEach(() => {
  cleanup();
  mockInvalidate.mockClear();
  (global as any).fetch = originalFetch;
});

describe('catalogue delete calls invalidateCatalogueData() (C5)', () => {
  it('after a successful DELETE, invalidateCatalogueData is called', async () => {
    (global as any).fetch = jest.fn((url: string, init?: any) => {
      if (url === `/api/catalogues/${DELETE_TARGET.id}` && init?.method === 'DELETE') {
        return Promise.resolve(jsonResponse({ success: true }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<CataloguesPage />);
    await screen.findByText('Doomed catalogue');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(`/api/catalogues/${DELETE_TARGET.id}`, expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('catalogue metadata edit calls invalidateCatalogueData() (C5)', () => {
  it('after a successful PATCH, invalidateCatalogueData is called before navigating away', async () => {
    const catalogue = { id: 'cat-1', name: 'Editable catalogue', event_count: 3, status: 'complete', created_at: '2024-01-01T00:00:00Z' };
    (global as any).fetch = jest.fn((url: string, init?: any) => {
      if (url === '/api/catalogues/cat-1' && (!init || init.method === undefined)) return Promise.resolve(jsonResponse(catalogue));
      if (url === '/api/catalogues/cat-1' && init?.method === 'PATCH') return Promise.resolve(jsonResponse({ ...catalogue, name: 'Renamed catalogue' }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<EditCataloguePage />);
    await screen.findByDisplayValue('Editable catalogue');
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/catalogues/cat-1', expect.objectContaining({ method: 'PATCH' }));
  });
});
