'use client';

/**
 * Geophysically correct focal-mechanism beach ball (double-couple).
 *
 * Renders the lower-hemisphere equal-area projection computed in
 * lib/focal-mechanism-utils (radiation-sign shading + nodal great circles +
 * P/T axes). Theme-aware; reused by the FocalMechanismCard. Leaflet markers use
 * the string variant (generateBeachBallSVG / generateBeachBallDataURL).
 */

import { useId, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { computeBeachball, type FocalMechanism } from '@/lib/focal-mechanism-utils';

/**
 * Beach-ball colours, shared by the ball and its legend so the two cannot disagree:
 * the compressional quadrants are filled, the dilatational ones show the background.
 */
export function beachballPalette(isDark: boolean): { fill: string; background: string; stroke: string } {
  return {
    fill: '#2563eb', // compressional (blue) — professional, legible in both themes
    background: isDark ? '#0b1220' : '#ffffff',
    stroke: isDark ? '#e5e7eb' : '#0f172a',
  };
}

export function Beachball({
  mechanism,
  size = 200,
  showAxes = true,
  className,
}: {
  mechanism: FocalMechanism;
  size?: number;
  showAxes?: boolean;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const clipId = useId();
  const g = useMemo(() => computeBeachball(mechanism, size), [mechanism, size]);
  if (!g) return null;

  const { fill, background, stroke } = beachballPalette(isDark);
  const axisR = g.radius * 0.07;

  return (
    <svg
      width={g.size}
      height={g.size}
      viewBox={`0 0 ${g.size} ${g.size}`}
      className={className}
      role="img"
      aria-label="Focal mechanism beach ball (lower-hemisphere equal-area projection)"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={g.center} cy={g.center} r={g.radius} />
        </clipPath>
      </defs>
      <circle cx={g.center} cy={g.center} r={g.radius} fill={background} />
      <g clipPath={`url(#${clipId})`}>
        <path d={g.compressionalPath} fill={fill} />
        {g.nodalPaths.map((p, i) => (
          <path key={i} d={p} fill="none" stroke={stroke} strokeWidth={Math.max(1, g.radius * 0.018)} strokeLinecap="round" />
        ))}
      </g>
      <circle cx={g.center} cy={g.center} r={g.radius} fill="none" stroke={stroke} strokeWidth={Math.max(1.5, g.radius * 0.022)} />
      {showAxes && (
        <>
          <circle cx={g.tAxis.x} cy={g.tAxis.y} r={axisR} fill={background} stroke={stroke} />
          <text x={g.tAxis.x} y={g.tAxis.y + g.radius * 0.045} fontSize={g.radius * 0.13} textAnchor="middle" fill={stroke} fontWeight={700}>T</text>
          <circle cx={g.pAxis.x} cy={g.pAxis.y} r={axisR} fill={fill} stroke={stroke} />
          <text x={g.pAxis.x} y={g.pAxis.y + g.radius * 0.045} fontSize={g.radius * 0.13} textAnchor="middle" fill="#ffffff" fontWeight={700}>P</text>
        </>
      )}
    </svg>
  );
}

/**
 * Legend for Beachball, drawn in the ball's own colours. The shaded quadrants are
 * compressional (first motion up) and contain the T (tension) axis; the unshaded ones
 * are dilatational (first motion down) and contain the P (pressure) axis (Aki &
 * Richards 1980; Stein & Wysession 2003, sec. 4.2).
 */
export function BeachballLegend({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const { fill, background, stroke } = beachballPalette(resolvedTheme === 'dark');
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded border" style={{ backgroundColor: fill, borderColor: stroke }} aria-hidden="true"></div>
        <span>Compressional (shaded, contains T)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded border" style={{ backgroundColor: background, borderColor: stroke }} aria-hidden="true"></div>
        <span>Dilatational (unshaded, contains P)</span>
      </div>
    </div>
  );
}

export default Beachball;
