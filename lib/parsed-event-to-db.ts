/**
 * Extract every DB-storable field from a flat ParsedEvent (CSV / JSON / GeoJSON).
 *
 * This is the counterpart to lib/quakeml-to-db.ts, which handles the rich
 * QuakeMLEvent structure.  Non-QuakeML parsers produce a flat ParsedEvent
 * whose fields map 1-to-1 (or with minor alias normalisation) to MergedEvent
 * columns.  This function centralises that mapping so the catalogue route
 * stays free of scattered field-name normalisation logic.
 *
 * The four primary scalars (time, latitude, longitude, magnitude) are handled
 * by the catalogue route itself and are intentionally excluded here.
 */

import type { ParsedEvent } from '@/types/upload';
import type { MergedEvent } from './db';

type DbEventFields = Partial<Omit<MergedEvent, 'id' | 'catalogue_id' | 'time' | 'latitude' | 'longitude' | 'magnitude' | 'source_events' | 'created_at'>>;

export function parsedEventToDbFields(event: ParsedEvent): DbEventFields {
  const fields: DbEventFields = {};

  // ── Identification ────────────────────────────────────────────────────────
  const publicId = event.event_public_id || event.eventId || event.publicID || event.id;
  if (publicId)                   fields.event_public_id  = String(publicId);
  // Match the old fallback chain: prefer explicit source_id, then eventId, then id
  const sourceId = event.source_id || event.eventId || (event as any).id;
  if (sourceId)                   fields.source_id        = String(sourceId);

  // ── Event type ────────────────────────────────────────────────────────────
  const eventType = event.event_type || event.eventType;
  if (eventType)                  fields.event_type           = String(eventType);
  if (event.event_type_certainty) fields.event_type_certainty = String(event.event_type_certainty);

  // ── Location metadata ─────────────────────────────────────────────────────
  if (event.region)               fields.region        = String(event.region);
  if (event.location_name)        fields.location_name = String(event.location_name);

  // ── Origin uncertainties ──────────────────────────────────────────────────
  if (event.time_uncertainty      != null) fields.time_uncertainty      = Number(event.time_uncertainty);
  if (event.latitude_uncertainty  != null) fields.latitude_uncertainty  = Number(event.latitude_uncertainty);
  if (event.longitude_uncertainty != null) fields.longitude_uncertainty = Number(event.longitude_uncertainty);
  if (event.depth_uncertainty     != null) fields.depth_uncertainty     = Number(event.depth_uncertainty);

  // ── Magnitude details ─────────────────────────────────────────────────────
  const magnitudeType = event.magnitude_type || event.magnitudeType;
  if (magnitudeType)                         fields.magnitude_type          = String(magnitudeType);
  if (event.magnitude_uncertainty  != null)  fields.magnitude_uncertainty   = Number(event.magnitude_uncertainty);
  if (event.magnitude_station_count != null) fields.magnitude_station_count = Number(event.magnitude_station_count);

  // ── Origin quality metrics ────────────────────────────────────────────────
  const azimuthalGap = event.azimuthal_gap ?? (event as any).azimuthalGap;
  if (azimuthalGap    != null) fields.azimuthal_gap    = Number(azimuthalGap);

  const usedPhaseCount = event.used_phase_count ?? (event as any).usedPhaseCount;
  if (usedPhaseCount  != null) fields.used_phase_count = Number(usedPhaseCount);

  const usedStationCount = event.used_station_count ?? (event as any).usedStationCount;
  if (usedStationCount != null) fields.used_station_count = Number(usedStationCount);

  if (event.minimum_distance != null) fields.minimum_distance = Number(event.minimum_distance);
  if (event.standard_error   != null) fields.standard_error   = Number(event.standard_error);

  // ── Evaluation ────────────────────────────────────────────────────────────
  if (event.evaluation_mode)   fields.evaluation_mode   = String(event.evaluation_mode);
  if (event.evaluation_status) fields.evaluation_status = String(event.evaluation_status);

  // ── Agency / author ───────────────────────────────────────────────────────
  if (event.agency_id) fields.agency_id = String(event.agency_id);
  if (event.author)    fields.author    = String(event.author);

  // ── Narrative / metadata fields ───────────────────────────────────────────
  // comment (single string) → comments (JSON array, matching MergedEvent schema)
  if (event.comment)
    fields.comments = JSON.stringify([{ text: event.comment }]);

  if (event.creation_info)
    fields.creation_info = typeof event.creation_info === 'string'
      ? event.creation_info
      : JSON.stringify(event.creation_info);

  // ── Pre-serialised JSON arrays (passed through from CSV/JSON/GeoJSON) ─────
  // Some importers may already produce these as JSON strings on the event.
  const jsonArrayFields = [
    'origins', 'magnitudes', 'picks', 'arrivals',
    'focal_mechanisms', 'amplitudes', 'station_magnitudes',
  ] as const;

  for (const key of jsonArrayFields) {
    const val = (event as any)[key];
    if (typeof val === 'string' && val.length > 0)
      (fields as any)[key] = val;
  }

  return fields;
}
