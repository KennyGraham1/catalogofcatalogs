/**
 * Map components for earthquake visualization
 *
 * This module provides optimized components for rendering earthquake markers
 * and related UI elements on Leaflet maps. Symbology lives in lib/map-style.ts, popup
 * text formatting in lib/map-format.ts, initial-view helpers in lib/map-view.ts.
 *
 * Client-only: most of these import Leaflet, which needs `window`.
 */

export {
  OptimizedEventPopup,
  SimpleEventPopup,
  formatOriginTime,
  type PopupEvent,
  type OptimizedEventPopupProps,
} from './OptimizedEventPopup';

export {
  MapLoadingIndicator,
  InlineMapLoader,
  MapEmptyState,
  MapErrorState,
} from './MapLoadingIndicator';

export { EarthquakeMarkerLayer, type EarthquakeMarkerLayerProps } from './EarthquakeMarkerLayer';
export { MapLayerControl, attachBaseLayers, createBaseTileLayer, LABELS_OPACITY, type BaseLayerControlHandle } from './MapLayerControl';
export { MapScaleBar, MAP_SCALE_OPTIONS } from './MapScaleBar';
export { MapStatusChip, MAP_STATUS_POSITION } from './MapStatusChip';
export { MapStylePanel, StylePanelSection, StyleRadioGroup, MAP_STYLE_PANEL_POSITION, STYLE_PANEL_AUTO_OPEN_MIN_WIDTH } from './MapStylePanel';
export { FitMapToEvents } from './FitMapToEvents';
export { ensureMapPane, ensureLabelsPane } from './map-panes';
export { ensureLeafletDefaultIcon } from './leaflet-default-icon';
export {
  MapLegend, LegendSection, DepthColorBar, MagnitudeSizeKey, QualityColorKey, AzimuthalGapColorBar,
  CatalogueColorKey, FaultLineKey, ColorModeLegendSection, COLOR_MODE_LABELS, COLOR_MODE_LEGEND_TITLES,
  MAP_LEGEND_POSITION, buildCatalogueColorScale, resolveSourceCatalogue, UNKNOWN_SOURCE_KEY,
  type MapColorMode, type CatalogueColorScale, type SourceCatalogueInfo,
} from './MapLegend';
