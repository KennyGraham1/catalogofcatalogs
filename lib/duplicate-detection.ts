/**
 * Enhanced Duplicate Detection for Earthquake Events
 * Implements sophisticated matching algorithms with configurable thresholds
 */

import { calculateDistance, calculateTimeDifference } from './earthquake-utils';
import { DuplicateDetectionEvent } from '@/types/earthquake';

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
  events: DuplicateDetectionEvent[];
  representativeEvent: DuplicateDetectionEvent;
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
 * Calculate a similarity component using a scaled exponential decay.
 *
 * Uses the formula: exp(-k * (value / threshold)^2)
 * This produces:
 * - At value = 0: score = 1.0
 * - At value = threshold/2: score ≈ 0.88
 * - At value = threshold: score ≈ 0.5
 * - At value = 2*threshold: score ≈ 0.02
 *
 * The decay constant k = ln(2) ≈ 0.693 ensures score = 0.5 at threshold.
 */
function calculateSimilarityComponent(value: number, threshold: number): number {
  if (threshold <= 0) return value === 0 ? 1.0 : 0.0;
  const k = Math.LN2; // ~0.693, ensures 0.5 at threshold
  const ratio = value / threshold;
  return Math.exp(-k * ratio * ratio);
}

/**
 * Calculate similarity score between two events (0-1)
 *
 * Uses Gaussian-style decay where events AT the threshold get 50% similarity,
 * events well within the threshold get high similarity (>0.9),
 * and events beyond the threshold rapidly decay to 0.
 */
export function calculateSimilarityScore(
  event1: DuplicateDetectionEvent,
  event2: DuplicateDetectionEvent,
  config: DuplicateDetectionConfig
): number {
  const weights = config.weights || { time: 0.3, location: 0.4, magnitude: 0.2, depth: 0.1 };

  // Time similarity (Gaussian-style decay)
  const timeDiff = calculateTimeDifference(event1.time, event2.time);
  const timeSimilarity = calculateSimilarityComponent(timeDiff, config.timeThresholdSeconds);

  // Location similarity (Gaussian-style decay based on distance)
  const distance = calculateDistance(
    event1.latitude,
    event1.longitude,
    event2.latitude,
    event2.longitude
  );

  const distanceThreshold = config.useMagnitudeDependentThreshold
    ? getMagnitudeDependentThreshold(Math.max(event1.magnitude, event2.magnitude), config.distanceThresholdKm)
    : config.distanceThresholdKm;

  const locationSimilarity = calculateSimilarityComponent(distance, distanceThreshold);

  // Magnitude similarity (Gaussian-style decay)
  const magDiff = Math.abs(event1.magnitude - event2.magnitude);
  const magThreshold = config.magnitudeThreshold || 0.5;
  const magnitudeSimilarity = calculateSimilarityComponent(magDiff, magThreshold);

  // Depth similarity (if both have depth)
  let depthSimilarity = 1.0; // Default if depth not available
  let effectiveDepthWeight = weights.depth;

  if (event1.depth !== null && event1.depth !== undefined &&
      event2.depth !== null && event2.depth !== undefined) {
    const depthDiff = Math.abs(event1.depth - event2.depth);
    const depthThreshold = config.depthThresholdKm || 20;
    depthSimilarity = calculateSimilarityComponent(depthDiff, depthThreshold);
  } else {
    // If depth is not available, redistribute its weight to other components
    // This ensures the total weight still sums to 1.0
    effectiveDepthWeight = 0;
  }

  // Normalize weights if depth was excluded
  const totalWeight = weights.time + weights.location + weights.magnitude + effectiveDepthWeight;
  const normalizedWeights = {
    time: weights.time / totalWeight,
    location: weights.location / totalWeight,
    magnitude: weights.magnitude / totalWeight,
    depth: effectiveDepthWeight / totalWeight,
  };

  // Weighted combination
  const totalScore = (
    timeSimilarity * normalizedWeights.time +
    locationSimilarity * normalizedWeights.location +
    magnitudeSimilarity * normalizedWeights.magnitude +
    depthSimilarity * normalizedWeights.depth
  );

  return totalScore;
}

/**
 * Get the event ID, with fallback to generated ID
 */
