/**
 * The upload schema step (components/upload/EnhancedSchemaMapper.tsx), rendered with the
 * per-file results the upload page passes it. Only fetch (Settings and templates) is
 * stubbed; the parser output is real.
 *
 *  - #32/#43/#50: the mapper starts from the parser's own resolution and reports only
 *    explicit changes, so an untouched schema step changes nothing that is stored;
 *    every file's columns are listed.
 *  - #44: named magnitude columns are not forced onto `magnitude`, and each row shows
 *    the mapping that will actually be stored (Ms is not the RMS residual).
 *  - gc#1: Settings rules are explicit matches, whatever their priority or the slider.
 *  - gc#2: a malformed saved rule cannot stall the step.
 *  - gc#4: each file's own format tab applies; strict validation is honoured.
 */
import '@testing-library/jest-dom';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnhancedSchemaMapper } from '@/components/upload/EnhancedSchemaMapper';
import { parseCSV, parseJSON } from '@/lib/parsers';

function fileResult(fileName: string, format: string, parsed: ReturnType<typeof parseCSV>) {
  return {
    fileName,
    format,
    fields: parsed.detectedFields,
    resolvedFieldSources: parsed.resolvedFieldSources,
    previewEvents: parsed.events.slice(0, 5),
    eventCount: parsed.events.length,
  };
}

/** A minimal fetch Response (jsdom has no Response global). */
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

function stubFetch(settings: unknown | null, templates: unknown[] = []) {
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/api/settings/field-mappings')) {
      return settings === null ? reply({ error: 'none' }, 404) : reply(settings);
    }
    return reply(templates);
  }) as unknown as typeof fetch;
}

async function renderMapper(validationResults: unknown[], settings: unknown | null = null) {
  stubFetch(settings);
  const onSchemaReady = jest.fn();
  const onMappingsChange = jest.fn();
  render(
    <EnhancedSchemaMapper
      validationResults={validationResults}
      isProcessing={false}
      onSchemaReady={onSchemaReady}
      onMappingsChange={onMappingsChange}
    />,
  );
  await screen.findByText('Schema Mapping Configuration', undefined, { timeout: 3000 });
  await waitFor(() => expect(onMappingsChange).toHaveBeenCalled());
  const lastMappings = () => onMappingsChange.mock.calls[onMappingsChange.mock.calls.length - 1][0];
  const lastReady = () => onSchemaReady.mock.calls[onSchemaReady.mock.calls.length - 1][0];
  return { onSchemaReady, onMappingsChange, lastMappings, lastReady };
}

const mappingButton = (column: string) => screen.getByRole('combobox', { name: `Mapping for ${column}` });

afterEach(() => cleanup());

describe('the parser resolution is shown and left alone', () => {
  const magnitudeCsv = parseCSV(
    'eventid,time,latitude,longitude,depth,mw,mb,ms,rms,ml\ne1,2024-01-01T00:00:00Z,-41,174,10,9.1,7.2,8.8,0.4,6.9',
    ',',
    'International',
  );

  it('reports no explicit change for an untouched upload and is ready', async () => {
    const { lastMappings, lastReady } = await renderMapper([fileResult('m.csv', 'CSV', magnitudeCsv)]);
    expect(lastMappings()).toEqual({});
    expect(lastReady()).toBe(true);
  });

  it('shows what will be stored for each magnitude column (#44)', async () => {
    await renderMapper([fileResult('m.csv', 'CSV', magnitudeCsv)]);
    expect(mappingButton('mw')).toHaveTextContent('Magnitude (Mw)');
    expect(mappingButton('ms')).toHaveTextContent('Do not map');       // not the RMS residual
    expect(mappingButton('mb')).toHaveTextContent('Do not map');       // not forced onto magnitude
    expect(mappingButton('ml')).toHaveTextContent('Alternative magnitude (ML)');
    expect(mappingButton('rms')).toHaveTextContent('Standard Error');
  });

  it("lists the columns of every file, not just the first (#50)", async () => {
    const second = parseCSV('time,latitude,longitude,mag,err_h\n2024-01-01T00:00:00Z,-41,174,4,1.5', ',', 'International');
    await renderMapper([fileResult('m.csv', 'CSV', magnitudeCsv), fileResult('b.csv', 'CSV', second)]);
    expect(mappingButton('err_h')).toHaveTextContent('Do not map');
    expect(mappingButton('mag')).toHaveTextContent('Magnitude');
  });

  it('offers a similarity guess without applying it (#33)', async () => {
    const parsed = parseCSV('time,latitude,longitude,mag,hypo_depth\n2024-01-01T00:00:00Z,-41,174,4,12', ',', 'International');
    const { lastMappings } = await renderMapper([fileResult('h.csv', 'CSV', parsed)]);
    expect(lastMappings()).toEqual({});
    await userEvent.click(screen.getByRole('button', { name: /Suggested: Depth/ }));
    await waitFor(() => expect(lastMappings()).toEqual({ hypo_depth: 'depth' }));
  });
});

