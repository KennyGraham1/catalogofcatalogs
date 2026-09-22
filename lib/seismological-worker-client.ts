/** Keep the bundler's worker URL at the client boundary. */
export function createSeismologicalWorker(): Worker {
  return new Worker(new URL('../workers/seismological-worker.ts', import.meta.url));
}
