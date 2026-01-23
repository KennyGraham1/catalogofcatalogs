'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';

export type DelimiterOption = 'auto' | 'comma' | 'tab' | 'semicolon' | 'pipe' | 'space';

interface DelimiterSelectorProps {
  value: DelimiterOption;
  onChange: (value: DelimiterOption) => void;
  disabled?: boolean;
}

export function DelimiterSelector({ value, onChange, disabled }: DelimiterSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="delimiter-select">Text File Delimiter</Label>
        <InfoTooltip content="Character that separates columns in your file (e.g., comma or tab)." />
      </div>
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
      <p className="text-xs text-muted-foreground">
        Auto-detect will analyze the file to determine the delimiter automatically.
      </p>
    </div>
  );
}
