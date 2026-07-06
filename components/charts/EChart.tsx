'use client';

/**
 * Thin, theme-aware Apache ECharts wrapper used by every (non-map) plot in the app.
 *
 * - Uses the full echarts-for-react build so every chart type/component is available.
 * - Applies the shared base option (font colour, palette, animation) from echarts-theme.
 * - Re-themes automatically on light/dark switch (colours are baked into the option).
 * - Resizes with its container via echarts-for-react's built-in size-sensor.
 * - Renders an export menu (print / PNG / JPEG / SVG / data CSV+JSON)
 *   in the top-right corner; pass `exportData` to enable the data downloads.
 */

import { useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { chartColors, baseOption } from '@/lib/echarts-theme';
import { cn } from '@/lib/utils';
import { ChartExportMenu } from './ChartExportMenu';

export interface EChartProps {
  option: EChartsOption;
  /** Seeds the export filenames and menu heading. */
  exportName?: string;
  /** Tabular rows for the "Download data (CSV/JSON)" menu items. */
  exportData?: Record<string, unknown>[];
  className?: string;
  style?: React.CSSProperties;
  height?: number | string;
  /** Replace (true, default) vs merge options on update. */
  notMerge?: boolean;
  /** ECharts event handlers, e.g. { click: (p) => ... }. */
  onEvents?: Record<string, (params: unknown) => void>;
  'aria-label'?: string;
  /** Hide the export menu overlay. */
  hideExport?: boolean;
}

export function EChart({
  option,
  exportName = 'chart',
  exportData,
  className,
  style,
  height = 320,
  notMerge = true,
  onEvents,
  'aria-label': ariaLabel,
  hideExport = false,
}: EChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);

  const merged = useMemo<EChartsOption>(() => {
    const base = baseOption(chartColors(isDark));
    const o = option as Record<string, unknown>;
    const b = base as Record<string, unknown>;
    const result: Record<string, unknown> = { ...b, ...o };
    // Deep-merge structural base keys so a consumer-supplied partial doesn't drop them.
    for (const key of ['textStyle']) {
      if (b[key] && o[key] && typeof b[key] === 'object' && typeof o[key] === 'object') {
        result[key] = { ...(b[key] as object), ...(o[key] as object) };
      }
    }
    return result as EChartsOption;
  }, [option, isDark]);

  return (
    <div className={cn('relative w-full', className)} style={{ height, width: '100%', ...style }}>
      <div ref={containerRef} role="img" aria-label={ariaLabel} className="h-full w-full">
        <ReactECharts
          option={merged}
          notMerge={notMerge}
          lazyUpdate
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
          onEvents={onEvents}
        />
      </div>
      {!hideExport && (
        <div className="absolute top-1.5 right-1.5 z-[2]">
          <ChartExportMenu containerRef={containerRef} filename={exportName} data={exportData} label={ariaLabel} />
        </div>
      )}
    </div>
  );
}

export default EChart;
