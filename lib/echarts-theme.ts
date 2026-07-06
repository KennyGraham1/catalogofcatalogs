/**
 * Shared Apache ECharts theming for the seismology dashboards.
 *
 * Reuses the existing scientific palette (lib/chart-config) so the ECharts plots
 * stay visually consistent with the rest of the app, and adapts axis/grid/tooltip
 * styling to the active light/dark theme. Chart components compose their own
 * `EChartsOption` using the helpers here; the <EChart> wrapper applies the global
 * base (text colour, animation, toolbox) on top.
 */

import type { EChartsOption } from 'echarts';
import { SEISMIC_COLORS, CATEGORICAL_COLORS } from './chart-config';

/** Resolved per-theme colours used across all charts. */
export function chartColors(isDark: boolean) {
  return {
    text: isDark ? '#e5e7eb' : '#374151',
    subtext: isDark ? '#9ca3af' : '#6b7280',
    axis: isDark ? SEISMIC_COLORS.axis.dark : SEISMIC_COLORS.axis.light,
    grid: isDark ? SEISMIC_COLORS.grid.dark : SEISMIC_COLORS.grid.light,
    tooltipBg: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.97)',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
    reference: isDark ? SEISMIC_COLORS.reference.dark : SEISMIC_COLORS.reference.light,
    fit: isDark ? SEISMIC_COLORS.fit.dark : SEISMIC_COLORS.fit.light,
    background: isDark ? '#0b0f19' : '#ffffff',
    series: [...CATEGORICAL_COLORS],
  };
}

export type ChartColors = ReturnType<typeof chartColors>;

const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Cartesian axis styling (category or value). */
export function axis(
  c: ChartColors,
  opts: { name?: string; type?: 'value' | 'category' | 'log' | 'time'; nameGap?: number } = {}
) {
  return {
    type: opts.type ?? 'value',
    name: opts.name,
    nameLocation: 'middle' as const,
    nameGap: opts.nameGap ?? 34,
    nameTextStyle: { color: c.subtext, fontSize: 12, fontWeight: 600, fontFamily: FONT_FAMILY },
    axisLine: { lineStyle: { color: c.axis } },
    axisTick: { lineStyle: { color: c.axis } },
    axisLabel: { color: c.subtext, fontSize: 11, fontFamily: FONT_FAMILY, hideOverlap: true },
    splitLine: { lineStyle: { color: c.grid, type: 'dashed' as const, opacity: 0.6 } },
  };
}

/** Tooltip styling shared by all charts. */
export function tooltip(c: ChartColors, extra: Record<string, unknown> = {}) {
  return {
    backgroundColor: c.tooltipBg,
    borderColor: c.tooltipBorder,
    borderWidth: 1,
    textStyle: { color: c.text, fontSize: 12, fontFamily: FONT_FAMILY },
    extraCssText: 'backdrop-filter: blur(6px); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.18);',
    ...extra,
  };
}

/**
 * Polished tooltip HTML builders for a consistent, professional look across charts:
 * a bold header with a hairline separator, rows with a colour marker + tabular-aligned
 * values, and an optional coloured note/badge line.
 */
export function ttHeader(c: ChartColors, title: string): string {
  return `<div style="font-weight:600;font-size:12px;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid ${c.tooltipBorder};color:${c.text}">${title}</div>`;
}
export function ttRow(c: ChartColors, label: string, value: string, color?: string): string {
  const marker = color
    ? `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};margin-right:7px;vertical-align:middle"></span>`
    : '';
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:20px;line-height:1.65;font-size:12px"><span style="color:${c.subtext}">${marker}${label}</span><span style="color:${c.text};font-weight:600;font-variant-numeric:tabular-nums">${value}</span></div>`;
}
export function ttBadge(c: ChartColors, text: string, color: string): string {
  return `<div style="margin-top:6px"><span style="display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.02em;padding:1px 7px;border-radius:9999px;color:${color};background:${color}22;border:1px solid ${color}55">${text}</span></div>`;
}

/** Legend styling. */
export function legend(c: ChartColors, extra: Record<string, unknown> = {}) {
  return {
    textStyle: { color: c.subtext, fontSize: 11, fontFamily: FONT_FAMILY },
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 8,
    ...extra,
  };
}

/** Sensible default plot area. */
export function grid(extra: Record<string, unknown> = {}) {
  return { left: 56, right: 24, top: 32, bottom: 48, containLabel: true, ...extra };
}

/**
 * Global base applied by <EChart> on top of every chart option: font colours,
 * smooth animation, and the shared categorical palette.
 */
export function baseOption(c: ChartColors): EChartsOption {
  // Image/data export is provided by the shared <EChart> export menu,
  // not the in-chart ECharts toolbox, so no toolbox is configured here.
  return {
    color: c.series, // default categorical palette for multi-series charts
    textStyle: { color: c.text, fontFamily: FONT_FAMILY },
    animationDuration: 450,
    animationEasing: 'cubicOut',
  } as EChartsOption;
}
