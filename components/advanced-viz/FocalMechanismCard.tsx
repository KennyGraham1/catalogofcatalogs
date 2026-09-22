'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Compass, Layers, TrendingDown } from 'lucide-react';
import { TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import {
  FocalMechanism,
  NodalPlane,
  getFaultType,
  computeBeachball,
  selectPlane,
  selectPlaneNumber,
  isCompletePlane,
} from '@/lib/focal-mechanism-utils';
import { Beachball } from './Beachball';

interface FocalMechanismCardProps {
  mechanism: FocalMechanism;
}

export function FocalMechanismCard({ mechanism }: FocalMechanismCardProps) {
  if (!mechanism.nodalPlane1 && !mechanism.nodalPlane2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Focal Mechanism</CardTitle>
          <CardDescription>No focal mechanism data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Interpretation follows the stated preferred plane; without a complete plane there is
  // no geometry and no fault-type claim, only the angles the source actually reported.
  const selected = selectPlane(mechanism);
  const selectedNumber = selectPlaneNumber(mechanism);
  const faultType = selected ? getFaultType(selected.rake) : null;
  const beachball = selected ? computeBeachball(mechanism, 200) : null;
  // Open on the plane the description is built from.
  const defaultTab = selectedNumber === 2 || (!mechanism.nodalPlane1 && mechanism.nodalPlane2) ? 'plane2' : 'plane1';
  // The description follows the stated preference only when that plane is complete;
  // say so when it had to fall back, since lateral sense differs between the planes.
  const preferenceHonoured = mechanism.preferredPlane !== undefined && selectedNumber === mechanism.preferredPlane;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Focal Mechanism</CardTitle>
          <Badge variant="outline">{faultType ? faultType.type : 'incomplete'}</Badge>
        </div>
        <CardDescription>
          {faultType ? faultType.description : 'Nodal plane incomplete: fault type cannot be classified'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Beach Ball Diagram (lower-hemisphere equal-area, compressional shaded) */}
        {selected ? (
          <div className="flex flex-col items-center gap-2 p-4 bg-muted rounded-lg">
            <Beachball mechanism={mechanism} size={200} showAxes />
            {beachball && (
              <div className="flex gap-6 text-xs text-muted-foreground font-mono">
                <span title="Pressure axis azimuth/plunge">P {beachball.pAxis.azimuth.toFixed(0)}°/{beachball.pAxis.plunge.toFixed(0)}°</span>
                <span title="Tension axis azimuth/plunge">T {beachball.tAxis.azimuth.toFixed(0)}°/{beachball.tAxis.plunge.toFixed(0)}°</span>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Blue = compressional · lines = nodal planes</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
            Beach ball not drawn: strike, dip and rake are all required and the source reported only some of them.
          </p>
        )}

        {/* Nodal Planes */}
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plane1">
              Plane 1 {mechanism.preferredPlane === 1 && '⭐'}
            </TabsTrigger>
            <TabsTrigger value="plane2">
              Plane 2 {mechanism.preferredPlane === 2 && '⭐'}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="plane1" className="space-y-3 mt-4">
            {mechanism.nodalPlane1 ? <PlanePanel plane={mechanism.nodalPlane1} /> : (
              <p className="text-sm text-muted-foreground">No data for nodal plane 1</p>
            )}
          </TabsContent>

          <TabsContent value="plane2" className="space-y-3 mt-4">
            {mechanism.nodalPlane2 ? <PlanePanel plane={mechanism.nodalPlane2} /> : (
              <p className="text-sm text-muted-foreground">No data for nodal plane 2</p>
            )}
          </TabsContent>
        </Tabs>

        {/* Fault Type Explanation */}
        <div className="pt-2 border-t">
          <h4 className="font-semibold text-sm mb-2">Fault Type</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{faultType ? getFaultTypeExplanation(faultType.type) : 'Fault type is not reported because at least one nodal-plane angle is missing.'}</p>
            {mechanism.preferredPlane && preferenceHonoured ? (
              <p className="text-xs">
                ⭐ Preferred plane: the source identifies Plane {mechanism.preferredPlane} as the fault plane.
              </p>
            ) : mechanism.preferredPlane ? (
              <p className="text-xs">
                ⭐ The source identifies Plane {mechanism.preferredPlane} as the fault plane, but that plane is incomplete
                {selectedNumber ? `; the classification above follows Plane ${selectedNumber} instead` : ''}.
              </p>
            ) : (
              <p className="text-xs">
                The source states no preferred plane; the two nodal planes are equally admissible fault planes.
              </p>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="pt-2 border-t">
          <h4 className="font-semibold text-sm mb-2">Beach Ball Legend</h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-black rounded"></div>
              <span>Compressional quadrants</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-white border border-black rounded"></div>
              <span>Tensional quadrants</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function angleText(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(0)}°`;
}

function PlanePanel({ plane }: { plane: NodalPlane }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Compass className="h-4 w-4" />
            <span>Strike</span>
            <TechnicalTermTooltip term="strike" />
          </div>
          <div className="text-2xl font-bold">{angleText(plane.strike)}</div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="h-4 w-4" />
            <span>Dip</span>
            <TechnicalTermTooltip term="dip" />
          </div>
          <div className="text-2xl font-bold">{angleText(plane.dip)}</div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4" />
            <span>Rake</span>
            <TechnicalTermTooltip term="rake" />
          </div>
          <div className="text-2xl font-bold">{angleText(plane.rake)}</div>
        </div>
      </div>

      <div className="pt-2 border-t">
        <h4 className="font-semibold text-sm mb-2">Interpretation</h4>
        <p className="text-sm text-muted-foreground">
          {isCompletePlane(plane) ? getPlaneInterpretation(plane) : 'Not reported: one or more angles are missing from the source.'}
        </p>
      </div>
    </>
  );
}

function getPlaneInterpretation(plane: { strike: number; dip: number; rake: number }): string {
  const { strike, dip, rake } = plane;
  
  let interpretation = `Fault plane striking ${getCompassDirection(strike)} (${strike.toFixed(0)}°) `;
  
  if (dip < 30) {
    interpretation += 'with shallow dip';
  } else if (dip < 60) {
    interpretation += 'with moderate dip';
  } else {
    interpretation += 'with steep dip';
  }
  
  interpretation += ` (${dip.toFixed(0)}°). `;
  
  const absRake = Math.abs(rake);
  if (absRake < 30 || absRake > 150) {
    interpretation += 'Predominantly strike-slip motion.';
  } else if (rake > 0) {
    interpretation += 'Reverse/thrust faulting with hanging wall moving up.';
  } else {
    interpretation += 'Normal faulting with hanging wall moving down.';
  }
  
  return interpretation;
}

function getCompassDirection(azimuth: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(azimuth / 22.5) % 16;
  return directions[index];
}

function getFaultTypeExplanation(type: string): string {
  switch (type) {
    case 'normal':
      return 'Normal faulting occurs in extensional tectonic settings where the crust is being pulled apart. The hanging wall moves down relative to the footwall.';
    case 'reverse':
      return 'Reverse/thrust faulting occurs in compressional settings where the crust is being shortened. The hanging wall moves up relative to the footwall.';
    case 'strike-slip':
      return 'Strike-slip faulting involves horizontal motion along the fault plane, with minimal vertical displacement. Common at transform plate boundaries.';
    case 'oblique-normal':
      return 'Oblique-normal faulting combines normal faulting with a strike-slip component, indicating both extension and lateral motion.';
    case 'oblique-reverse':
      return 'Oblique-reverse faulting combines reverse faulting with a strike-slip component, indicating both compression and lateral motion.';
    default:
      return 'The fault mechanism indicates the type of motion that occurred during the earthquake.';
  }
}
