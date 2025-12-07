'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info } from 'lucide-react';

export type DelimiterOption = 'auto' | 'comma' | 'tab' | 'semicolon' | 'pipe' | 'space';

interface DelimiterSelectorProps {
  value: DelimiterOption;
  onChange: (value: DelimiterOption) => void;
  disabled?: boolean;
}

export function DelimiterSelector({ value, onChange, disabled }: DelimiterSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="delimiter-select">Text File Delimiter</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="delimiter-select">
          <SelectValue placeholder="Select delimiter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Auto-detect</SelectItem>
          <SelectItem value="comma">Comma (,)</SelectItem>
          <SelectItem value="tab">Tab (\t)</SelectItem>
          <SelectItem value="semicolon">Semicolon (;)</SelectItem>
          <SelectItem value="pipe">Pipe (|)</SelectItem>
          <SelectItem value="space">Space</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <p>
          Select the delimiter used in your CSV/TXT files. Auto-detect will analyze the file to determine the delimiter automatically.
        </p>
      </div>
    </div>
  );
}

