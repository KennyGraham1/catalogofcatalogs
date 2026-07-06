'use client';

/**
 * Export menu shown on every chart: print, raster/vector image
 * downloads (PNG/JPEG/SVG), and the chart's underlying data (CSV/JSON).
 * Rendered as a small overlay button in the chart's top-right corner by <EChart>.
 */

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Download, Printer, Image as ImageIcon, FileCode, FileSpreadsheet, FileJson } from 'lucide-react';
import {
  exportChartAsPNG,
  exportChartAsJPEG,
  exportChartAsSVG,
  printChartElement,
  exportDataAsCSV,
  exportDataAsJSON,
} from '@/lib/chart-config';

export interface ChartExportMenuProps {
  /** Ref to the element containing the chart's <svg> (the EChart container). */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Base filename (no extension) and menu heading. */
  filename: string;
  /** Tabular rows for the data download (omit to hide the data items). */
  data?: Record<string, unknown>[];
  label?: string;
}

export function ChartExportMenu({ containerRef, filename, data, label }: ChartExportMenuProps) {
  const withEl = (fn: (el: HTMLElement) => void) => () => {
    const el = containerRef.current;
    if (el) fn(el);
  };
  const safeName = (filename || 'chart').replace(/[^\w.-]+/g, '_');
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 bg-background/70 backdrop-blur-sm border border-border/60 text-muted-foreground hover:text-foreground hover:bg-background shadow-sm"
          aria-label="Export or download this chart"
          title="Export / download"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">{label || 'Export chart'}</DropdownMenuLabel>
        <DropdownMenuItem onClick={withEl((el) => printChartElement(el, label || filename))}>
          <Printer className="h-4 w-4 mr-2" /> Print chart
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={withEl((el) => exportChartAsPNG(el, safeName))}>
          <ImageIcon className="h-4 w-4 mr-2" /> Download PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={withEl((el) => exportChartAsJPEG(el, safeName))}>
          <ImageIcon className="h-4 w-4 mr-2" /> Download JPEG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={withEl((el) => exportChartAsSVG(el, safeName))}>
          <FileCode className="h-4 w-4 mr-2" /> Download SVG (vector)
        </DropdownMenuItem>
        {hasData && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportDataAsCSV(data as Record<string, unknown>[], safeName)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Download data (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportDataAsJSON(data as Record<string, unknown>[], safeName)}>
              <FileJson className="h-4 w-4 mr-2" /> Download data (JSON)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ChartExportMenu;
