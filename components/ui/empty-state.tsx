import { LucideIcon } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Empty state component with icon, title, description, and optional actions
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className
}: EmptyStateProps) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <div className="text-center max-w-md space-y-4">
        {Icon && (
          <div className="flex justify-center">
            <Icon className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {(action || secondaryAction) && (
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            {action && (
              <Button
                onClick={action.onClick}
                variant={action.variant || 'default'}
              >
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                onClick={secondaryAction.onClick}
                variant="outline"
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface EmptyStateCardProps extends EmptyStateProps {
  cardClassName?: string;
}

/**
 * Empty state wrapped in a card
 */
export function EmptyStateCard({ cardClassName, ...props }: EmptyStateCardProps) {
  return (
    <Card className={cardClassName}>
      <CardContent className="p-0">
        <EmptyState {...props} />
      </CardContent>
    </Card>
  );
}

interface TableEmptyStateProps {
  colSpan: number;
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Empty state for table rows
 */
export function TableEmptyState({
  colSpan,
  icon: Icon,
  title,
  description,
  action
}: TableEmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-64">
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md space-y-4">
            {Icon && (
              <div className="flex justify-center">
                <Icon className="h-12 w-12 text-muted-foreground/50" />
              </div>
            )}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {action && (
              <div className="pt-2">
                <Button onClick={action.onClick}>{action.label}</Button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

