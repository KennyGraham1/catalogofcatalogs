/**
 * Enhanced Duplicate Detection for Earthquake Events
 * Implements sophisticated matching algorithms with configurable thresholds
 */

import { calculateDistance, calculateTimeDifference } from './earthquake-utils';

export interface DuplicateDetectionConfig {
  // Basic thresholds
  timeThresholdSeconds: number;
  distanceThresholdKm: number;
  
  // Advanced thresholds
  magnitudeThreshold?: number; // Max magnitude difference for duplicates
  depthThresholdKm?: number; // Max depth difference for duplicates
  
  // Matching strategy
  matchingStrategy: 'strict' | 'moderate' | 'loose' | 'custom';
  
  // Weights for similarity scoring (0-1)
  weights?: {
    time: number;
    location: number;
    magnitude: number;
    depth: number;
  };
  
  // Minimum similarity score (0-1) to consider as duplicate
  minimumSimilarityScore?: number;
  
  // Use magnitude-dependent distance threshold
  useMagnitudeDependentThreshold?: boolean;
}

export interface DuplicateMatch {
  event1Id: string;
  event2Id: string;
  similarityScore: number;
  timeDifferenceSeconds: number;
  distanceKm: number;
  magnitudeDifference: number;
  depthDifferenceKm: number | null;
  matchReason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface DuplicateGroup {
  groupId: string;
  events: any[];
  representativeEvent: any; // The "best" event to keep
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Get preset configuration based on strategy
 */
export function getPresetConfig(strategy: 'strict' | 'moderate' | 'loose'): DuplicateDetectionConfig {
  switch (strategy) {
    case 'strict':
      return {
        timeThresholdSeconds: 10,
        distanceThresholdKm: 10,
        magnitudeThreshold: 0.3,
        depthThresholdKm: 10,
        matchingStrategy: 'strict',
        weights: { time: 0.3, location: 0.4, magnitude: 0.2, depth: 0.1 },
        minimumSimilarityScore: 0.85,
        useMagnitudeDependentThreshold: false,
      };
    
    case 'moderate':
      return {
        timeThresholdSeconds: 30,
        distanceThresholdKm: 25,
        magnitudeThreshold: 0.5,
        depthThresholdKm: 20,
        matchingStrategy: 'moderate',
        weights: { time: 0.3, location: 0.4, magnitude: 0.2, depth: 0.1 },
        minimumSimilarityScore: 0.70,
        useMagnitudeDependentThreshold: true,
      };
    
    case 'loose':
      return {
        timeThresholdSeconds: 60,
        distanceThresholdKm: 50,
        magnitudeThreshold: 1.0,
        depthThresholdKm: 50,
        matchingStrategy: 'loose',
        weights: { time: 0.3, location: 0.4, magnitude: 0.2, depth: 0.1 },
        minimumSimilarityScore: 0.60,
        useMagnitudeDependentThreshold: true,
      };
  }
}

/**
 * Calculate magnitude-dependent distance threshold
 * Larger earthquakes can be detected from farther away, so allow larger distance threshold
 */
function getMagnitudeDependentThreshold(magnitude: number, baseThreshold: number): number {
  // Scale threshold based on magnitude
  // M3: 1x base, M4: 1.5x, M5: 2x, M6: 3x, M7+: 4x
  if (magnitude < 3) return baseThreshold * 0.8;
  if (magnitude < 4) return baseThreshold * 1.0;
  if (magnitude < 5) return baseThreshold * 1.5;
  if (magnitude < 6) return baseThreshold * 2.0;
  if (magnitude < 7) return baseThreshold * 3.0;
  return baseThreshold * 4.0;
}

/**
 * Calculate similarity score between two events (0-1)
 */
export function calculateSimilarityScore(
  event1: any,
  event2: any,
  config: DuplicateDetectionConfig
): number {
  const weights = config.weights || { time: 0.3, location: 0.4, magnitude: 0.2, depth: 0.1 };
  
  // Time similarity (exponential decay)
  const timeDiff = calculateTimeDifference(event1.time, event2.time);
  const timeSimilarity = Math.exp(-timeDiff / config.timeThresholdSeconds);
  
  // Location similarity (exponential decay based on distance)
  const distance = calculateDistance(
    event1.latitude,
    event1.longitude,
    event2.latitude,
    event2.longitude
  );
  
  const distanceThreshold = config.useMagnitudeDependentThreshold
    ? getMagnitudeDependentThreshold(Math.max(event1.magnitude, event2.magnitude), config.distanceThresholdKm)
    : config.distanceThresholdKm;
  
  const locationSimilarity = Math.exp(-distance / distanceThreshold);
  
  // Magnitude similarity
  const magDiff = Math.abs(event1.magnitude - event2.magnitude);
  const magThreshold = config.magnitudeThreshold || 0.5;
  const magnitudeSimilarity = Math.exp(-magDiff / magThreshold);
  
  // Depth similarity (if both have depth)
  let depthSimilarity = 1.0; // Default if depth not available
  if (event1.depth !== null && event1.depth !== undefined && 
      event2.depth !== null && event2.depth !== undefined) {
    const depthDiff = Math.abs(event1.depth - event2.depth);
    const depthThreshold = config.depthThresholdKm || 20;
    depthSimilarity = Math.exp(-depthDiff / depthThreshold);
  }
  
  // Weighted combination
  const totalScore = (
    timeSimilarity * weights.time +
    locationSimilarity * weights.location +
    magnitudeSimilarity * weights.magnitude +
    depthSimilarity * weights.depth
  );
  
  return totalScore;
}

/**
 * Check if two events are duplicates
 */
export function areDuplicates(
  event1: any,
  event2: any,
  config: DuplicateDetectionConfig
): DuplicateMatch | null {
  const similarityScore = calculateSimilarityScore(event1, event2, config);
  const minimumScore = config.minimumSimilarityScore || 0.70;
  
  if (similarityScore < minimumScore) {
    return null;
  }
  
  const timeDiff = calculateTimeDifference(event1.time, event2.time);
  const distance = calculateDistance(
    event1.latitude,
    event1.longitude,
    event2.latitude,
    event2.longitude
  );
  const magDiff = Math.abs(event1.magnitude - event2.magnitude);
  
  let depthDiff: number | null = null;
  if (event1.depth !== null && event1.depth !== undefined && 
      event2.depth !== null && event2.depth !== undefined) {
    depthDiff = Math.abs(event1.depth - event2.depth);
  }
  
  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low';
  if (similarityScore >= 0.90) {
    confidence = 'high';
  } else if (similarityScore >= 0.75) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // Generate match reason
  const reasons: string[] = [];
  if (timeDiff < 5) reasons.push('very close in time');
  else if (timeDiff < 30) reasons.push('close in time');
  
  if (distance < 5) reasons.push('very close in location');
  else if (distance < 20) reasons.push('close in location');
  
  if (magDiff < 0.2) reasons.push('similar magnitude');
  
  if (depthDiff !== null && depthDiff < 5) reasons.push('similar depth');
  
  const matchReason = reasons.length > 0 
    ? reasons.join(', ')
    : 'matches within thresholds';
  
  return {
    event1Id: event1.id || event1.event_public_id,
    event2Id: event2.id || event2.event_public_id,
    similarityScore,
    timeDifferenceSeconds: timeDiff,
    distanceKm: distance,
    magnitudeDifference: magDiff,
    depthDifferenceKm: depthDiff,
    matchReason,
    confidence,
  };
}

/**
 * Find all duplicate pairs in a set of events
 */
export function findDuplicatePairs(
  events: any[],
  config: DuplicateDetectionConfig
): DuplicateMatch[] {
  const duplicates: DuplicateMatch[] = [];
  
  // Compare each event with every other event
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const match = areDuplicates(events[i], events[j], config);
      if (match) {
        duplicates.push(match);
      }
    }
  }
  
