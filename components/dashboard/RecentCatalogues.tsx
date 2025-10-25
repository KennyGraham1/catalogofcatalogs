import { FileText, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function RecentCatalogues() {
  const catalogues = [
    {
      name: 'GeoNet New Zealand Data 2023',
      date: '2023-09-15',
      format: 'CSV',
      events: 2567,
      sourcePlatform: 'GeoNet'
    },
    {
      name: 'Canterbury Seismic Network',
      date: '2023-08-22',
      format: 'XML',
      events: 1234,
      sourcePlatform: 'CSN'
    },
    {
      name: 'Wellington Region Network',
      date: '2023-07-30',
      format: 'QML',
      events: 456,
      sourcePlatform: 'VUW'
    },
    {
      name: 'Alpine Fault Monitoring Data',
      date: '2023-07-15',
      format: 'JSON',
      events: 2890,
      sourcePlatform: 'GNS'
    }
  ];

  const formatColors: Record<string, string> = {
    CSV: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    XML: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    QML: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    JSON: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    TXT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
  };

  return (
    <div className="space-y-4">
      {catalogues.map((catalogue, i) => (
        <div key={i} className="flex items-center justify-between p-3 border rounded-md">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium truncate max-w-[180px] sm:max-w-xs">{catalogue.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>{catalogue.date}</span>
                <span>•</span>
                <Badge variant="outline" className={formatColors[catalogue.format] || ''}>
                  {catalogue.format}
                </Badge>
                <span>•</span>
                <span>{catalogue.events} events</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}