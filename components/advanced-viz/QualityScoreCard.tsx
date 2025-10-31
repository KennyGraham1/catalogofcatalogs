'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { QualityScore, getQualityColor, getQualityBadgeVariant } from '@/lib/quality-scoring';
import { TechnicalTermTooltip } from '@/components/ui/info-tooltip';

interface QualityScoreCardProps {
  score: QualityScore;
  showDetails?: boolean;
}

export function QualityScoreCard({ score, showDetails = true }: QualityScoreCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Quality Assessment</CardTitle>
            <TechnicalTermTooltip term="qualityGrade" />
          </div>
          <Badge
            variant={getQualityBadgeVariant(score.grade)}
            className="text-lg px-3 py-1"
            style={{
              backgroundColor: getQualityColor(score.overall),
              color: 'white'
            }}
          >
            Grade: {score.grade}
          </Badge>
        </div>
        <CardDescription>
          Overall quality score: {score.overall}/100
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Overall Score</span>
            <span className="text-muted-foreground">{score.overall}%</span>
          </div>
          <Progress 
            value={score.overall} 
            className="h-3"
            style={{
              backgroundColor: '#e5e7eb',
            }}
          />
        </div>

        {showDetails && (
          <>
            {/* Component Scores */}
            <div className="space-y-3 pt-2">
              <h4 className="font-semibold text-sm">Component Scores</h4>
              
              <ScoreComponent
                name="Location Quality"
                score={score.components.location.score}
                weight={score.components.location.weight}
              />
              
              <ScoreComponent
                name="Network Geometry"
                score={score.components.network.score}
                weight={score.components.network.weight}
              />
              
              <ScoreComponent
                name="Solution Quality"
                score={score.components.solution.score}
                weight={score.components.solution.weight}
              />
              
              <ScoreComponent
                name="Magnitude Quality"
                score={score.components.magnitude.score}
                weight={score.components.magnitude.weight}
              />
              
              <ScoreComponent
                name="Evaluation Status"
                score={score.components.evaluation.score}
                weight={score.components.evaluation.weight}
              />
            </div>

            {/* Strengths */}
            {score.details.strengths.length > 0 && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <div className="font-semibold text-green-900 mb-1">Strengths</div>
                  <ul className="list-disc list-inside text-sm text-green-800 space-y-1">
                    {score.details.strengths.map((strength, i) => (
                      <li key={i}>{strength}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Weaknesses */}
            {score.details.weaknesses.length > 0 && (
              <Alert className="border-orange-200 bg-orange-50">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription>
                  <div className="font-semibold text-orange-900 mb-1">Weaknesses</div>
                  <ul className="list-disc list-inside text-sm text-orange-800 space-y-1">
                    {score.details.weaknesses.map((weakness, i) => (
                      <li key={i}>{weakness}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Recommendations */}
            {score.details.recommendations.length > 0 && (
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription>
                  <div className="font-semibold text-blue-900 mb-1">Recommendations</div>
                  <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                    {score.details.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreComponent({ name, score, weight }: { name: string; score: number; weight: number }) {
  const getScoreColor = (s: number) => {
    if (s >= 90) return 'bg-green-500';
    if (s >= 80) return 'bg-lime-500';
    if (s >= 70) return 'bg-yellow-500';
    if (s >= 60) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">
          {name} <span className="text-xs">({(weight * 100).toFixed(0)}%)</span>
        </span>
        <span className="font-medium">{score.toFixed(0)}/100</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${getScoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

