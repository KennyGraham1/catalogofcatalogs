import L from 'leaflet';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';

/** A Next static image import is { src, ... }; some bundlers give the URL string. */
function assetUrl(asset: string | { src: string }): string {
  return typeof asset === 'string' ? asset : asset.src;
}

let configured = false;

/**
 * Point Leaflet's default marker icon (L.Marker, leaflet-draw's marker tool) at the images
 * bundled from leaflet/dist/images, served from this origin. The cdnjs URLs the maps used
 * to set are blocked by the CSP's img-src, which drew a broken image for every marker.
 *
 * Idempotent and cheap: call it at module scope or in an effect of any map that may draw a
 * default marker. Deleting _getIconUrl stops Leaflet prefixing its CSS-detected image path
 * to these absolute URLs.
 */
export function ensureLeafletDefaultIcon(): void {
  if (configured) return;
  configured = true;
  delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: assetUrl(iconRetina),
    iconUrl: assetUrl(icon),
    shadowUrl: assetUrl(shadow),
  });
}
