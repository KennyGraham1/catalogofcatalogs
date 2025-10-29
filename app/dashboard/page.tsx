'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecentCatalogues } from '@/components/dashboard/RecentCatalogues';
import { StatisticsCards } from '@/components/dashboard/StatisticsCards';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ProcessingStatus } from '@/components/dashboard/ProcessingStatus';

// Dynamically import CatalogueMap to avoid SSR issues with Leaflet
const CatalogueMap = dynamic(
  () => import('@/components/dashboard/CatalogueMap').then(mod => ({ default: mod.CatalogueMap })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] w-full flex items-center justify-center bg-muted/20">
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    )
  }
);

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="container py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your earthquake catalogue data and recent activity.
          </p>
        </div>

        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <StatisticsCards />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Catalogues</CardTitle>
                  <CardDescription>Your recently uploaded and processed earthquake catalogues</CardDescription>
                </CardHeader>
                <CardContent>
                  <RecentCatalogues />
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Processing Status</CardTitle>
                  <CardDescription>Status of your catalogue processing jobs</CardDescription>
                </CardHeader>
                <CardContent>
                  <ProcessingStatus />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Activity Feed</CardTitle>
                <CardDescription>Recent activity on your earthquake catalogues</CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityFeed />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="map">
            <Card>
              <CardHeader>
                <CardTitle>Earthquake Data Visualization</CardTitle>
                <CardDescription>Geographical view of your earthquake catalogue data</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <CatalogueMap />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}