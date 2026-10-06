'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  AGENCY_KEYS,
  DEFAULT_MERGE_AUTHORITY,
  parseMergeAuthorityTable,
  type AgencyKey,
  type MergeAuthorityTable,
} from '@/lib/merge-authority-table';

/**
 * The form keeps every field as text while it is being typed (a half-typed "-17" or an
 * emptied priority must not snap to a number or vanish), and parseMergeAuthorityTable —
 * the same validator the API applies — turns the draft back into a table on save.
 */
interface HierarchyDraft {
  key: number;
  patterns: string;
  priority: string;
  agency: AgencyKey | '';
  description: string;
  region: string;
}

interface RegionEntryDraft {
  key: number;
  patterns: string;
  priority: string;
  agency: AgencyKey | '';
}

interface RegionDraft {
  key: number;
  name: string;
  minLat: string;
  maxLat: string;
  minLon: string;
  maxLon: string;
  hierarchy: RegionEntryDraft[];
}

interface Draft {
  hierarchy: HierarchyDraft[];
  regions: RegionDraft[];
}

let nextKey = 1;
const key = () => nextKey++;

function toDraft(table: Pick<MergeAuthorityTable, 'hierarchy' | 'regions'>): Draft {
  return {
    hierarchy: table.hierarchy.map(entry => ({
      key: key(),
      patterns: entry.patterns.join(', '),
      priority: String(entry.priority),
      agency: entry.agency ?? '',
      description: entry.description ?? '',
      region: entry.region ?? '',
    })),
    regions: table.regions.map(region => ({
      key: key(),
      name: region.name,
      minLat: String(region.bounds.minLat),
      maxLat: String(region.bounds.maxLat),
      minLon: String(region.bounds.minLon),
      maxLon: String(region.bounds.maxLon),
      hierarchy: region.hierarchy.map(entry => ({
        key: key(),
        patterns: entry.patterns.join(', '),
        priority: String(entry.priority),
        agency: entry.agency ?? '',
      })),
    })),
  };
}

/** Patterns are typed as a comma- or space-separated list. */
function splitPatterns(text: string): string[] {
  return text.split(/[\s,;]+/).map(p => p.trim()).filter(Boolean);
}

/** Numbers stay as typed so the validator (not the form) reports what is wrong with them. */
function toNumber(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : trimmed;
}

/** The submission body: the draft as typed, for the validator to judge. */
function fromDraft(draft: Draft): unknown {
  return {
    hierarchy: draft.hierarchy.map(entry => ({
      patterns: splitPatterns(entry.patterns),
      priority: toNumber(entry.priority),
      description: entry.description,
      ...(entry.region.trim() ? { region: entry.region.trim() } : {}),
      ...(entry.agency ? { agency: entry.agency } : {}),
    })),
    regions: draft.regions.map(region => ({
      name: region.name,
      bounds: {
        minLat: toNumber(region.minLat),
        maxLat: toNumber(region.maxLat),
        minLon: toNumber(region.minLon),
        maxLon: toNumber(region.maxLon),
      },
      hierarchy: region.hierarchy.map(entry => ({
        patterns: splitPatterns(entry.patterns),
        priority: toNumber(entry.priority),
        ...(entry.agency ? { agency: entry.agency } : {}),
      })),
    })),
  };
}

function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

interface MergeAuthoritySettingsProps {
  readOnly?: boolean;
}

