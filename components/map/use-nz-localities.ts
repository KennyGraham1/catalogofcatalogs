'use client';

import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { LOCALITIES_ATTRIBUTION, loadNzLocalities, type Locality } from '@/lib/nz-localities';

/**
 * The LINZ Gazetteer places the hover card describes events against, loaded once per page
 * (shared by every map). Empty until loaded, or if loading fails; cards then fall back to
 * the region or the epicentre.
 */
export function useNzLocalities(): ReadonlyArray<Locality> {
  const [places, setPlaces] = useState<ReadonlyArray<Locality>>([]);
  useEffect(() => {
    let active = true;
    loadNzLocalities().then((loaded) => { if (active && loaded.length) setPlaces(loaded); });
    return () => { active = false; };
  }, []);
  return places;
}

/** Credits the Gazetteer in the map's attribution while the place names are in use. */
export function LocalitiesAttribution({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    const control = map.attributionControl;
    if (!active || !control) return;
    control.addAttribution(LOCALITIES_ATTRIBUTION);
    return () => { control.removeAttribution(LOCALITIES_ATTRIBUTION); };
  }, [map, active]);
  return null;
}
