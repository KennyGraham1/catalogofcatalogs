/**
 * #115: the role-request review page showed only the role recorded when the request
 * was filed, so a reviewer saw 'VIEWER -> ADMIN' for a user who had since been demoted
 * to GUEST. It must show the account's live role and not offer Approve for a request
 * that no longer matches the account.
 */

import { render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { id: 'admin1', role: 'admin' }, isAuthenticated: true, isLoading: false }),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

import AdminRoleRequestsPage from '@/app/admin/role-requests/page';

function request(id: string, userName: string, extra: Record<string, unknown>) {
  return {
    id, user_id: `id-${userName}`, user_email: `${userName}@example.test`, user_name: userName,
    current_role: 'viewer', requested_role: 'admin', justification: 'Needs access', status: 'pending',
    admin_notes: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    reviewed_at: null, reviewed_by: null, reviewed_by_name: null, ...extra,
  };
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      requests: [
        request('rr-ok', 'current', { live_role: 'viewer', live_is_active: true }),
        request('rr-stale', 'demoted', { live_role: 'guest', live_is_active: true }),
        request('rr-off', 'disabled', { live_role: 'viewer', live_is_active: false }),
      ],
    }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function row(userName: string) {
  return screen.getByText(`${userName}@example.test`).closest('tr') as HTMLElement;
}

it('shows the live role and withholds Approve from requests that no longer match the account', async () => {
  render(<AdminRoleRequestsPage />);
  await waitFor(() => expect(screen.getByText('demoted@example.test')).toBeInTheDocument());

  const current = row('current');
  expect(within(current).getByRole('button', { name: 'Approve' })).toBeEnabled();

  const stale = row('demoted');
  expect(within(stale).getByText('GUEST')).toBeInTheDocument();
  expect(within(stale).getByText(/was VIEWER/i)).toBeInTheDocument();
  expect(within(stale).getByRole('button', { name: 'Approve' })).toBeDisabled();
  expect(within(stale).getByRole('button', { name: 'Reject' })).toBeEnabled();

  const disabled = row('disabled');
  expect(within(disabled).getByText(/deactivated/i)).toBeInTheDocument();
  expect(within(disabled).getByRole('button', { name: 'Approve' })).toBeDisabled();
});
