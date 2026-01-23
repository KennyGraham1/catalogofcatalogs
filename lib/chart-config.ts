/**
 * Professional chart configuration for seismological visualizations
 * Provides consistent theming, colors, and styling across all charts
 */

import type { ChartConfig } from '@/components/ui/chart';

// Professional seismology color palette
// Based on scientific visualization best practices and accessibility guidelines
export const SEISMIC_COLORS = {
  // Primary colors for main data series
  magnitude: {
    light: '#2563eb', // Blue-600
    dark: '#3b82f6',  // Blue-500
  },
  depth: {
    light: '#059669', // Emerald-600
    dark: '#10b981',  // Emerald-500
  },
  frequency: {
    light: '#7c3aed', // Violet-600
    dark: '#8b5cf6',  // Violet-500
  },
  time: {
    light: '#0891b2', // Cyan-600
    dark: '#06b6d4',  // Cyan-500
  },
  energy: {
    light: '#dc2626', // Red-600
    dark: '#ef4444',  // Red-500
  },

  // Secondary colors for additional series
  secondary: {
    light: '#ea580c', // Orange-600
    dark: '#f97316',  // Orange-500
  },
  tertiary: {
    light: '#ca8a04', // Yellow-600
    dark: '#eab308',  // Yellow-500
  },

  // Reference lines and annotations
  reference: {
    light: '#dc2626', // Red for Mc, completeness lines
    dark: '#ef4444',
  },
  fit: {
    light: '#16a34a', // Green for fitted lines
    dark: '#22c55e',
  },

  // Grid and axis colors
  grid: {
    light: '#e5e7eb', // Gray-200
    dark: '#374151',  // Gray-700
  },
  axis: {
    light: '#6b7280', // Gray-500
    dark: '#9ca3af',  // Gray-400
  },

  // Quality grade colors
  grades: {
    'A+': '#059669',
    'A': '#10b981',
    'B': '#3b82f6',
    'C': '#f59e0b',
    'D': '#f97316',
    'F': '#ef4444',
  },
} as const;

// Categorical color palette for multiple series (accessible)
export const CATEGORICAL_COLORS = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#7c3aed', // Violet
  '#ea580c', // Orange
  '#0891b2', // Cyan
  '#ca8a04', // Yellow
  '#dc2626', // Red
  '#8b5cf6', // Light violet
  '#10b981', // Light emerald
  '#f97316', // Light orange
] as const;

// Magnitude-based color scale (sequential)
export const MAGNITUDE_COLOR_SCALE = [
  { threshold: 2.0, color: '#22c55e' },  // Green - Minor
  { threshold: 3.0, color: '#84cc16' },  // Lime
  { threshold: 4.0, color: '#eab308' },  // Yellow - Light
  { threshold: 5.0, color: '#f97316' },  // Orange - Moderate
  { threshold: 6.0, color: '#ef4444' },  // Red - Strong
  { threshold: 7.0, color: '#dc2626' },  // Dark red - Major
  { threshold: 10.0, color: '#7f1d1d' }, // Very dark red - Great
] as const;

// Depth-based color scale (sequential)
export const DEPTH_COLOR_SCALE = [
  { threshold: 10, color: '#fef3c7' },   // Shallow - Light amber
  { threshold: 30, color: '#fcd34d' },   // Amber
  { threshold: 70, color: '#f59e0b' },   // Orange
  { threshold: 150, color: '#ea580c' },  // Deep orange
  { threshold: 300, color: '#dc2626' },  // Red
  { threshold: 700, color: '#7f1d1d' },  // Very deep - Dark red
] as const;

// Chart styling constants
export const CHART_STYLES = {
  // Responsive font sizes
  fontSize: {
    tick: 11,
    label: 12,
    title: 14,
    axis: 12,
  },

  // Spacing and margins
  margin: {
    compact: { top: 10, right: 10, left: 10, bottom: 10 },
    default: { top: 20, right: 30, left: 20, bottom: 20 },
    withLabels: { top: 20, right: 30, left: 60, bottom: 60 },
  },

  // Bar chart styling
  bar: {
    radius: [4, 4, 0, 0] as [number, number, number, number],
    radiusHorizontal: [0, 4, 4, 0] as [number, number, number, number],
  },

  // Line chart styling
  line: {
    strokeWidth: 2,
    activeDotRadius: 6,
    dotRadius: 3,
  },

  // Scatter chart styling
  scatter: {
    opacity: 0.7,
    strokeWidth: 1,
  },

  // Grid styling
  grid: {
    strokeDasharray: '3 3',
    opacity: 0.6,
  },

  // Animation
  animation: {
    duration: 300,
    easing: 'ease-out',
  },
} as const;

