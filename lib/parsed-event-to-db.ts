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
import { ALLOWED_EVENT_TYPE } from './db';

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
  if (eventType) {
    const normalized = String(eventType).toLowerCase().trim();
    if (ALLOWED_EVENT_TYPE.has(normalized)) {
      fields.event_type = normalized;
    } else if (/^m[a-z0-9_]{0,5}$/.test(normalized)) {
      // Magnitude scale code (ML, Mw, mb, Ms, …) accidentally placed in event_type
      const existingMagType = event.magnitude_type || event.magnitudeType;
      if (!existingMagType) fields.magnitude_type = String(eventType).trim();
    }
    // Unrecognised value — drop silently rather than failing the entire upload
  }
  if (event.event_type_certainty) fields.event_type_certainty = String(event.event_type_certainty).toLowerCase().trim();

  // ── Location metadata ─────────────────────────────────────────────────────
  if (event.region)               fields.region        = String(event.region);
  if (event.location_name)        fields.location_name = String(event.location_name);

  // ── Origin uncertainties ──────────────────────────────────────────────────
  if (event.time_uncertainty      != null) fields.time_uncertainty      = Number(event.time_uncertainty);
  if (event.latitude_uncertainty  != null) fields.latitude_uncertainty  = Number(event.latitude_uncertainty);
  if (event.longitude_uncertainty != null) fields.longitude_uncertainty = Number(event.longitude_uncertainty);
  if (event.depth_uncertainty     != null) fields.depth_uncertainty     = Number(event.depth_uncertainty);

  // ── Origin metadata (from FIELD_ALIASES-mapped CSV/JSON/GeoJSON) ──────────
  if (event.horizontal_uncertainty != null) fields.horizontal_uncertainty = Number(event.horizontal_uncertainty);
  if (event.depth_type)                     fields.depth_type             = String(event.depth_type).toLowerCase().trim();
  if (event.earth_model_id)                 fields.earth_model_id         = String(event.earth_model_id);
  if (event.method_id)                      fields.method_id              = String(event.method_id);

  // ── Magnitude details ─────────────────────────────────────────────────────
  const magnitudeType = event.magnitude_type || event.magnitudeType;
  if (magnitudeType)                         fields.magnitude_type              = String(magnitudeType);
  if (event.magnitude_uncertainty  != null)  fields.magnitude_uncertainty       = Number(event.magnitude_uncertainty);
  if (event.magnitude_station_count != null) fields.magnitude_station_count     = Number(event.magnitude_station_count);
  if (event.magnitude_method_id)             fields.magnitude_method_id         = String(event.magnitude_method_id);
  if (event.magnitude_evaluation_mode)       fields.magnitude_evaluation_mode   = String(event.magnitude_evaluation_mode).toLowerCase().trim();
  if (event.magnitude_evaluation_status)     fields.magnitude_evaluation_status = String(event.magnitude_evaluation_status).toLowerCase().trim();

  // ── Origin quality metrics ────────────────────────────────────────────────
  const azimuthalGap = event.azimuthal_gap ?? event.azimuthalGap;
  if (azimuthalGap    != null) fields.azimuthal_gap    = Number(azimuthalGap);

  const usedPhaseCount = event.used_phase_count ?? event.usedPhaseCount;
  if (usedPhaseCount  != null) fields.used_phase_count = Number(usedPhaseCount);

  const usedStationCount = event.used_station_count ?? event.usedStationCount;
  if (usedStationCount != null) fields.used_station_count = Number(usedStationCount);

  if (event.minimum_distance         != null) fields.minimum_distance         = Number(event.minimum_distance);
  if (event.maximum_distance         != null) fields.maximum_distance         = Number(event.maximum_distance);
  if (event.standard_error           != null) fields.standard_error           = Number(event.standard_error);
  if (event.associated_phase_count   != null) fields.associated_phase_count   = Number(event.associated_phase_count);
  if (event.associated_station_count != null) fields.associated_station_count = Number(event.associated_station_count);
  if (event.depth_phase_count        != null) fields.depth_phase_count        = Number(event.depth_phase_count);

  // ── Evaluation ────────────────────────────────────────────────────────────
  if (event.evaluation_mode)   fields.evaluation_mode   = String(event.evaluation_mode).toLowerCase().trim();
  if (event.evaluation_status) fields.evaluation_status = String(event.evaluation_status).toLowerCase().trim();

  // ── Agency / author ───────────────────────────────────────────────────────
  if (event.agency_id) fields.agency_id = String(event.agency_id);
  if (event.author)    fields.author    = String(event.author);

  // ── Preferred IDs ────────────────────────────────────────────────────────
  if (event.preferred_origin_id)    fields.preferred_origin_id    = String(event.preferred_origin_id);
  if (event.preferred_magnitude_id) fields.preferred_magnitude_id = String(event.preferred_magnitude_id);

  // ── Narrative / metadata fields ───────────────────────────────────────────
  // comment (single string) → comments (JSON array, matching MergedEvent schema)
  // If event.comments already exists as a JSON blob, prefer that.
  if (event.comments) {
    fields.comments = typeof event.comments === 'string'
      ? event.comments
      : JSON.stringify(event.comments);
  } else if (event.comment) {
    fields.comments = JSON.stringify([{ text: event.comment }]);
  }

  if (event.creation_info)
    fields.creation_info = typeof event.creation_info === 'string'
      ? event.creation_info
      : JSON.stringify(event.creation_info);

  // ── Pre-serialised JSON arrays (passed through from CSV/JSON/GeoJSON) ─────
  // Some importers may already produce these as JSON strings on the event.
  // When re-importing a previously exported JSON file, these may arrive as
  // parsed objects (arrays) rather than strings — handle both.
  const jsonArrayFields = [
    'origins', 'magnitudes', 'picks', 'arrivals',
    'focal_mechanisms', 'amplitudes', 'station_magnitudes',
    'event_descriptions',
  ] as const;

  for (const key of jsonArrayFields) {
    const val = (event as any)[key];
    if (typeof val === 'string' && val.length > 0) {
      (fields as any)[key] = val;
    } else if (val != null && typeof val === 'object') {
      (fields as any)[key] = JSON.stringify(val);
    }
  }

  // ── Origin quality (JSON blob) ────────────────────────────────────────────
  if (event.origin_quality) {
    fields.origin_quality = typeof event.origin_quality === 'string'
      ? event.origin_quality
      : JSON.stringify(event.origin_quality);
  }

  return fields;
}
