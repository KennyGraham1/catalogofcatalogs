import { 
  Upload, 
  Download, 
  Copy, 
  AlertTriangle, 
  CheckCircle, 
  FileWarning,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ActivityType = 'upload' | 'download' | 'merge' | 'error' | 'complete' | 'warning' | 'settings';

interface Activity {
  type: ActivityType;
  title: string;
  description: string;
  time: string;
  user?: string;
}

const activityIcons: Record<ActivityType, React.ElementType> = {
  upload: Upload,
  download: Download,
  merge: Copy,
  error: AlertTriangle,
  complete: CheckCircle,
  warning: FileWarning,
  settings: Settings
};

const activityColors: Record<ActivityType, string> = {
  upload: 'text-blue-500 bg-blue-100 dark:bg-blue-900 dark:text-blue-300',
  download: 'text-purple-500 bg-purple-100 dark:bg-purple-900 dark:text-purple-300',
  merge: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300',
  error: 'text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300',
  complete: 'text-green-500 bg-green-100 dark:bg-green-900 dark:text-green-300',
  warning: 'text-amber-500 bg-amber-100 dark:bg-amber-900 dark:text-amber-300',
  settings: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-300'
};

export function ActivityFeed() {
  const activities: Activity[] = [
    {
      type: 'upload',
      title: 'New catalogue uploaded',
      description: 'GeoNet New Zealand Data 2023 Q3 uploaded successfully',
      time: '2 hours ago',
      user: 'John Doe'
    },
    {
      type: 'error',
      title: 'Processing error',
      description: 'Failed to process Taupo Volcanic Zone Data - Schema mismatch',
      time: '3 hours ago'
    },
    {
      type: 'merge',
      title: 'Catalogues merged',
      description: 'Canterbury Seismic Network merged with Wellington Region Network',
      time: '5 hours ago',
      user: 'Jane Smith'
    },
    {
      type: 'warning',
      title: 'Validation warning',
      description: 'Hikurangi Subduction Zone dataset contains 17 events with missing magnitude values',
      time: '6 hours ago'
    },
    {
      type: 'complete',
      title: 'Processing complete',
      description: 'Alpine Fault Monitoring Data 2023 processing completed',
      time: '1 day ago'
    },
    {
      type: 'settings',
      title: 'Configuration updated',
      description: 'Schema mapping configuration updated for QML formats',
      time: '2 days ago',
      user: 'John Doe'
    },
    {
      type: 'download',
      title: 'Catalogue exported',
      description: 'Merged NZ Regional Catalogue exported to GeoJSON format',
      time: '2 days ago',
      user: 'Jane Smith'
    }
  ];

  return (
    <div className="space-y-6">
      {activities.map((activity, i) => {
        const Icon = activityIcons[activity.type];
        const colorClass = activityColors[activity.type];
        
        return (
          <div key={i} className="flex gap-4">
            <div className={cn(
              "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
              colorClass
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="font-medium leading-none">{activity.title}</p>
              <p className="text-sm text-muted-foreground">{activity.description}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>{activity.time}</span>
                {activity.user && (
                  <>
                    <span>•</span>
                    <span>{activity.user}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}