function getEventId(event: DuplicateDetectionEvent, fallbackIndex?: number): string {
  return event.id || event.event_public_id || `event_${fallbackIndex ?? Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Check if two events are duplicates
 *
 * Returns a DuplicateMatch object if the events are similar enough to be
 * considered duplicates, or null if they are not.
 */
export function areDuplicates(
  event1: DuplicateDetectionEvent,
  event2: DuplicateDetectionEvent,
  config: DuplicateDetectionConfig
): DuplicateMatch | null {
  // Guard against invalid input
  if (!event1 || !event2 || !event1.time || !event2.time) {
    return null;
  }

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

  // Determine confidence level based on similarity score
  // With the Gaussian-style decay:
  // - 0.90+ means all components are well within half their thresholds
  // - 0.75-0.90 means components are within thresholds but not very close
  // - 0.60-0.75 means some components are at or beyond their thresholds
  let confidence: 'high' | 'medium' | 'low';
  if (similarityScore >= 0.90) {
    confidence = 'high';
  } else if (similarityScore >= 0.75) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Generate match reason with more detail
  const reasons: string[] = [];
  if (timeDiff < 5) reasons.push('very close in time');
  else if (timeDiff < 30) reasons.push('close in time');

  if (distance < 5) reasons.push('very close in location');
  else if (distance < 20) reasons.push('close in location');

  if (magDiff < 0.2) reasons.push('similar magnitude');
  else if (magDiff < 0.5) reasons.push('close magnitude');

  if (depthDiff !== null && depthDiff < 5) reasons.push('similar depth');
  else if (depthDiff !== null && depthDiff < 15) reasons.push('close depth');

  const matchReason = reasons.length > 0
    ? reasons.join(', ')
    : 'matches within thresholds';

  return {
    event1Id: getEventId(event1),
    event2Id: getEventId(event2),
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
 * Assign stable IDs to events that don't have them.
 * This ensures consistent ID usage across all duplicate detection functions.
 */
function ensureEventIds(events: DuplicateDetectionEvent[]): DuplicateDetectionEvent[] {
  return events.map((event, index) => {
    if (event.id || event.event_public_id) {
      return event;
    }
    // Create a new object with a stable generated ID
    return {
      ...event,
      _generated_id: `generated_${index}`,
    };
  });
}

/**
 * Get the event ID, checking for generated fallback IDs
 */
function getStableEventId(event: DuplicateDetectionEvent): string {
  return event.id || event.event_public_id || event._generated_id || 'unknown';
}

/**
 * Find all duplicate pairs in a set of events
 *
 * Performance note: This is O(n²) in the worst case. For large datasets (>1000 events),
 * consider using spatial indexing similar to the merge algorithm.
 *
 * Optimization: Events are first sorted by time, allowing early termination
 * when time difference exceeds threshold.
 */
export function findDuplicatePairs(
  events: DuplicateDetectionEvent[],
  config: DuplicateDetectionConfig
): DuplicateMatch[] {
  const duplicates: DuplicateMatch[] = [];

  // Guard: empty or single event array
  if (events.length < 2) {
    return duplicates;
  }

  // Ensure all events have stable IDs
  const eventsWithIds = ensureEventIds(events);

  // Sort events by time for early termination optimization
  const sortedEvents = [...eventsWithIds].sort((a, b) => {
    const timeA = new Date(a.time).getTime();
    const timeB = new Date(b.time).getTime();
    return timeA - timeB;
  });

  // Calculate maximum time threshold (for early termination)
  // For magnitude-dependent thresholds, use the maximum possible multiplier (4x for M7+)
  const maxTimeThreshold = config.timeThresholdSeconds * (config.useMagnitudeDependentThreshold ? 4 : 1);

  // Compare each event with every other event
  for (let i = 0; i < sortedEvents.length; i++) {
    const event1 = sortedEvents[i];
    const time1 = new Date(event1.time).getTime();

    for (let j = i + 1; j < sortedEvents.length; j++) {
      const event2 = sortedEvents[j];
      const time2 = new Date(event2.time).getTime();

      // Early termination: if time difference exceeds max threshold,
      // all subsequent events will also exceed it (since sorted by time)
      const timeDiffMs = time2 - time1;
      if (timeDiffMs > maxTimeThreshold * 1000) {
        break;
      }

      const match = areDuplicatesWithIds(event1, event2, config);
      if (match) {
        duplicates.push(match);
      }
    }
  }

  return duplicates;
}

/**
 * Internal function that uses stable IDs (used by findDuplicatePairs)
 */
function areDuplicatesWithIds(
  event1: DuplicateDetectionEvent,
  event2: DuplicateDetectionEvent,
  config: DuplicateDetectionConfig
): DuplicateMatch | null {
  // Guard against invalid input
  if (!event1 || !event2 || !event1.time || !event2.time) {
    return null;
  }

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
  else if (magDiff < 0.5) reasons.push('close magnitude');

  if (depthDiff !== null && depthDiff < 5) reasons.push('similar depth');
  else if (depthDiff !== null && depthDiff < 15) reasons.push('close depth');

  const matchReason = reasons.length > 0
    ? reasons.join(', ')
    : 'matches within thresholds';

  return {
    event1Id: getStableEventId(event1),
    event2Id: getStableEventId(event2),
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
 * Group duplicate events together using connected component analysis.
 *
 * Events are grouped transitively: if A matches B and B matches C,
 * then A, B, and C are all in the same group, even if A doesn't match C directly.
 */
export function groupDuplicates(
  events: DuplicateDetectionEvent[],
  config: DuplicateDetectionConfig
): DuplicateGroup[] {
  // Guard: empty or single event array
  if (events.length < 2) {
    return [];
  }

  // Ensure all events have stable IDs (same as findDuplicatePairs)
  const eventsWithIds = ensureEventIds(events);

  const duplicatePairs = findDuplicatePairs(events, config);

  // If no duplicates found, return empty array
  if (duplicatePairs.length === 0) {
    return [];
  }

  // Build adjacency list using the same stable IDs
  const adjacency = new Map<string, Set<string>>();
  const eventMap = new Map<string, DuplicateDetectionEvent>();

  eventsWithIds.forEach((event) => {
    // Use the same ID generation as findDuplicatePairs
    const id = getStableEventId(event);
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
function selectRepresentativeEvent(events: DuplicateDetectionEvent[]): DuplicateDetectionEvent {
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
  events: DuplicateDetectionEvent[],
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
