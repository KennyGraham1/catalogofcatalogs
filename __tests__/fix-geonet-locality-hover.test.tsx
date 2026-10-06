/**
 * GeoNet's locality on the maps: the marker layer shows the hover card at once with the
 * platform's own title, asks GeoNet for a GeoNet event's locality in parallel, and retitles
 * the card if it is still open when GeoNet answers; it never asks for other events. Once
 * GeoNet text has been shown the map attribution credits GeoNet. The click popup shows the
 * locality when the hover has fetched it, and never asks GeoNet itself. fetch is mocked.
 */
import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';

const markerRender = jest.fn();
const mockAttribution = { addAttribution: jest.fn(), removeAttribution: jest.fn() };
const mockMap = {
  getSize: () => ({ x: 800, y: 600 }),
  getZoom: () => 5,
  getBounds: () => ({
    getNorth: () => -30, getSouth: () => -50, getWest: () => 160, getEast: () => 190,
    getCenter: () => ({ lat: -40, lng: 175 }),
  }),
  on: jest.fn(),
  off: jest.fn(),
  attributionControl: mockAttribution,
};
jest.mock('react-leaflet', () => ({
  useMap: () => mockMap,
  CircleMarker: (props: any) => { markerRender(props); return null; },
}));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.78 }) }));

import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { OptimizedEventPopup } from '@/components/map/OptimizedEventPopup';
import { buildEventCardHtml, type EventCardOptions } from '@/lib/map-event-card';
import { GEONET_LOCALITY_ATTRIBUTION, fetchGeoNetLocality, resetGeoNetLocalityForTests } from '@/lib/geonet-locality';

const LOCALITY = '15 km north-east of Culverden';
const GEONET_EVENT = {
  id: 'kaikoura', time: '2016-11-13T11:02:56Z', latitude: -42.69, longitude: 173.02, depth: 15,
  magnitude: 7.8, magnitude_type: 'Mw', region: 'South Island, New Zealand',
  source_id: '2016p858000', event_public_id: 'smi:nz.org.geonet/2016p858000', catalogue: 'GeoNet - Automated Import',
};
// A look-alike id from a catalogue nothing says is GeoNet's, and an ordinary ISC row.
const LOOK_ALIKE = { ...GEONET_EVENT, id: 'campaign', latitude: -41.5, magnitude: 3.1, source_id: '2016p858001', event_public_id: null, catalogue: 'Canterbury campaign' };
const ISC_EVENT = { ...GEONET_EVENT, id: 'isc', latitude: -40.5, magnitude: 4.4, source_id: '626000001', event_public_id: 'smi:ISC/evid=626000001', catalogue: 'ISC Bulletin' };
type CardEvent = typeof GEONET_EVENT | typeof LOOK_ALIKE | typeof ISC_EVENT;

interface FakeLayer {
  setStyle: jest.Mock; bringToFront: jest.Mock;
  bindTooltip: jest.Mock; openTooltip: jest.Mock; unbindTooltip: jest.Mock; setTooltipContent: jest.Mock;
  getTooltip: () => { content: string; open: boolean } | undefined;
  isTooltipOpen: () => boolean;
  content: () => string | undefined;
}

/** A Leaflet layer double with a real-ish tooltip (bound, opened, retitled, unbound). */
function fakeLayer(): FakeLayer {
  let tooltip: { content: string; open: boolean } | undefined;
  const layer: FakeLayer = {
    setStyle: jest.fn(),
    bringToFront: jest.fn(),
    bindTooltip: jest.fn((content: string) => { tooltip = { content, open: false }; return layer; }),
    openTooltip: jest.fn(() => { if (tooltip) tooltip.open = true; return layer; }),
    unbindTooltip: jest.fn(() => { tooltip = undefined; return layer; }),
    getTooltip: () => tooltip,
    isTooltipOpen: () => Boolean(tooltip?.open),
    setTooltipContent: jest.fn((content: string) => { if (tooltip) tooltip.content = content; return layer; }),
    content: () => tooltip?.content,
  };
  return layer;
}

const titleOf = (html: string | undefined) => /<div class="eq-card-title">(.*?)<\/div>/.exec(html ?? '')?.[1];
const hoverCard = (event: CardEvent, options: EventCardOptions) => buildEventCardHtml(event, [], options);

