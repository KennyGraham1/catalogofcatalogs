/** @jest-environment node */
/**
 * The catalogue map, dashboard map and merge-result map load events with view=summary
 * (lib/catalogue-event-loader.ts). Their uncertainty-ellipse and focal-mechanism overlays
 * need these fields, so the summary projection must keep them - while still dropping the
 * heavy per-pick / per-arrival collections the maps never read.
 */
import { EVENT_SUMMARY_PROJECTION } from '@/lib/db';

jest.mock('@/lib/mongodb', () => ({ getCollection: jest.fn(), COLLECTIONS: { EVENTS: 'merged_events' } }));

const OVERLAY_FIELDS = [
  'horizontal_uncertainty', 'min_horizontal_uncertainty', 'max_horizontal_uncertainty',
  'azimuth_max_horizontal_uncertainty', 'confidence_level', 'latitude_uncertainty', 'longitude_uncertainty',
  'focal_mechanisms', 'preferred_focal_mechanism_id',
];

describe('events summary projection and the map overlays', () => {
  it.each(OVERLAY_FIELDS)('keeps %s', (field) => {
    expect(EVENT_SUMMARY_PROJECTION).not.toHaveProperty(field);
  });

  it('still leaves out picks and arrivals', () => {
    expect(EVENT_SUMMARY_PROJECTION).toMatchObject({ picks: 0, arrivals: 0 });
  });
});
