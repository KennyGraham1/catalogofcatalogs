'use client';

import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDepth, formatMagnitudeType, formatOriginTimeUtc } from '@/lib/map-format';
import { formatSeparation, separationFrom } from './duplicate-group-style';
import { publishedSolution, type PreviewEntry, type PreviewGroup } from './qc-format';

/** One block of rows: a group's entries, optionally under a row-group heading. */
export interface QcEntrySection {
  group: PreviewGroup;
  heading?: ReactNode;
}

interface QcEntryTableProps {
  sections: QcEntrySection[];
  catalogueColors: Record<string, string>;
  /** Accessible name of the table. */
  caption: string;
}

const COLUMN_COUNT = 11;

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function magnitudeText(entry: PreviewEntry): string {
  if (!isNum(entry.magnitude)) return '–';
  const type = formatMagnitudeType(entry.magnitude_type) || 'M';
  return `${type} ${entry.magnitude.toFixed(2)}`;
}

const HEAD = 'px-2 py-2 text-left align-bottom font-medium text-muted-foreground whitespace-nowrap';
const HEAD_NUM = `${HEAD} text-right`;
const CELL = 'px-2 py-2 align-top';
const CELL_NUM = `${CELL} text-right tabular-nums whitespace-nowrap`;

/**
 * The entries of one matched group, or of the groups a failed cluster was split into (one
 * row group per published event): catalogue, origin time (UTC), epicentre, depth, magnitude,
 * quality score Q, station count, azimuthal gap, offset from the published solution, and
 * which solution is published.
 */
export function QcEntryTable({ sections, catalogueColors, caption }: QcEntryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className={HEAD}>Catalogue</th>
            <th scope="col" className={HEAD}>Origin time (UTC)</th>
            <th scope="col" className={HEAD_NUM}>Lat (°)</th>
            <th scope="col" className={HEAD_NUM}>Lon (°)</th>
            <th scope="col" className={HEAD_NUM}>Depth</th>
            <th scope="col" className={HEAD_NUM}>Magnitude</th>
            <th scope="col" className={HEAD_NUM}><abbr title="Quality score, 0-100" className="no-underline">Q</abbr></th>
            <th scope="col" className={HEAD_NUM}>Stations</th>
            <th scope="col" className={HEAD_NUM}>Az. gap</th>
            <th scope="col" className={HEAD}>Offset from published</th>
            <th scope="col" className={`${HEAD} text-center`}>Published</th>
          </tr>
        </thead>
        {sections.map(({ group, heading }) => {
          const superseded = new Set(group.supersededEventIndexes ?? []);
          const reference = publishedSolution(group);
          return (
            <tbody key={group.id} data-group-id={group.id}>
              {heading && (
                <tr className="border-b bg-muted/40">
                  <th scope="rowgroup" colSpan={COLUMN_COUNT} className="px-2 py-1.5 text-left font-medium">
                    {heading}
                  </th>
                </tr>
              )}
              {group.events.map((entry, index) => {
                const isPublished = index === group.selectedEventIndex;
                const isSuperseded = superseded.has(index);
                const offset = reference && !isPublished && !isSuperseded
                  ? formatSeparation(separationFrom(reference, entry))
                  : null;
                return (
                  <tr
                    key={`${entry.id ?? 'entry'}-${index}`}
                    data-superseded={isSuperseded ? 'true' : undefined}
                    data-published={isPublished ? 'true' : undefined}
                    className={`border-b ${isPublished ? 'bg-muted/60 font-medium' : ''} ${isSuperseded ? 'text-muted-foreground opacity-60' : ''}`}
                  >
                    <td className={`${CELL} min-w-[10rem] max-w-[18rem]`}>
                      <div className="flex items-start gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: catalogueColors[entry.catalogueId] || '#6b7280' }}
                        />
                        <span className="break-words">{entry.catalogueName || entry.catalogueId}</span>
                        {isSuperseded && (
                          <Badge
                            variant="outline"
                            className="px-1 py-0 text-[10px] font-normal"
                            title="An older vintage of this agency's solution; a newer one in the group replaces it"
                          >
                            superseded
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className={`${CELL} whitespace-nowrap tabular-nums`}>{formatOriginTimeUtc(entry.time)}</td>
                    <td className={CELL_NUM}>{isNum(entry.latitude) ? entry.latitude.toFixed(3) : '–'}</td>
                    <td className={CELL_NUM}>{isNum(entry.longitude) ? entry.longitude.toFixed(3) : '–'}</td>
                    <td className={CELL_NUM}>
                      {formatDepth({ depth: entry.depth, depth_uncertainty: entry.depth_uncertainty, depth_type: entry.depth_type }) ?? '–'}
                    </td>
                    <td className={CELL_NUM}>{magnitudeText(entry)}</td>
                    <td className={CELL_NUM}>{isNum(entry.quality_score) ? Math.round(entry.quality_score) : '–'}</td>
                    <td className={CELL_NUM}>{isNum(entry.used_station_count) ? entry.used_station_count : '–'}</td>
                    <td className={CELL_NUM}>{isNum(entry.azimuthal_gap) ? `${entry.azimuthal_gap.toFixed(0)}°` : '–'}</td>
                    <td className={`${CELL} whitespace-nowrap tabular-nums text-muted-foreground`}>{offset ?? '–'}</td>
                    <td className={`${CELL} text-center`}>
                      {isPublished && (
                        <>
                          <CheckCircle2 className="inline h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Published</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {reference?.computed && (
                <tr className="border-b bg-muted/60 font-medium" data-computed-epicentre="true">
                  <td className={`${CELL} italic`}>Computed epicentre</td>
                  <td className={`${CELL} whitespace-nowrap tabular-nums`}>{formatOriginTimeUtc(reference.time)}</td>
                  <td className={CELL_NUM}>{reference.latitude.toFixed(3)}</td>
                  <td className={CELL_NUM}>{reference.longitude.toFixed(3)}</td>
                  <td className={`${CELL} text-right text-muted-foreground`} colSpan={5}>
                    Depth and magnitude are selected from the entries
                  </td>
                  <td className={`${CELL} text-muted-foreground`}>–</td>
                  <td className={`${CELL} text-center`}>
                    <CheckCircle2 className="inline h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Published</span>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
