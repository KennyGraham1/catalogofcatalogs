import { useState, useEffect, useCallback } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseAsyncOptions {
  immediate?: boolean;
}

/**
 * Hook for handling async operations with loading and error states
 */
export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  dependencies: any[] = [],
  options: UseAsyncOptions = { immediate: true }
) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: options.immediate ?? true,
    error: null
  });

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await asyncFunction();
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState({ data: null, loading: false, error: err });
      throw err;
    }
  }, dependencies);

  useEffect(() => {
    if (options.immediate) {
      execute();
    }
  }, [execute, options.immediate]);

  return {
    ...state,
    execute,
    reset: () => setState({ data: null, loading: false, error: null })
  };
}

/**
 * Hook for handling mutations (POST, PUT, DELETE) with loading states
 */
export function useMutation<T, Args extends any[]>(
  mutationFunction: (...args: Args) => Promise<T>
) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null
  });

  const mutate = useCallback(async (...args: Args) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await mutationFunction(...args);
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({ ...prev, loading: false, error: err }));
      throw err;
    }
  }, [mutationFunction]);

  return {
    ...state,
    mutate,
    reset: () => setState({ data: null, loading: false, error: null })
  };
}

/**
 * Hook for fetching data from an API endpoint
 */
export function useFetch<T>(
  url: string | null,
  options?: RequestInit
) {
  return useAsync<T>(
    async () => {
      if (!url) throw new Error('URL is required');
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      
      return response.json();
    },
    [url, JSON.stringify(options)],
    { immediate: !!url }
  );
}

