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

  const fill = '#2563eb'; // compressional (blue) — professional, legible in both themes
  const background = isDark ? '#0b1220' : '#ffffff';
  const stroke = isDark ? '#e5e7eb' : '#0f172a';
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

export default Beachball;
