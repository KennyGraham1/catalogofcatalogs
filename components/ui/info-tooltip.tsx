import { HelpCircle, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
import { cn } from '@/lib/utils';

interface InfoTooltipProps {
  content: string | React.ReactNode;
  children?: React.ReactNode;
  icon?: 'help' | 'info';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

/**
 * Info tooltip component with icon trigger
 */
export function InfoTooltip({
  content,
  children,
  icon = 'help',
  side = 'top',
  className
}: InfoTooltipProps) {
  const Icon = icon === 'help' ? HelpCircle : Info;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children || (
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors',
                className
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="sr-only">More information</span>
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Technical term definitions for earthquake catalogues
 */
export const TECHNICAL_TERMS = {
  azimuthalGap: {
    term: 'Azimuthal Gap',
    definition: 'The largest angle between seismic stations as seen from the earthquake epicenter. Smaller gaps (< 180°) indicate better station coverage and more reliable location estimates.'
  },
  rms: {
    term: 'RMS (Root Mean Square)',
    definition: 'A measure of the fit between observed and predicted arrival times. Lower RMS values (< 0.5s) indicate better quality earthquake locations.'
  },
  qualityGrade: {
    term: 'Quality Grade',
    definition: 'Overall assessment of earthquake location quality from A+ (excellent) to F (poor), based on location uncertainty, network geometry, solution quality, and magnitude reliability.'
  },
  qualityScore: {
    term: 'Quality Score',
    definition: 'A numeric quality score (0-100) derived from station coverage, azimuthal gap, uncertainty, and solution fit. Higher scores indicate more reliable event locations.'
  },
  magnitude: {
    term: 'Magnitude',
    definition: 'A logarithmic measure of earthquake size or energy release. Each whole number increase corresponds to ~32× more energy.'
  },
  magnitudeType: {
    term: 'Magnitude Type',
    definition: 'The method used to calculate earthquake magnitude. Common types: ML (local), Mw (moment), mb (body wave), Ms (surface wave). Mw is preferred for large earthquakes.'
  },
  magnitudeFrequencyDistribution: {
    term: 'Magnitude-Frequency Distribution (MFD)',
    definition: 'Describes how earthquake counts change with magnitude. Used to evaluate completeness and seismicity rates.'
  },
  completenessMagnitude: {
    term: 'Completeness Magnitude (Mc)',
    definition: 'The lowest magnitude above which the catalogue is considered complete and reliably recorded.'
  },
  bValue: {
    term: 'b-value',
    definition: 'Slope of the Gutenberg-Richter relation. Higher values indicate relatively more small earthquakes.'
  },
  aValue: {
    term: 'a-value',
    definition: 'Intercept of the Gutenberg-Richter relation. Represents overall seismicity rate.'
  },
  rSquared: {
    term: 'R^2 (Goodness of Fit)',
    definition: 'Measure of how well a model fits the data. Values closer to 1 indicate a better fit.'
  },
  seismicMoment: {
    term: 'Seismic Moment (M0)',
    definition: 'Physical measure of earthquake size based on fault area, slip, and rock rigidity; measured in N·m.'
  },
  momentMagnitude: {
    term: 'Moment Magnitude (Mw)',
    definition: 'Magnitude scale derived from seismic moment, preferred for large earthquakes because it does not saturate.'
  },
  depth: {
    term: 'Depth',
    definition: 'Distance from the Earth\'s surface to the earthquake hypocenter, measured in kilometers. Shallow earthquakes (< 70 km) are typically more damaging than deep ones.'
  },
  strike: {
    term: 'Strike',
    definition: 'Compass direction of the horizontal line on a fault plane, measured clockwise from north (degrees).'
  },
  dip: {
    term: 'Dip',
    definition: 'Angle between the fault plane and horizontal, measured in degrees (0° is horizontal, 90° is vertical).'
  },
  rake: {
    term: 'Rake',
    definition: 'Direction of slip on the fault plane, measured within the plane.'
  },
  timeWindow: {
    term: 'Time Window',
    definition: 'Maximum time difference between events to consider them duplicates during merging. Smaller windows reduce false matches but may miss duplicates.'
  },
  distanceThreshold: {
    term: 'Distance Threshold',
    definition: 'Maximum spatial separation (in kilometers) between events to consider them duplicates during merging.'
  },
  uncertainty: {
    term: 'Location Uncertainty',
    definition: 'The estimated error in the earthquake location, shown as an ellipse. Smaller ellipses indicate more precise locations.'
  },
  focalMechanism: {
    term: 'Focal Mechanism',
    definition: 'A "beach ball" diagram showing the orientation of the fault plane and the direction of slip during an earthquake. Helps identify fault type (normal, reverse, or strike-slip).'
  },
  stationCount: {
    term: 'Station Count',
    definition: 'Number of seismic stations that recorded the earthquake. More stations (> 10) generally result in better location quality.'
  },
  phaseCount: {
    term: 'Phase Count',
    definition: 'Total number of seismic wave arrivals (P-waves and S-waves) used to locate the earthquake. More phases improve location accuracy.'
  },
  standardError: {
    term: 'Standard Error',
    definition: 'Statistical measure of location uncertainty. Smaller values indicate more precise earthquake locations.'
  },
  quakeml: {
    term: 'QuakeML',
    definition: 'An XML-based standard format for exchanging earthquake data between seismological agencies and research institutions.'
  },
  fdsn: {
    term: 'FDSN',
    definition: 'International Federation of Digital Seismograph Networks - provides standardized web services for accessing earthquake data worldwide.'
  },
  eventId: {
    term: 'Event ID',
    definition: 'Unique identifier assigned to each earthquake by the reporting agency. Format varies by source (e.g., GeoNet, ISC).'
  },
  publicId: {
    term: 'Public ID',
    definition: 'Globally unique identifier for earthquake events in QuakeML format, typically a URI.'
  }
} as const;

type TechnicalTermKey = keyof typeof TECHNICAL_TERMS;

interface TechnicalTermTooltipProps {
  term: TechnicalTermKey;
  children?: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

/**
 * Tooltip for predefined technical terms
 */
export function TechnicalTermTooltip({
  term,
  children,
  side = 'top',
  className
}: TechnicalTermTooltipProps) {
  const termData = TECHNICAL_TERMS[term];

  return (
    <InfoTooltip
      content={
        <div className="space-y-1">
          <p className="font-semibold">{termData.term}</p>
          <p className="text-sm">{termData.definition}</p>
        </div>
      }
      side={side}
      className={className}
    >
      {children}
    </InfoTooltip>
  );
}

interface LabelWithTooltipProps {
  label: string;
  term: TechnicalTermKey;
  required?: boolean;
  className?: string;
}

/**
 * Form label with integrated tooltip
 */
export function LabelWithTooltip({
  label,
  term,
  required,
  className
}: LabelWithTooltipProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      <TechnicalTermTooltip term={term} />
    </div>
  );
}
