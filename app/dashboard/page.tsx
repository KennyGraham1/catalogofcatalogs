'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, FileText, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { RecentCatalogues } from '@/components/dashboard/RecentCatalogues';
import { StatisticsCards } from '@/components/dashboard/StatisticsCards';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { CatalogueMap } from '@/components/dashboard/CatalogueMap';

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
                  <div className="space-y-4">
                    {[
                      { name: 'GeoNet New Zealand Data 2023 Q3', status: 'complete', icon: CheckCircle, statusColor: 'text-green-500' },
                      { name: 'Wellington Region Network Data', status: 'processing', icon: Clock, statusColor: 'text-amber-500' },
                      { name: 'Taupo Volcanic Zone Seismic Records', status: 'error', icon: AlertTriangle, statusColor: 'text-red-500' },
                      { name: 'Kaikoura Aftershock Sequence 2016-2023', status: 'complete', icon: CheckCircle, statusColor: 'text-green-500' },
                    ].map((job, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-3">
                          <job.icon className={`h-5 w-5 ${job.statusColor}`} />
                          <span>{job.name}</span>
                        </div>
                        <span className="capitalize text-sm text-muted-foreground">{job.status}</span>
                      </div>
                    ))}
                  </div>
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