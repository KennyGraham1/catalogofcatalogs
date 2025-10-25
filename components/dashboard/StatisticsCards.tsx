import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, FileJson, Layers, AlertTriangle } from 'lucide-react';

export function StatisticsCards() {
  const stats = [
    {
      title: 'Total Catalogues',
      value: '24',
      icon: Database,
      description: 'Across all sources',
      trend: '+4 this month',
      trendUp: true
    },
    {
      title: 'Events',
      value: '10,472',
      icon: FileJson,
      description: 'Total earthquake events',
      trend: '+521 this month',
      trendUp: true
    },
    {
      title: 'Merged Catalogues',
      value: '8',
      icon: Layers,
      description: 'Unified datasets',
      trend: '+2 this month',
      trendUp: true
    },
    {
      title: 'Validation Issues',
      value: '17',
      icon: AlertTriangle,
      description: 'Across 3 catalogues',
      trend: '-5 this month',
      trendUp: false
    }
  ];

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
            <div className={`flex items-center mt-1 text-xs ${stat.trendUp ? 'text-green-500' : 'text-red-500'}`}>
              {stat.trend}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}