  return duplicates;
}

/**
 * Group duplicate events together
 */
export function groupDuplicates(
  events: any[],
  config: DuplicateDetectionConfig
): DuplicateGroup[] {
  const duplicatePairs = findDuplicatePairs(events, config);
  
  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  const eventMap = new Map<string, any>();
  
  events.forEach(event => {
    const id = event.id || event.event_public_id;
    eventMap.set(id, event);
    adjacency.set(id, new Set());
  });

  duplicatePairs.forEach(pair => {
    adjacency.get(pair.event1Id)?.add(pair.event2Id);
    adjacency.get(pair.event2Id)?.add(pair.event1Id);
  });

  // Find connected components using DFS
  const visited = new Set<string>();
  const groups: DuplicateGroup[] = [];

  function dfs(nodeId: string, group: Set<string>) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    group.add(nodeId);

    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      Array.from(neighbors).forEach(neighbor => {
        dfs(neighbor, group);
      });
    }
  }

  Array.from(adjacency.keys()).forEach(eventId => {
    if (!visited.has(eventId)) {
      const group = new Set<string>();
      dfs(eventId, group);
      
      if (group.size > 1) {
        const groupEvents = Array.from(group).map(id => eventMap.get(id)!);
        
        // Select representative event (prefer reviewed over automatic, higher quality)
        const representative = selectRepresentativeEvent(groupEvents);
        
        // Determine group confidence
        const groupConfidence = determineGroupConfidence(groupEvents, duplicatePairs);
        
        groups.push({
          groupId: `group-${groups.length + 1}`,
          events: groupEvents,
          representativeEvent: representative,
          confidence: groupConfidence,
        });
      }
    }
  });

  return groups;
}

