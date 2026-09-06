import { sortTableEvents } from '@/lib/event-table-sort';

const events = [
  { time: '2024-01-03', magnitude: 2, latitude: 0, longitude: 0, depth: null },
  { time: '2024-01-01', magnitude: 0, latitude: 0, longitude: 0, depth: 0 },
  { time: '2024-01-02', magnitude: -1, latitude: 0, longitude: 0, depth: 10 },
];

it('parses timestamps once per event instead of on every comparison', () => {
  const parse = jest.spyOn(Date, 'parse');
  try {
    expect(sortTableEvents(events, 'time', 'desc')).toEqual([events[0], events[2], events[1]]);
    expect(parse).toHaveBeenCalledTimes(events.length);
  } finally { parse.mockRestore(); }
});

it('preserves zero and negative values and leaves unknown depths last in either order', () => {
  expect(sortTableEvents(events, 'magnitude', 'asc')).toEqual([events[2], events[1], events[0]]);
  expect(sortTableEvents(events, 'depth', 'asc')).toEqual([events[1], events[2], events[0]]);
  expect(sortTableEvents(events, 'depth', 'desc')).toEqual([events[2], events[1], events[0]]);
  expect(events[0].depth).toBeNull();
});