// Pre-defined chart configurations for common use cases
export const CHART_CONFIGS = {
  magnitudeDistribution: {
    count: {
      label: 'Event Count',
      theme: {
        light: SEISMIC_COLORS.magnitude.light,
        dark: SEISMIC_COLORS.magnitude.dark,
      },
    },
  } satisfies ChartConfig,

  depthDistribution: {
    count: {
      label: 'Event Count',
      theme: {
        light: SEISMIC_COLORS.depth.light,
        dark: SEISMIC_COLORS.depth.dark,
      },
    },
  } satisfies ChartConfig,

  gutenbergRichter: {
    observed: {
      label: 'Observed',
      theme: {
        light: SEISMIC_COLORS.magnitude.light,
        dark: SEISMIC_COLORS.magnitude.dark,
      },
    },
    fitted: {
      label: 'G-R Fit',
      theme: {
        light: SEISMIC_COLORS.fit.light,
        dark: SEISMIC_COLORS.fit.dark,
      },
    },
  } satisfies ChartConfig,

  completeness: {
    count: {
      label: 'Event Count',
      theme: {
        light: SEISMIC_COLORS.frequency.light,
        dark: SEISMIC_COLORS.frequency.dark,
      },
    },
  } satisfies ChartConfig,

  temporal: {
    cumulativeCount: {
      label: 'Cumulative Events',
      theme: {
        light: SEISMIC_COLORS.time.light,
        dark: SEISMIC_COLORS.time.dark,
      },
    },
    dailyCount: {
      label: 'Daily Events',
      theme: {
        light: SEISMIC_COLORS.secondary.light,
        dark: SEISMIC_COLORS.secondary.dark,
      },
    },
  } satisfies ChartConfig,

  moment: {
    moment: {
      label: 'Seismic Moment',
      theme: {
        light: SEISMIC_COLORS.energy.light,
        dark: SEISMIC_COLORS.energy.dark,
      },
    },
    cumulativeMoment: {
      label: 'Cumulative Moment',
      theme: {
        light: SEISMIC_COLORS.energy.light,
        dark: SEISMIC_COLORS.energy.dark,
      },
    },
  } satisfies ChartConfig,

  magnitudeDepth: {
    events: {
      label: 'Earthquakes',
      theme: {
        light: SEISMIC_COLORS.frequency.light,
        dark: SEISMIC_COLORS.frequency.dark,
      },
    },
  } satisfies ChartConfig,

  timeline: {
    count: {
      label: 'Events',
      theme: {
        light: SEISMIC_COLORS.time.light,
        dark: SEISMIC_COLORS.time.dark,
      },
    },
  } satisfies ChartConfig,

  region: {
    count: {
      label: 'Events',
      theme: {
        light: SEISMIC_COLORS.secondary.light,
        dark: SEISMIC_COLORS.secondary.dark,
      },
    },
  } satisfies ChartConfig,

  mfd: {
    count: {
      label: 'Number of Events',
      theme: {
        light: SEISMIC_COLORS.frequency.light,
        dark: SEISMIC_COLORS.frequency.dark,
      },
    },
    cumulative: {
      label: 'Cumulative Count (N≥M)',
      theme: {
        light: SEISMIC_COLORS.magnitude.light,
        dark: SEISMIC_COLORS.magnitude.dark,
      },
    },
  } satisfies ChartConfig,
} as const;

// Extended color palette for multiple catalogues in MFD comparison
export const MFD_CATALOGUE_COLORS = [
  '#2563eb', // Blue
  '#7c3aed', // Violet
  '#059669', // Emerald
  '#ea580c', // Orange
  '#0891b2', // Cyan
  '#dc2626', // Red
  '#84cc16', // Lime
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#a855f7', // Purple
] as const;

// Tooltip formatters
export const TOOLTIP_FORMATTERS = {
  magnitude: (value: number) => `M${value.toFixed(1)}`,
  depth: (value: number) => `${value.toFixed(1)} km`,
  count: (value: number) => value.toLocaleString(),
  percentage: (value: number) => `${value.toFixed(1)}%`,
  moment: (value: number) => `${value.toExponential(2)} N·m`,
  date: (value: string) => new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
  dateTime: (value: string) => new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
};

// Axis label formatters
export const AXIS_FORMATTERS = {
  magnitude: (value: number) => `M${value}`,
  depth: (value: number) => `${value} km`,
  log: (value: number) => value.toExponential(0),
  compact: (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  },
  date: (value: string) => new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
};

// Get color for magnitude value
export function getMagnitudeColor(magnitude: number): string {
  for (const { threshold, color } of MAGNITUDE_COLOR_SCALE) {
    if (magnitude < threshold) return color;
  }
  return MAGNITUDE_COLOR_SCALE[MAGNITUDE_COLOR_SCALE.length - 1].color;
}

// Get color for depth value
export function getDepthColor(depth: number): string {
  for (const { threshold, color } of DEPTH_COLOR_SCALE) {
    if (depth < threshold) return color;
  }
  return DEPTH_COLOR_SCALE[DEPTH_COLOR_SCALE.length - 1].color;
}

// Get color for quality grade
export function getGradeColor(grade: string): string {
  return SEISMIC_COLORS.grades[grade as keyof typeof SEISMIC_COLORS.grades] || '#6b7280';
}

// Custom tick component for professional styling
export const customTickStyle = {
  fontSize: CHART_STYLES.fontSize.tick,
  fill: 'currentColor',
  fontFamily: 'inherit',
};

// Professional axis label style
export const axisLabelStyle = {
  fontSize: CHART_STYLES.fontSize.label,
  fill: 'currentColor',
  fontWeight: 500,
};

// Chart export utilities
export async function exportChartAsSVG(chartElement: HTMLElement, filename: string): Promise<void> {
  const svgElement = chartElement.querySelector('svg');
  if (!svgElement) return;

  // Clone the SVG to avoid modifying the original
  const clonedSvg = svgElement.cloneNode(true) as SVGElement;

  // Add white background for better export
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', 'white');
  clonedSvg.insertBefore(rect, clonedSvg.firstChild);

  const svgData = new XMLSerializer().serializeToString(clonedSvg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${filename}.svg`);
}

export async function exportChartAsPNG(chartElement: HTMLElement, filename: string, scale = 2): Promise<void> {
  const svgElement = chartElement.querySelector('svg');
  if (!svgElement) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const svgData = new XMLSerializer().serializeToString(svgElement);
  const img = new window.Image();

  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve) => {
    img.onload = () => {
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      // White background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${filename}.png`);
        }
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    };
    img.src = url;
  });
}

export function exportDataAsJSON<T>(data: T, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlob(blob, `${filename}.json`);
}

export function exportDataAsCSV(data: Record<string, unknown>[], filename: string): void {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape strings with commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value ?? '');
      }).join(',')
    )
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${filename}.csv`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