describe('Settings rules (gc#1, gc#2, gc#4)', () => {
  const config = (overrides: Record<string, unknown>) => ({
    autoDetectEnabled: true,
    strictValidation: false,
    fuzzyMatchThreshold: 0.95,
    formats: {
      csv: { enabled: true, mappings: [] },
      json: { enabled: true, mappings: [] },
      quakeml: { enabled: true, mappings: [] },
      geojson: { enabled: true, mappings: [] },
    },
    customMappings: [],
    ...overrides,
  });

  it('applies a low-priority explicit rule at a strict threshold', async () => {
    const parsed = parseCSV('time,latitude,longitude,mag,profondeur\n2024-01-01T00:00:00Z,-41,174,4,12', ',', 'International');
    const { lastMappings } = await renderMapper(
      [fileResult('p.csv', 'CSV', parsed)],
      config({ customMappings: [{ id: 'r', sourcePattern: 'profondeur', targetField: 'depth', isRegex: false, priority: 5 }] }),
    );
    await waitFor(() => expect(lastMappings()).toEqual({ profondeur: 'depth' }));
  });

  it("uses the file's own format tab", async () => {
    const parsed = parseJSON(JSON.stringify([{ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, mag: 3, sitecode: 'WEL' }]));
    const { lastMappings } = await renderMapper(
      [fileResult('s.json', 'JSON', parsed)],
      config({
        formats: {
          csv: { enabled: true, mappings: [{ id: 'c', sourcePattern: 'sitecode', targetField: 'region', isRegex: false, priority: 90 }] },
          json: { enabled: true, mappings: [{ id: 'j', sourcePattern: 'sitecode', targetField: 'agency_id', isRegex: false, priority: 90 }] },
          quakeml: { enabled: true, mappings: [] },
          geojson: { enabled: true, mappings: [] },
        },
      }),
    );
    await waitFor(() => expect(lastMappings()).toEqual({ sitecode: 'agency_id' }));
  });

  it('a malformed saved rule does not stall the step', async () => {
    const parsed = parseCSV('time,latitude,longitude,mag\n2024-01-01T00:00:00Z,-41,174,4', ',', 'International');
    const { lastReady } = await renderMapper(
      [fileResult('a.csv', 'CSV', parsed)],
      config({ customMappings: [{ id: 'broken', targetField: 'magnitude', priority: '90' }] }),
    );
    expect(lastReady()).toBe(true);
  });

  it('strict validation requires an event ID column; lenient mode only notes its absence', async () => {
    const parsed = parseCSV('time,latitude,longitude,mag\n2024-01-01T00:00:00Z,-41,174,4', ',', 'International');
    const strict = await renderMapper([fileResult('a.csv', 'CSV', parsed)], config({ strictValidation: true }));
    await waitFor(() => expect(strict.lastReady()).toBe(false));
    cleanup();

    const lenient = await renderMapper([fileResult('a.csv', 'CSV', parsed)], config({ strictValidation: false }));
    expect(lenient.lastReady()).toBe(true);
    expect(screen.getByText(/No event ID column is mapped/)).toBeInTheDocument();
  });
});

describe('explicit edits', () => {
  it('a template entry becomes an explicit change for columns this upload has', async () => {
    const parsed = parseCSV('eventid,time,latitude,longitude,mag,herr\ne1,2024-01-01T00:00:00Z,-41,174,4,2.5', ',', 'International');
    stubFetch(null, [{
      id: 't1', name: 'No herr', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      mappings: [{ sourceField: 'herr', targetField: '' }, { sourceField: 'absent', targetField: 'depth' }],
    }]);
    const onMappingsChange = jest.fn();
    render(
      <EnhancedSchemaMapper
        validationResults={[fileResult('a.csv', 'CSV', parsed)]}
        isProcessing={false}
        onSchemaReady={jest.fn()}
        onMappingsChange={onMappingsChange}
      />,
    );
    await screen.findByText('Schema Mapping Configuration', undefined, { timeout: 3000 });
    await userEvent.click(screen.getByRole('button', { name: /Load Template/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load' }));
    await waitFor(() => {
      const last = onMappingsChange.mock.calls[onMappingsChange.mock.calls.length - 1][0];
      expect(last).toEqual({ herr: '' });
    });
    await act(async () => { /* settle */ });
    expect(mappingButton('herr')).toHaveTextContent('Do not map');
  });
});

describe('returning to the step', () => {
  it('keeps the explicit changes reported before the tab was left', async () => {
    const parsed = parseCSV('eventid,time,latitude,longitude,mag,herr\ne1,2024-01-01T00:00:00Z,-41,174,4,2.5', ',', 'International');
    stubFetch(null);
    const onMappingsChange = jest.fn();
    render(
      <EnhancedSchemaMapper
        validationResults={[fileResult('a.csv', 'CSV', parsed)]}
        isProcessing={false}
        onSchemaReady={jest.fn()}
        onMappingsChange={onMappingsChange}
        initialMappings={{ herr: '' }}
      />,
    );
    await screen.findByText('Schema Mapping Configuration', undefined, { timeout: 3000 });
    await waitFor(() => expect(onMappingsChange).toHaveBeenLastCalledWith({ herr: '' }));
    expect(mappingButton('herr')).toHaveTextContent('Do not map');
  });
});