export function MergeAuthoritySettings({ readOnly = false }: MergeAuthoritySettingsProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_MERGE_AUTHORITY));
  const [source, setSource] = useState<MergeAuthorityTable['source']>('default');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const applyTable = useCallback((table: MergeAuthorityTable) => {
    setDraft(toDraft(table));
    setSource(table.source);
    setUpdatedAt(table.updatedAt);
    setHasChanges(false);
    setValidationError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/settings/merge-authority');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const table = (await response.json()) as MergeAuthorityTable;
        if (!cancelled) applyTable(table);
      } catch (error) {
        console.error('Failed to load merge authority table:', error);
        if (!cancelled) applyTable(DEFAULT_MERGE_AUTHORITY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyTable]);

  const edit = (update: (draft: Draft) => Draft) => {
    if (readOnly) return;
    setDraft(prev => update(prev));
    setHasChanges(true);
    setValidationError(null);
  };

  const editHierarchy = (index: number, patch: Partial<HierarchyDraft>) =>
    edit(d => ({ ...d, hierarchy: d.hierarchy.map((e, i) => (i === index ? { ...e, ...patch } : e)) }));

  const editRegion = (index: number, patch: Partial<RegionDraft>) =>
    edit(d => ({ ...d, regions: d.regions.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));

  const editRegionEntry = (regionIndex: number, index: number, patch: Partial<RegionEntryDraft>) =>
    editRegion(regionIndex, {
      hierarchy: draft.regions[regionIndex].hierarchy.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    });

  const handleSave = async () => {
    if (readOnly) {
      toast({
        title: 'Admin access required',
        description: 'Log in with an Admin account to save settings.',
        variant: 'destructive',
      });
      return;
    }
    // Validate here with the API's own rules so the message points at the row instead of
    // a round trip ending in a generic failure.
    const parsed = parseMergeAuthorityTable(fromDraft(draft));
    if (!parsed.ok) {
      setValidationError(parsed.error);
      return;
    }
    try {
      setSaving(true);
      const response = await fetch('/api/settings/merge-authority', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hierarchy: parsed.table.hierarchy, regions: parsed.table.regions }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to save settings');
      }
      applyTable(body.table as MergeAuthorityTable);
      toast({ title: 'Settings saved', description: 'Merge authority table saved; new merges will use it.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      setValidationError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (readOnly) return;
    try {
      setSaving(true);
      const response = await fetch('/api/settings/merge-authority', { method: 'DELETE' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to reset settings');
      }
      applyTable((body?.table as MergeAuthorityTable | undefined) ?? DEFAULT_MERGE_AUTHORITY);
      toast({ title: 'Reset complete', description: 'Merge authority restored to the built-in table.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset settings';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" aria-label="Loading merge authority">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const agencySelect = (value: AgencyKey | '', onChange: (agency: AgencyKey | '') => void, label: string) => (
    <select
      aria-label={label}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      value={value}
      disabled={readOnly}
      onChange={e => onChange(e.target.value as AgencyKey | '')}
    >
      <option value="">(none)</option>
      {AGENCY_KEYS.map(agency => (
        <option key={agency} value={agency}>{agency}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-medium">Network authority</h3>
          <p className="text-sm text-muted-foreground">
            Which network&apos;s solution the merge prefers when the catalogues&apos; records of one earthquake tie on
            quality. Lower priority numbers rank higher; patterns are whole words matched against a
            source name (for example <code>geonet</code>, <code>gns</code>) or an agency code.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={source === 'custom' ? 'default' : 'secondary'}>
              {source === 'custom' ? 'Custom table' : 'Built-in default'}
            </Badge>
            {source === 'custom' && updatedAt && <span>Saved {new Date(updatedAt).toLocaleString()}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={readOnly || saving}>
                <RotateCcw className="h-4 w-4 mr-2" />Reset to defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset the merge authority table?</AlertDialogTitle>
                <AlertDialogDescription>
                  The custom table is deleted and merges rank networks by the built-in hierarchy
                  again. Merged catalogues already created are not changed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={handleSave} disabled={readOnly || saving || !hasChanges} size="sm">
            <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </div>

      {validationError && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      <div className={readOnly ? 'pointer-events-none opacity-60 space-y-6' : 'space-y-6'}>
        <section className="space-y-3" aria-label="Global hierarchy">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Global hierarchy</Label>
            <Button
              variant="outline"
              size="sm"
              disabled={readOnly}
              onClick={() =>
                edit(d => ({
                  ...d,
                  hierarchy: [
                    ...d.hierarchy,
                    { key: key(), patterns: '', priority: String(d.hierarchy.length + 1), agency: '', description: '', region: '' },
                  ],
                }))
              }
            >
              <Plus className="h-4 w-4 mr-1" />Add entry
            </Button>
          </div>
          <div className="space-y-2">
            {draft.hierarchy.map((entry, index) => (
              <div
                key={entry.key}
                className="grid grid-cols-1 gap-2 rounded-md border p-2 md:grid-cols-[1fr_5rem_7rem_1fr_4rem_auto]"
                data-testid={`hierarchy-row-${index}`}
              >
                <Input
                  aria-label={`Hierarchy ${index + 1} patterns`}
                  placeholder="patterns, comma separated"
                  value={entry.patterns}
                  disabled={readOnly}
                  onChange={e => editHierarchy(index, { patterns: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  aria-label={`Hierarchy ${index + 1} priority`}
                  type="number"
                  min={1}
                  max={1000}
                  value={entry.priority}
                  disabled={readOnly}
                  onChange={e => editHierarchy(index, { priority: e.target.value })}
                  className="h-8 text-xs"
                />
                {agencySelect(entry.agency, agency => editHierarchy(index, { agency }), `Hierarchy ${index + 1} agency`)}
                <Input
                  aria-label={`Hierarchy ${index + 1} description`}
                  placeholder="description"
                  value={entry.description}
                  disabled={readOnly}
                  onChange={e => editHierarchy(index, { description: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  aria-label={`Hierarchy ${index + 1} region`}
                  placeholder="region"
                  value={entry.region}
                  disabled={readOnly}
                  onChange={e => editHierarchy(index, { region: e.target.value })}
                  className="h-8 text-xs"
                />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Move hierarchy ${index + 1} up`}
                    disabled={readOnly || index === 0}
                    onClick={() => edit(d => ({ ...d, hierarchy: moveItem(d.hierarchy, index, -1) }))}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Move hierarchy ${index + 1} down`}
                    disabled={readOnly || index === draft.hierarchy.length - 1}
                    onClick={() => edit(d => ({ ...d, hierarchy: moveItem(d.hierarchy, index, 1) }))}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Remove hierarchy ${index + 1}`}
                    disabled={readOnly}
                    onClick={() => edit(d => ({ ...d, hierarchy: d.hierarchy.filter((_, i) => i !== index) }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3" aria-label="Regional overrides">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Regional overrides</Label>
              <p className="text-xs text-muted-foreground">
                Inside a region&apos;s bounds this order replaces the global hierarchy. Use a west
                edge east of the east edge (for example 165 to -175) for a box crossing 180°.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={readOnly}
              onClick={() =>
                edit(d => ({
                  ...d,
                  regions: [
                    ...d.regions,
                    {
                      key: key(),
                      name: '',
                      minLat: '',
                      maxLat: '',
                      minLon: '',
                      maxLon: '',
                      hierarchy: [{ key: key(), patterns: '', priority: '1', agency: '' }],
                    },
                  ],
                }))
              }
            >
              <Plus className="h-4 w-4 mr-1" />Add region
            </Button>
          </div>

          {draft.regions.length === 0 && (
            <p className="text-xs text-muted-foreground">No regional overrides; the global hierarchy applies everywhere.</p>
          )}

          <div className="space-y-4">
            {draft.regions.map((region, regionIndex) => (
              <div key={region.key} className="space-y-3 rounded-md border p-3" data-testid={`region-${regionIndex}`}>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_repeat(4,5rem)_auto]">
                  <Input
                    aria-label={`Region ${regionIndex + 1} name`}
                    placeholder="name"
                    value={region.name}
                    disabled={readOnly}
                    onChange={e => editRegion(regionIndex, { name: e.target.value })}
                    className="h-8 text-xs"
                  />
                  {(['minLat', 'maxLat', 'minLon', 'maxLon'] as const).map(field => (
                    <Input
                      key={field}
                      aria-label={`Region ${regionIndex + 1} ${field}`}
                      placeholder={field}
                      type="number"
                      step="any"
                      value={region[field]}
                      disabled={readOnly}
                      onChange={e => editRegion(regionIndex, { [field]: e.target.value })}
                      className="h-8 text-xs"
                    />
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Remove region ${regionIndex + 1}`}
                    disabled={readOnly}
                    onClick={() => edit(d => ({ ...d, regions: d.regions.filter((_, i) => i !== regionIndex) }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2 pl-2 border-l-2">
                  {region.hierarchy.map((entry, index) => (
                    <div key={entry.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_5rem_7rem_auto]">
                      <Input
                        aria-label={`Region ${regionIndex + 1} entry ${index + 1} patterns`}
                        placeholder="patterns, comma separated"
                        value={entry.patterns}
                        disabled={readOnly}
                        onChange={e => editRegionEntry(regionIndex, index, { patterns: e.target.value })}
                        className="h-8 text-xs"
                      />
                      <Input
                        aria-label={`Region ${regionIndex + 1} entry ${index + 1} priority`}
                        type="number"
                        min={1}
                        max={1000}
                        value={entry.priority}
                        disabled={readOnly}
                        onChange={e => editRegionEntry(regionIndex, index, { priority: e.target.value })}
                        className="h-8 text-xs"
                      />
                      {agencySelect(
                        entry.agency,
                        agency => editRegionEntry(regionIndex, index, { agency }),
                        `Region ${regionIndex + 1} entry ${index + 1} agency`,
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Move region ${regionIndex + 1} entry ${index + 1} up`}
                          disabled={readOnly || index === 0}
                          onClick={() => editRegion(regionIndex, { hierarchy: moveItem(region.hierarchy, index, -1) })}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Move region ${regionIndex + 1} entry ${index + 1} down`}
                          disabled={readOnly || index === region.hierarchy.length - 1}
                          onClick={() => editRegion(regionIndex, { hierarchy: moveItem(region.hierarchy, index, 1) })}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Remove region ${regionIndex + 1} entry ${index + 1}`}
                          disabled={readOnly}
                          onClick={() =>
                            editRegion(regionIndex, { hierarchy: region.hierarchy.filter((_, i) => i !== index) })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={readOnly}
                    onClick={() =>
                      editRegion(regionIndex, {
                        hierarchy: [
                          ...region.hierarchy,
                          { key: key(), patterns: '', priority: String(region.hierarchy.length + 1), agency: '' },
                        ],
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />Add entry
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
