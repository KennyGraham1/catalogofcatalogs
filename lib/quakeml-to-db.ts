/**
 * Extract every DB-storable field from a parsed QuakeMLEvent.
 *
 * This is the single source of truth for the QuakeML → MergedEvent mapping.
 * Both the upload path and the merge path use this function so that no field
 * is silently dropped in either code path.
 *
 * The function intentionally mirrors the extraction logic in lib/merge.ts
 * (lines 340-460) but lives here so it can be imported by any API route without
 * pulling in the full merge module.
 */

import type { QuakeMLEvent } from './types/quakeml';
import type { MergedEvent } from './db';
import { ALLOWED_EVENT_TYPE } from './db';

type DbEventFields = Partial<Omit<MergedEvent, 'id' | 'catalogue_id' | 'time' | 'latitude' | 'longitude' | 'magnitude' | 'source_events' | 'created_at'>>;

export function quakemlEventToDbFields(quakeml: QuakeMLEvent): DbEventFields {
  const fields: DbEventFields = {};

  // ── Top-level event metadata ──────────────────────────────────────────────
  fields.event_public_id    = quakeml.publicID;
  if (quakeml.publicID)       fields.source_id            = quakeml.publicID;
  if (quakeml.type) {
    const normalized = quakeml.type.toLowerCase().trim();
    if (ALLOWED_EVENT_TYPE.has(normalized)) fields.event_type = normalized;
  }
  if (quakeml.typeCertainty)  fields.event_type_certainty = quakeml.typeCertainty.toLowerCase().trim();

  // ── Preferred origin ──────────────────────────────────────────────────────
  const preferredOrigin =
    (quakeml.preferredOriginID && quakeml.origins?.find(o => o.publicID === quakeml.preferredOriginID))
    || quakeml.origins?.[0];

  if (preferredOrigin) {
    fields.preferred_origin_id = preferredOrigin.publicID;

    // Location uncertainties
    if (preferredOrigin.time.uncertainty       != null) fields.time_uncertainty      = preferredOrigin.time.uncertainty;
    if (preferredOrigin.latitude.uncertainty   != null) fields.latitude_uncertainty  = preferredOrigin.latitude.uncertainty;
    if (preferredOrigin.longitude.uncertainty  != null) fields.longitude_uncertainty = preferredOrigin.longitude.uncertainty;
    if (preferredOrigin.depth?.uncertainty     != null) fields.depth_uncertainty     = preferredOrigin.depth.uncertainty;

    // Horizontal uncertainty (from OriginUncertainty sub-object)
    if (preferredOrigin.uncertainty?.horizontalUncertainty != null) {
      fields.horizontal_uncertainty = preferredOrigin.uncertainty.horizontalUncertainty;
    }

    // Origin metadata
    if (preferredOrigin.depthType)    fields.depth_type    = preferredOrigin.depthType.toLowerCase().trim();
    if (preferredOrigin.earthModelID) fields.earth_model_id = preferredOrigin.earthModelID;
    if (preferredOrigin.methodID)     fields.method_id     = preferredOrigin.methodID;
    if (preferredOrigin.region)       fields.region        = preferredOrigin.region;

    // Agency / author
    if (preferredOrigin.creationInfo?.agencyID) fields.agency_id = preferredOrigin.creationInfo.agencyID;
    if (preferredOrigin.creationInfo?.author)   fields.author    = preferredOrigin.creationInfo.author;

    // Origin quality
    if (preferredOrigin.quality) {
      const q = preferredOrigin.quality;
      if (q.azimuthalGap          != null) fields.azimuthal_gap            = q.azimuthalGap;
      if (q.usedPhaseCount        != null) fields.used_phase_count         = q.usedPhaseCount;
      if (q.usedStationCount      != null) fields.used_station_count       = q.usedStationCount;
      if (q.standardError         != null) fields.standard_error           = q.standardError;
      if (q.minimumDistance       != null) fields.minimum_distance         = q.minimumDistance;
      if (q.maximumDistance       != null) fields.maximum_distance         = q.maximumDistance;
      if (q.associatedPhaseCount  != null) fields.associated_phase_count   = q.associatedPhaseCount;
      if (q.associatedStationCount!= null) fields.associated_station_count = q.associatedStationCount;
      if (q.depthPhaseCount       != null) fields.depth_phase_count        = q.depthPhaseCount;
      fields.origin_quality = JSON.stringify(q);
    }

    // Evaluation
    if (preferredOrigin.evaluationMode)   fields.evaluation_mode   = preferredOrigin.evaluationMode.toLowerCase().trim();
    if (preferredOrigin.evaluationStatus) fields.evaluation_status = preferredOrigin.evaluationStatus.toLowerCase().trim();
  }

  // ── Preferred magnitude ───────────────────────────────────────────────────
  const preferredMagnitude =
    (quakeml.preferredMagnitudeID && quakeml.magnitudes?.find(m => m.publicID === quakeml.preferredMagnitudeID))
    || quakeml.magnitudes?.[0];

  if (preferredMagnitude) {
    fields.preferred_magnitude_id       = preferredMagnitude.publicID;
    if (preferredMagnitude.type)                    fields.magnitude_type              = preferredMagnitude.type;
    if (preferredMagnitude.mag.uncertainty  != null) fields.magnitude_uncertainty      = preferredMagnitude.mag.uncertainty;
    if (preferredMagnitude.stationCount     != null) fields.magnitude_station_count    = preferredMagnitude.stationCount;
    if (preferredMagnitude.methodID)                 fields.magnitude_method_id        = preferredMagnitude.methodID;
    if (preferredMagnitude.evaluationMode)           fields.magnitude_evaluation_mode   = preferredMagnitude.evaluationMode.toLowerCase().trim();
    if (preferredMagnitude.evaluationStatus)         fields.magnitude_evaluation_status = preferredMagnitude.evaluationStatus.toLowerCase().trim();
  }

  // ── Complex nested arrays stored as JSON strings ──────────────────────────
  if (quakeml.origins?.length)                         fields.origins             = JSON.stringify(quakeml.origins);
  if (quakeml.magnitudes?.length)                      fields.magnitudes          = JSON.stringify(quakeml.magnitudes);
  if (quakeml.picks?.length)                           fields.picks               = JSON.stringify(quakeml.picks);
  if ((quakeml as any).arrivals?.length)               fields.arrivals            = JSON.stringify((quakeml as any).arrivals);
  if (quakeml.focalMechanisms?.length)                 fields.focal_mechanisms    = JSON.stringify(quakeml.focalMechanisms);
  if (quakeml.amplitudes?.length)                      fields.amplitudes          = JSON.stringify(quakeml.amplitudes);
  if (quakeml.stationMagnitudes?.length)               fields.station_magnitudes  = JSON.stringify(quakeml.stationMagnitudes);
  if (quakeml.description?.length)                     fields.event_descriptions  = JSON.stringify(quakeml.description);
  if (quakeml.comment?.length)                         fields.comments            = JSON.stringify(quakeml.comment);
  if (quakeml.creationInfo)                            fields.creation_info       = JSON.stringify(quakeml.creationInfo);

  return fields;
}
