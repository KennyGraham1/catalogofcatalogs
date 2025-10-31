import { useState, useEffect } from 'react';

export interface NearbyFault {
  id: string;
  name: string;
  slipType: string | null;
  slipRate: string | null;
  recurrenceInterval: string | null;
  displacement: string | null;
  lastEvent: string | null;
  senseOfMovement: string | null;
  distance: number;
  geometry: any;
  properties: any;
}

export interface NearbyFaultsResponse {
  success: boolean;
  query: {
    latitude: number;
    longitude: number;
    radius: number;
    limit: number;
  };
  count: number;
  faults: NearbyFault[];
}

interface UseNearbyFaultsOptions {
  latitude?: number;
  longitude?: number;
  radius?: number; // km
  limit?: number;
  enabled?: boolean;
}

export function useNearbyFaults({
  latitude,
  longitude,
  radius = 50,
  limit = 10,
  enabled = true,
}: UseNearbyFaultsOptions) {
  const [data, setData] = useState<NearbyFaultsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || latitude === undefined || longitude === undefined) {
      return;
    }

    const fetchNearbyFaults = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          lat: latitude.toString(),
          lon: longitude.toString(),
          radius: radius.toString(),
          limit: limit.toString(),
        });

        const response = await fetch(`/api/faults/nearby?${params}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch nearby faults: ${response.statusText}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error('Error fetching nearby faults:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchNearbyFaults();
  }, [latitude, longitude, radius, limit, enabled]);

  return {
    data,
    faults: data?.faults || [],
    loading,
    error,
    count: data?.count || 0,
  };
}