/**
 * Select the best representative event from a group of duplicates
 */
function selectRepresentativeEvent(events: any[]): any {
  // Scoring criteria:
  // 1. Evaluation status (reviewed > manual > automatic)
  // 2. Number of stations used
  // 3. Smallest azimuthal gap
  // 4. Most complete data
  
  let bestEvent = events[0];
  let bestScore = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    let score = 0;

    // Evaluation status
    if (event.evaluation_status === 'reviewed') score += 100;
    else if (event.evaluation_status === 'manual') score += 50;

    // Station count
    if (event.used_station_count) score += event.used_station_count;

    // Azimuthal gap (lower is better)
    if (event.azimuthal_gap) score += (360 - event.azimuthal_gap) / 10;

    // Data completeness
    const fields = ['depth', 'magnitude_type', 'event_type', 'azimuthal_gap',
                    'used_phase_count', 'used_station_count'];
    const completeness = fields.filter(f => event[f] !== null && event[f] !== undefined).length;
    score += completeness * 5;

    if (score > bestScore) {
      bestScore = score;
      bestEvent = event;
    }
  }

  return bestEvent;
}

/**
 * Determine confidence level for a duplicate group
 */
function determineGroupConfidence(
  events: any[],
  allPairs: DuplicateMatch[]
): 'high' | 'medium' | 'low' {
  const eventIds = new Set(events.map(e => e.id || e.event_public_id));
  const relevantPairs = allPairs.filter(p => 
    eventIds.has(p.event1Id) && eventIds.has(p.event2Id)
  );
  
  if (relevantPairs.length === 0) return 'low';
  
  const avgConfidence = relevantPairs.reduce((sum, p) => {
    if (p.confidence === 'high') return sum + 3;
    if (p.confidence === 'medium') return sum + 2;
    return sum + 1;
  }, 0) / relevantPairs.length;
  
  if (avgConfidence >= 2.5) return 'high';
  if (avgConfidence >= 1.5) return 'medium';
  return 'low';
}

