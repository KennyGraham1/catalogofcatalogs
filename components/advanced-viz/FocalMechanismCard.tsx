'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Compass, Layers, TrendingDown } from 'lucide-react';
import { 
  FocalMechanism, 
  generateBeachBallSVG, 
  formatFocalMechanism,
  getFaultType 
} from '@/lib/focal-mechanism-utils';

interface FocalMechanismCardProps {
  mechanism: FocalMechanism;
}

export function FocalMechanismCard({ mechanism }: FocalMechanismCardProps) {
  if (!mechanism.nodalPlane1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Focal Mechanism</CardTitle>
          <CardDescription>No focal mechanism data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatted = formatFocalMechanism(mechanism);
  const faultType = getFaultType(mechanism.nodalPlane1.rake);
  const beachBallSVG = generateBeachBallSVG(mechanism, 200);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Focal Mechanism</CardTitle>
          <Badge variant="outline">{faultType.type}</Badge>
        </div>
        <CardDescription>{faultType.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Beach Ball Diagram */}
        <div className="flex justify-center p-4 bg-muted rounded-lg">
          <div dangerouslySetInnerHTML={{ __html: beachBallSVG }} />
        </div>

        {/* Nodal Planes */}
        <Tabs defaultValue="plane1" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plane1">
              Plane 1 {mechanism.preferredPlane === 1 && '⭐'}
            </TabsTrigger>
            <TabsTrigger value="plane2">
              Plane 2 {mechanism.preferredPlane === 2 && '⭐'}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="plane1" className="space-y-3 mt-4">
            {mechanism.nodalPlane1 && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Compass className="h-4 w-4" />
                      <span>Strike</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {mechanism.nodalPlane1.strike.toFixed(0)}°
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Layers className="h-4 w-4" />
                      <span>Dip</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {mechanism.nodalPlane1.dip.toFixed(0)}°
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingDown className="h-4 w-4" />
                      <span>Rake</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {mechanism.nodalPlane1.rake.toFixed(0)}°
                    </div>
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <h4 className="font-semibold text-sm mb-2">Interpretation</h4>
                  <p className="text-sm text-muted-foreground">
                    {getPlaneInterpretation(mechanism.nodalPlane1)}
                  </p>
                </div>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="plane2" className="space-y-3 mt-4">
            {mechanism.nodalPlane2 ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Compass className="h-4 w-4" />
                      <span>Strike</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {mechanism.nodalPlane2.strike.toFixed(0)}°
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Layers className="h-4 w-4" />
                      <span>Dip</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {mechanism.nodalPlane2.dip.toFixed(0)}°
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingDown className="h-4 w-4" />
                      <span>Rake</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {mechanism.nodalPlane2.rake.toFixed(0)}°
                    </div>
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <h4 className="font-semibold text-sm mb-2">Interpretation</h4>
                  <p className="text-sm text-muted-foreground">
                    {getPlaneInterpretation(mechanism.nodalPlane2)}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data for nodal plane 2</p>
            )}
          </TabsContent>
        </Tabs>

        {/* Fault Type Explanation */}
        <div className="pt-2 border-t">
          <h4 className="font-semibold text-sm mb-2">Fault Type</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{getFaultTypeExplanation(faultType.type)}</p>
            {mechanism.preferredPlane && (
              <p className="text-xs">
                ⭐ Preferred plane: Plane {mechanism.preferredPlane} is considered the most likely fault plane based on geological or seismological evidence.
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