/** The latest event handlers of the marker drawn for an event. */
function handlersFor(event: CardEvent) {
  const calls = markerRender.mock.calls.filter(([props]) => props.center[0] === event.latitude);
  return calls[calls.length - 1][0].eventHandlers;
}

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
let answerGeoNet: () => void;
beforeEach(() => {
  markerRender.mockClear();
  mockAttribution.addAttribution.mockClear();
  mockAttribution.removeAttribution.mockClear();
  resetGeoNetLocalityForTests();
  fetchMock = jest.fn((url: string) => new Promise((resolve) => {
    answerGeoNet = () => resolve({
      ok: true, status: 200,
      json: async () => ({ type: 'FeatureCollection', features: [{ properties: { publicID: String(url).split('/').pop(), locality: LOCALITY } }] }),
    });
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  resetGeoNetLocalityForTests();
});

const renderLayer = () => render(
  <EarthquakeMarkerLayer events={[GEONET_EVENT, LOOK_ALIKE, ISC_EVENT]} getColor={() => '#FCA636'} isDark={false} onEventClick={jest.fn()} hoverCard={hoverCard} />
);

describe('the marker layer and GeoNet localities', () => {
  it('shows the card at once, then retitles the open card with GeoNet\'s locality and credits GeoNet', async () => {
    renderLayer();
    const layer = fakeLayer();
    act(() => { handlersFor(GEONET_EVENT).mouseover({ target: layer }); });
    // Immediately: the platform's own title (no Gazetteer places here, so the region).
    expect(layer.bindTooltip).toHaveBeenCalledTimes(1);
    expect(layer.openTooltip).toHaveBeenCalled();
    expect(titleOf(layer.content())).toBe('South Island, New Zealand');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.geonet.org.nz/quake/2016p858000');
    expect(mockAttribution.addAttribution).not.toHaveBeenCalledWith(GEONET_LOCALITY_ATTRIBUTION);

    await act(async () => { answerGeoNet(); });
    await waitFor(() => expect(layer.setTooltipContent).toHaveBeenCalledTimes(1));
    expect(titleOf(layer.content())).toBe(`${LOCALITY}<span class="eq-card-credit eq-card-muted">Locality: GeoNet</span>`);
    await waitFor(() => expect(mockAttribution.addAttribution).toHaveBeenCalledWith(GEONET_LOCALITY_ATTRIBUTION));

    // Later hovers read the cache synchronously: GeoNet's title at once, no new request.
    act(() => { handlersFor(GEONET_EVENT).mouseout({ target: layer }); });
    act(() => { handlersFor(GEONET_EVENT).mouseover({ target: layer }); });
    expect(titleOf(layer.content())).toContain(LOCALITY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves a card that closed before GeoNet answered alone, and uses the answer next time', async () => {
    renderLayer();
    const layer = fakeLayer();
    act(() => { handlersFor(GEONET_EVENT).mouseover({ target: layer }); });
    act(() => { handlersFor(GEONET_EVENT).mouseout({ target: layer }); });
    await act(async () => { answerGeoNet(); });
    await act(async () => { await fetchGeoNetLocality('2016p858000'); });
    expect(layer.setTooltipContent).not.toHaveBeenCalled();
    act(() => { handlersFor(GEONET_EVENT).mouseover({ target: layer }); });
    expect(titleOf(layer.content())).toContain(LOCALITY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never asks GeoNet about other events, look-alike ids included', async () => {
    renderLayer();
    for (const event of [LOOK_ALIKE, ISC_EVENT]) {
      const layer = fakeLayer();
      act(() => { handlersFor(event).mouseover({ target: layer }); });
      expect(layer.bindTooltip).toHaveBeenCalledTimes(1);
      expect(titleOf(layer.content())).toBe('South Island, New Zealand');
      act(() => { handlersFor(event).mouseout({ target: layer }); });
    }
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockAttribution.addAttribution).not.toHaveBeenCalledWith(GEONET_LOCALITY_ATTRIBUTION);
  });

  it('asks nothing while drawing: requests happen only on hover', async () => {
    renderLayer();
    await act(async () => {});
    expect(markerRender).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the click popup and GeoNet localities', () => {
  it('shows GeoNet\'s locality, credited, once the hover has fetched it, and never asks GeoNet itself', async () => {
    // Nothing asked yet: no locality row, and the popup sends nothing.
    const first = render(<OptimizedEventPopup event={GEONET_EVENT} />);
    await act(async () => {});
    expect(screen.queryByText('Locality')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    first.unmount();

    // The hover asked; the popup opened by the click joins that request and shows its answer.
    let asked!: Promise<string | null>;
    act(() => { asked = fetchGeoNetLocality('2016p858000'); });
    const second = render(<OptimizedEventPopup event={GEONET_EVENT} />);
    expect(screen.queryByText('Locality')).toBeNull();
    await act(async () => { answerGeoNet(); await asked; });
    expect(await screen.findByText('Locality')).toBeInTheDocument();
    expect(screen.getByText(LOCALITY, { exact: false }).textContent).toBe(`${LOCALITY} (GeoNet)`);
    second.unmount();

    // Cached: shown at once.
    render(<OptimizedEventPopup event={GEONET_EVENT} />);
    expect(screen.getByText('Locality')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows nothing extra for other events', async () => {
    render(<OptimizedEventPopup event={LOOK_ALIKE} />);
    await act(async () => {});
    expect(screen.queryByText('Locality')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
