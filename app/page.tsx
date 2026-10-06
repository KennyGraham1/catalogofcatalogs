'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Database, Upload, Layers, BarChart, Globe, Activity, TrendingUp, Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { hasCatalogueData } from '@/contexts/catalogue-load-status';
import { CatalogueLoadNotice, UnavailableValue } from '@/components/catalogues/CatalogueLoadNotice';
import { useAuth } from '@/lib/auth/hooks';
import { UserRole } from '@/lib/auth/types';
import { loginHref } from '@/lib/auth/login-href';
import { REQUEST_ACCESS_PATH } from '@/lib/auth/access-request';

export default function Home() {
  // Read from the shared CatalogueProvider (mounted in components/layout/Layout.tsx)
  // instead of fetching independently: a second, uncached fetch on every landing-page
  // load was redundant, and it never saw a mutation invalidated elsewhere (gc#0). The
  // provider's own stats also exclude merge outputs from the event total (gc#3) — see
  // contexts/CatalogueContext.tsx calculateStats — so "Earthquake Events" here no
  // longer counts a merged catalogue's events on top of its sources.
  const { stats, status, error, lastSuccessAt, retry, loading } = useCatalogues();
  const totalsAvailable = hasCatalogueData(status);

  // Uploading needs Editor access (app/upload/page.tsx, requireEditor on the API), and a
  // new account is a Viewer, so the upload entry is offered only to roles that can use it.
  const { user, isLoading: authLoading } = useAuth();
  const canUpload = user?.role === UserRole.EDITOR || user?.role === UserRole.ADMIN;
  const uploadLoginHref = loginHref('/upload');

  const features = [
    {
      icon: Upload,
      title: 'Multi-format Upload',
      description: 'Support for CSV, TXT, QML, JSON, and XML earthquake catalogue formats.',
      href: '/upload',
      editorOnly: true,
    },
    {
      icon: Database,
      title: 'Schema Normalization',
      description: 'Automatically map field names from different formats to a standardized schema.',
      href: '/settings',
      editorOnly: false,
    },
    {
      icon: Layers,
      title: 'Catalogue Merging',
      description: 'Merge catalogues using configurable rules for matching events by time and location.',
      href: '/merge',
      editorOnly: true,
    },
    {
      icon: BarChart,
      title: 'Data Visualization',
      description: 'Visualize earthquake data with interactive maps and charts.',
      href: '/analytics',
      editorOnly: false,
    }
  ];

  const statsItems = [
    {
      icon: Database,
      label: 'Catalogues',
      value: stats.totalCatalogues,
      isText: false,
    },
    {
      icon: Activity,
      label: 'Earthquake Events',
      value: stats.totalEvents,
      isText: false,
    },
    {
      icon: Globe,
      label: 'Coverage',
      value: 'New Zealand',
      isText: true,
    },
  ];

  // What a signed-out visitor or a Viewer sees in place of the upload button.
  const uploadExplanation = user ? (
    <p className="text-sm text-muted-foreground max-w-[520px]">
      <Lock className="inline h-4 w-4 mr-1 align-text-bottom" aria-hidden="true" />
      Uploading catalogues requires Editor access. Your account has {user.role === UserRole.VIEWER ? 'Viewer' : 'read-only'} access.{' '}
      <Link href={REQUEST_ACCESS_PATH} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
        Request Editor access
      </Link>
    </p>
  ) : (
    <p className="text-sm text-muted-foreground max-w-[520px]">
      <Lock className="inline h-4 w-4 mr-1 align-text-bottom" aria-hidden="true" />
      Uploading catalogues requires an account with Editor access.{' '}
      <Link href={uploadLoginHref} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
        Sign in to upload
      </Link>
      . New accounts start with Viewer access, which can browse and export catalogues.
    </p>
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-20 md:py-32 bg-gradient-to-br from-background via-background to-muted relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative">
          <div className="flex flex-col items-center justify-center text-center space-y-6 md:space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-2">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                Open-access earthquake data platform
              </div>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Earthquake Catalogue Integration Platform
              </h1>
              <p className="text-xl text-muted-foreground max-w-[700px] mx-auto">
                A comprehensive solution for researchers and agencies to upload, validate, parse, and store earthquake catalogues.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Browsing needs no account, so it is the main way in for every visitor. */}
              <Button asChild size="lg" className="shadow-lg hover:shadow-xl transition-shadow">
                <Link href="/catalogues">
                  Browse catalogues
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard">
                  View dashboard
                </Link>
              </Button>
              {canUpload && (
                <Button asChild variant="outline" size="lg">
                  <Link href="/upload">
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                    Upload a catalogue
                  </Link>
                </Button>
              )}
            </div>
            {!authLoading && !canUpload && uploadExplanation}
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="py-8 md:py-12 bg-muted/50 border-y" aria-labelledby="landing-totals-heading">
        <div className="container mx-auto px-4 md:px-6 space-y-6">
          <h2 id="landing-totals-heading" className="sr-only">Catalogue totals</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {statsItems.map((stat, index) => (
              <div
                key={index}
                className="flex items-center justify-center gap-4 p-4"
              >
                <div className="p-3 rounded-full bg-primary/10">
                  <stat.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div>
                  {!stat.isText && status === 'loading' ? (
                    <Skeleton className="h-8 w-20 mb-1" />
                  ) : (
                    <p className="text-2xl md:text-3xl font-bold" data-stat-value>
                      {stat.isText
                        ? stat.value
                        : totalsAvailable
                          ? (stat.value as number).toLocaleString()
                          : <UnavailableValue />}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
          <CatalogueLoadNotice
            status={status}
            error={error}
            lastSuccessAt={lastSuccessAt}
            onRetry={retry}
            retrying={loading}
            unavailable="Catalogue and event totals"
            className="max-w-3xl mx-auto"
          />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-card">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter">Key Features</h2>
            <p className="text-muted-foreground mt-2 text-lg">
              Tools for earthquake data management
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const restricted = feature.editorOnly && !authLoading && !canUpload;
              return (
                <Link
                  key={index}
                  href={feature.href}
                  className="group flex flex-col items-center p-6 bg-background rounded-lg border transition-all duration-300 hover:shadow-lg hover:border-primary/50 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={restricted ? `Go to ${feature.title} (requires Editor access)` : `Go to ${feature.title}`}
                >
                  <div className="p-3 rounded-full bg-primary/10 mb-4 group-hover:bg-primary/15 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-center">{feature.title}</h3>
                  <p className="text-muted-foreground text-center">{feature.description}</p>
                  {restricted && (
                    <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      Requires Editor access
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tighter mb-4">
            Ready to Streamline Your Earthquake Data Management?
          </h2>
          <p className="text-lg mb-8 opacity-90 max-w-[700px] mx-auto">
            Join researchers and agencies in New Zealand using our platform for efficient earthquake catalogue integration.
          </p>
          <Button asChild size="lg" variant="secondary" className="shadow-lg">
            {canUpload ? (
              <Link href="/upload">
                Upload a catalogue
              </Link>
            ) : (
              <Link href="/catalogues">
                Browse catalogues
              </Link>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
