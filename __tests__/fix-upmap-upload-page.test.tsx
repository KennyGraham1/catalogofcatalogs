/**
 * The upload page (app/upload/page.tsx) driven through a whole upload: files are added,
 * uploaded, mapped and turned into a catalogue. Only the network (fetch), auth, the
 * router and the client cache hook are stubbed; the page, the mapper and the upload
 * components are real.
 *
 *  - #45/#127: pending tokens belong to one upload run, one per file (even when two
 *    files share a name), and are sent as a manifest in file order with each file's
 *    expected count; a new run or a changed file list discards the old tokens.
 *  - #49/C15: the catalogue is created from the pending uploads; no events are posted.
 *  - #47: the page reports what the server stored, not what the browser parsed.
 *  - C5: catalogue caches are invalidated after the catalogue is created.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'editor' }, isAuthenticated: true, isLoading: false }),
}));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }));
const invalidateCatalogueData = jest.fn();
jest.mock('@/lib/client-cache', () => ({ invalidateCatalogueData: () => invalidateCatalogueData() }));

import UploadPage from '@/app/upload/page';

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

/** The bounded body /api/upload returns for a parsed file (see app/api/upload/route.ts). */
function uploadResponse(fileName: string, token: string, eventCount: number) {
  const previewEvents = Array.from({ length: Math.min(eventCount, 3) }, (_, i) => ({
    eventid: `${token}-${i}`, time: `2024-01-0${i + 1}T00:00:00.000Z`, latitude: -41 - i * 0.1, longitude: 174, magnitude: 3 + i * 0.1, mag: String(3 + i * 0.1),
  }));
  return {
    fileName,
    fileSize: 100,
    format: 'CSV',
    success: true,
    eventCount,
    errors: [],
    errorCount: 0,
    warnings: [],
    detectedFields: ['eventid', 'time', 'latitude', 'longitude', 'mag'],
    resolvedFieldSources: { id: 'eventid', time: 'time', latitude: 'latitude', longitude: 'longitude', magnitude: 'mag' },
    fileDecisions: { dateFormat: 'International', depthUnit: 'km' },
    validationReport: { generatedAt: '2024-01-01T00:00:00Z', summary: { totalEvents: eventCount, validEvents: eventCount, invalidEvents: 0, failureCount: 0, errorCount: 0, warningCount: 0, infoCount: 0, byCategory: {}, byField: {} }, failures: [] },
    previewEvents,
    previewIndices: previewEvents.map((_, i) => i),
    previewTruncated: eventCount > previewEvents.length,
    pendingUploadId: token,
  };
}

interface Harness {
  catalogueBodies: any[];
  uploadCounts: number[];
}

function stubNetwork(uploadCounts: number[]): Harness {
  const harness: Harness = { catalogueBodies: [], uploadCounts };
  let uploads = 0;
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    if (href === '/api/upload') {
      const form = init?.body as FormData;
      const file = form.get('file') as File;
      const count = uploadCounts[uploads % uploadCounts.length];
      uploads += 1;
      return reply(uploadResponse(file.name, `tok-${uploads}`, count));
    }
    if (href === '/api/catalogues') {
      const body = JSON.parse(String(init?.body));
      harness.catalogueBodies.push(body);
      const submitted = body.pendingUploads.reduce((sum: number, entry: any) => sum + entry.expectedCount, 0);
      return reply({
        id: 'cat-new',
        name: body.name,
        event_count: submitted - 1,
        validationReport: { totalSubmitted: submitted, successfullyImported: submitted - 1, failedValidation: 0, duplicatesSkipped: 1, successRate: 90 },
        importMessage: `Imported ${submitted - 1} of ${submitted} events. 1 duplicate event skipped.`,
        partialImport: true,
      }, 201);
    }
    if (href.includes('/api/settings/field-mappings')) return reply({ error: 'none' }, 404);
    return reply([]);
  }) as unknown as typeof fetch;
  return harness;
}

const addFiles = (files: File[]) => {
  fireEvent.change(screen.getByLabelText('File input for catalogue upload'), { target: { files } });
};

const csv = (name: string) => new File(['eventid,time,latitude,longitude,mag\n'], name, { type: 'text/csv' });

async function uploadAndCreate(name: string) {
  await userEvent.click(screen.getByRole('button', { name: /Upload and Validate|Retry Upload/ }));
  const continueButton = await screen.findByRole('button', { name: 'Continue to Metadata' }, { timeout: 5000 });
  await waitFor(() => expect(continueButton).toBeEnabled(), { timeout: 5000 });
  await userEvent.click(continueButton);
  await userEvent.type(await screen.findByLabelText('Name *'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Process Catalogue' }));
}

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

it('creates the catalogue from a per-file manifest, even for files that share a name', async () => {
  const harness = stubNetwork([2, 1]);
  render(<UploadPage />);
  addFiles([csv('query.csv'), csv('query.csv')]);

  await uploadAndCreate('Two exports');

  await waitFor(() => expect(harness.catalogueBodies).toHaveLength(1), { timeout: 5000 });
  const [body] = harness.catalogueBodies;
  expect(body.events).toBeUndefined();
  expect(body.pendingUploadIds).toBeUndefined();
  expect(body.fieldMappings).toBeUndefined();
  expect(body.pendingUploads.map((entry: any) => [entry.id, entry.expectedCount, entry.fileName]))
    .toEqual([['tok-1', 2, 'query.csv'], ['tok-2', 1, 'query.csv']]);
  expect(body.pendingUploads[0].fileDecisions).toEqual({ dateFormat: 'International', depthUnit: 'km' });
  // Nothing was re-mapped, so no file carries mapping changes.
  expect(body.pendingUploads.every((entry: any) => entry.mapping === undefined)).toBe(true);

  // The server's account, not the browser's parse, is what the user is told.
  expect(await screen.findByText('Imported 2 of 3 events. 1 duplicate event skipped.')).toBeInTheDocument();
  expect(invalidateCatalogueData).toHaveBeenCalled();
}, 20000);

it('a new upload run replaces the tokens of the previous one', async () => {
  const harness = stubNetwork([1]);
  render(<UploadPage />);
  addFiles([csv('a.csv'), csv('b.csv')]);
  await userEvent.click(screen.getByRole('button', { name: 'Upload and Validate' }));
  await screen.findByRole('button', { name: 'Continue to Metadata' }, { timeout: 5000 });

  // Changing the file list discards the finished run: its tokens can never be sent.
  await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
  await userEvent.click(screen.getByRole('button', { name: 'Remove a.csv' }));
  // The finished run is gone with its results (the validation summary lists files).
  expect(screen.queryByText('a.csv')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Upload and Validate' })).toBeEnabled();

  await uploadAndCreate('Only b');

  await waitFor(() => expect(harness.catalogueBodies).toHaveLength(1), { timeout: 5000 });
  expect(harness.catalogueBodies[0].pendingUploads.map((entry: any) => [entry.id, entry.fileName]))
    .toEqual([['tok-3', 'b.csv']]);
}, 20000);
