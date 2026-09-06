'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MapDetail } from '@/lib/map-event-selection';

export function MapDetailControl({ value, onChange }: { value: MapDetail; onChange: (value: MapDetail) => void }) {
  const id = useId();
  return <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs font-medium">Map detail</Label>
    <Select value={String(value)} onValueChange={next => onChange(next === 'auto' ? 'auto' : Number(next))}>
      <SelectTrigger id={id} className="w-full h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent position="popper" className="z-[10000]">
        <SelectItem value="auto">Automatic</SelectItem>
        <SelectItem value="500">Up to 500 visible events</SelectItem>
        <SelectItem value="1000">Up to 1,000 visible events</SelectItem>
        <SelectItem value="2000">Up to 2,000 visible events</SelectItem>
        <SelectItem value="5000">Up to 5,000 visible events</SelectItem>
        <SelectItem value="Infinity">All visible events</SelectItem>
      </SelectContent>
    </Select>
    <p className="text-[10px] text-muted-foreground">Automatic adjusts to map size. Zoom in to reveal more events.</p>
  </div>;
}
