'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Database, Upload, Layers, BarChart, Globe, Activity, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Stats {
  catalogueCount: number;
  eventCount: number;
  loading: boolean;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({ catalogueCount: 0, eventCount: 0, loading: true });

  // Fetch statistics from API
  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/catalogues');
        if (response.ok) {
          const catalogues = await response.json();
          const catalogueCount = Array.isArray(catalogues) ? catalogues.length : 0;
          const eventCount = Array.isArray(catalogues)
            ? catalogues.reduce((sum: number, cat: { event_count?: number }) => sum + (cat.event_count || 0), 0)
            : 0;
          setStats({ catalogueCount, eventCount, loading: false });
        } else {
          setStats({ catalogueCount: 0, eventCount: 0, loading: false });
        }
      } catch {
        setStats({ catalogueCount: 0, eventCount: 0, loading: false });
      }
    }
    fetchStats();
  }, []);

  const features = [
    {
      icon: Upload,
      title: 'Multi-format Upload',
      description: 'Support for CSV, TXT, QML, JSON, and XML earthquake catalogue formats.',
      href: '/upload'
    },
    {
      icon: Database,
      title: 'Schema Normalization',
      description: 'Automatically map field names from different formats to a standardized schema.',
      href: '/settings'
    },
    {
      icon: Layers,
      title: 'Catalogue Merging',
      description: 'Merge catalogues using configurable rules for matching events by time and location.',
      href: '/merge'
    },
    {
      icon: BarChart,
      title: 'Data Visualization',
      description: 'Visualize earthquake data with interactive maps and charts.',
      href: '/analytics'
    }
  ];

  const statsItems = [
    {
      icon: Database,
      label: 'Catalogues',
      value: stats.catalogueCount,
      loading: stats.loading,
    },
    {
      icon: Activity,
      label: 'Earthquake Events',
      value: stats.eventCount,
      loading: stats.loading,
    },
    {
      icon: Globe,
      label: 'Coverage',
      value: 'New Zealand',
      loading: false,
      isText: true,
    },
  ];

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
                <TrendingUp className="h-4 w-4" />
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
              <Button asChild size="lg" className="shadow-lg hover:shadow-xl transition-shadow">
                <Link href="/upload">
                  Get Started
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard">
                  View Dashboard
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="py-8 md:py-12 bg-muted/50 border-y">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {statsItems.map((stat, index) => (
              <div
                key={index}
                className="flex items-center justify-center gap-4 p-4"
              >
                <div className="p-3 rounded-full bg-primary/10">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  {stat.loading ? (
                    <Skeleton className="h-8 w-20 mb-1" />
                  ) : (
                    <p className="text-2xl md:text-3xl font-bold">
                      {stat.isText ? stat.value : (stat.value as number).toLocaleString()}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
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
            {features.map((feature, index) => (
              <Link
                key={index}
                href={feature.href}
                className="group flex flex-col items-center p-6 bg-background rounded-lg border transition-all duration-300 hover:shadow-lg hover:border-primary/50 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label={`Go to ${feature.title}`}
              >
                <div className="p-3 rounded-full bg-primary/10 mb-4 group-hover:bg-primary/15 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-center">{feature.description}</p>
              </Link>
            ))}
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
            <Link href="/upload">
              Upload Your First Catalogue
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
