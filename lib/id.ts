export function createId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  throw new Error('crypto.randomUUID is not available in this runtime');
}
