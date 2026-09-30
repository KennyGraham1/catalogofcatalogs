import { act, renderHook } from '@testing-library/react';
import { useNearbyFaults } from '@/hooks/use-nearby-faults';

it('keeps fault results tied to the current coordinates and clears them when disabled', async () => {
  const originalFetch = global.fetch;
  const pending: Array<(value: unknown) => void> = [];
  global.fetch = jest.fn(() => new Promise(resolve => pending.push(resolve))) as jest.Mock;
  const reply = (name: string) => ({ ok: true, json: async () => ({ count: 1, faults: [{ name }] }) });
  const { result, rerender, unmount } = renderHook(props => useNearbyFaults(props), {
    initialProps: { latitude: -41, longitude: 174, enabled: true },
  });
  try {
    rerender({ latitude: -42, longitude: 173, enabled: true });
    await act(async () => { pending[1](reply('current')); });
    await act(async () => { pending[0](reply('previous')); });
    expect(result.current.faults[0].name).toBe('current');
    expect(result.current.loading).toBe(false);

    rerender({ latitude: -43, longitude: 172, enabled: true });
    expect(result.current.faults).toEqual([]);
    rerender({ latitude: -43, longitude: 172, enabled: false });
    await act(async () => { pending[2](reply('disabled')); });
    expect(result.current.faults).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  } finally {
    unmount();
    global.fetch = originalFetch;
  }
});
