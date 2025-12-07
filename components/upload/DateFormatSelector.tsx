'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type DateFormatOption = 'auto' | 'US' | 'International' | 'ISO';

interface DateFormatSelectorProps {
  value: DateFormatOption;
  onChange: (value: DateFormatOption) => void;
  disabled?: boolean;
}

export function DateFormatSelector({ value, onChange, disabled = false }: DateFormatSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="date-format-select">Date Format</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">
                Select the date format used in your file. Auto-detect will analyze the dates to determine the format.
              </p>
              <ul className="mt-2 text-xs space-y-1">
                <li><strong>Auto-detect:</strong> Automatically determine format from file content</li>
                <li><strong>US Format:</strong> MM/DD/YYYY (e.g., 12/31/2024)</li>
                <li><strong>International:</strong> DD/MM/YYYY (e.g., 31/12/2024)</li>
                <li><strong>ISO Format:</strong> YYYY-MM-DD (e.g., 2024-12-31)</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="date-format-select" className="w-full">
          <SelectValue placeholder="Select date format" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">
            <div className="flex flex-col items-start">
              <span>Auto-detect</span>
              <span className="text-xs text-muted-foreground">Recommended</span>
            </div>
          </SelectItem>
          <SelectItem value="US">
            <div className="flex flex-col items-start">
              <span>US Format (MM/DD/YYYY)</span>
              <span className="text-xs text-muted-foreground">Example: 12/31/2024</span>
            </div>
          </SelectItem>
          <SelectItem value="International">
            <div className="flex flex-col items-start">
              <span>International (DD/MM/YYYY)</span>
              <span className="text-xs text-muted-foreground">Example: 31/12/2024</span>
            </div>
          </SelectItem>
          <SelectItem value="ISO">
            <div className="flex flex-col items-start">
              <span>ISO Format (YYYY-MM-DD)</span>
              <span className="text-xs text-muted-foreground">Example: 2024-12-31</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      
      {value !== 'auto' && (
        <p className="text-xs text-muted-foreground">
          All ambiguous dates will be parsed as {value} format
        </p>
      )}
    </div>
  );
}

