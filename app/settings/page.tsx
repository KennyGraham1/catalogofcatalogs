'use client';

import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DefaultFieldMappings } from '@/components/settings/DefaultFieldMappings';
import { MergeAuthoritySettings } from '@/components/settings/MergeAuthoritySettings';
import { useAuth } from '@/lib/auth/hooks';
import { UserRole } from '@/lib/auth/types';
import { AzimuthalGapColorBar, DepthColorBar, MagnitudeSizeKey, QualityColorKey } from '@/components/map/MapLegend';
import { Settings, Database, Map, Lock, GitMerge } from 'lucide-react';

/**
 * gc#5: this page used to offer 16 General/Visualization/Advanced controls (batch
 * size, cache limit, map provider, an "External Data Fetch Interval", a "Custom
 * Python script to run after catalogue processing", ...) that were written to
 * localStorage and read back only to refill the same form — nothing else in the app
 * (server or client) ever consulted them, so "Settings saved" was a placebo, and
 * admin-only gating implied an app-wide effect none of them had. A post-processing
 * script setting in particular would mean running arbitrary user-supplied code on
 * the server, which this app must never do.
 *
 * Only two things on the old page had a real effect: the theme toggle (next-themes)
 * and the embedded schema mapping panel (its own working save via
 * /api/settings/field-mappings). Both are kept below. Everything else is removed
 * rather than kept disabled: none of it has a reachable implementation in the files
 * this page can call into, so a "coming soon" placeholder would just be a second
 * kind of dead control. See the fix log / final report "Doc/paper updates needed"
 * for which documented settings this removes.
 *
 * The old "Magnitude Color Scale" legend is replaced by a live reference that reuses
 * the exact colour functions and legend components the maps render with
 * (lib/earthquake-utils.ts, components/map/MapLegend.tsx), so it cannot drift from
 * what a map actually shows the way the old hard-coded swatches had.
 */
export default function SettingsPage() {
  const { user } = useAuth();
  const canManageSettings = user?.role === UserRole.ADMIN;
  const isReadOnly = !canManageSettings;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="container py-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage application settings and preferences
          </p>
        </div>

        {isReadOnly && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <Lock className="h-4 w-4" />
            <AlertTitle>View-only settings</AlertTitle>
            <AlertDescription>
              Only administrators can change schema mapping and merge authority settings. Log in with an Admin account to make updates.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="schema">Schema Mapping</TabsTrigger>
            <TabsTrigger value="merge">Merge Authority</TabsTrigger>
            <TabsTrigger value="visualization">Visualization Reference</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  General Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  Interface preferences stored in this browser
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="flex items-center gap-2">
                    <ThemeToggle disabled={isReadOnly} />
                    <span className="text-sm text-muted-foreground">
                      Select your preferred theme
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schema" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Schema Mapping Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure default schema mappings for different file formats
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DefaultFieldMappings readOnly={isReadOnly} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="merge" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitMerge className="h-4 w-4" />
                  Merge authority
                </CardTitle>
                <CardDescription className="text-xs">
                  The network hierarchy and regional overrides catalogue merging uses to rank
                  reports of one earthquake (applied to new merges and previews)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MergeAuthoritySettings readOnly={isReadOnly} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="visualization" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Map className="h-4 w-4" />
                  Map Colour Reference
                </CardTitle>
                <CardDescription className="text-xs">
                  How the catalogue and analytics maps colour events, read live from the same
                  colour functions the maps call — not an editable setting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="max-w-[260px] space-y-2 text-xs">
                    <Label>Marker size: magnitude</Label>
                    <MagnitudeSizeKey isDark={isDark} />
                    <p className="text-muted-foreground">
                      Magnitude is always encoded by marker size, never by colour.
                    </p>
                  </div>

                  <div className="max-w-[260px] space-y-2 text-xs">
                    <Label>Colour: depth (default)</Label>
                    <DepthColorBar isDark={isDark} />
                  </div>

                  <div className="max-w-[260px] space-y-2 text-xs">
                    <Label>Colour: location quality (Q)</Label>
                    <QualityColorKey />
                  </div>

                  <div className="max-w-[260px] space-y-2 text-xs">
                    <Label>Colour: azimuthal gap</Label>
                    <AzimuthalGapColorBar />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Charts (magnitude histograms, frequency-magnitude plots) use a separate
                  scale (lib/chart-config.ts) and do not follow the map colours above.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
