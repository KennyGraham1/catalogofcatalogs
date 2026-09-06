/** @jest-environment node */
import { decodeEventCursor, encodeEventCursor } from '@/lib/event-cursor';
import { dbQueries, EVENT_SUMMARY_PROJECTION } from '@/lib/db';
import { getCollection } from '@/lib/mongodb';

jest.mock('@/lib/mongodb', () => ({ getCollection: jest.fn(), COLLECTIONS: { EVENTS: 'merged_events' } }));

describe('event cursor pagination', () => {
  const time = '2024-01-02T03:04:05.123Z';
  const id = 'smi:nz.org:event/42';

  it('round trips timestamps and identifiers containing colons', () => {
    expect(decodeEventCursor(encodeEventCursor(time, id))).toEqual([time, id]);
    expect(decodeEventCursor(`${time}:${id}`)).toEqual([time, id]);
  });

  it.each(['garbage', '', '2024-01-01:abc', Buffer.from('[{},"id"]').toString('base64url'), Buffer.from('["2024-01-01",{}]').toString('base64url')])('rejects malformed cursor %s', cursor => {
    expect(() => decodeEventCursor(cursor)).toThrow('Invalid event cursor');
  });

  it.each(['desc', 'asc'] as const)('continues at the full timestamp and tie-breaking ID (%s)', async direction => {
    const chain = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue([{ time, id: 'z' }, { time, id: 'y' }, { time, id: 'x' }]) };
    const find = jest.fn().mockReturnValue(chain);
    (getCollection as jest.Mock).mockResolvedValue({ find });
    const first = await dbQueries!.getEventsByCatalogueIdCursor('cat', { limit: 2, summary: true, direction });
    expect(first.data).toHaveLength(2);
    expect(find).toHaveBeenCalledWith({ catalogue_id: 'cat' }, { projection: EVENT_SUMMARY_PROJECTION });
    expect(chain.limit).toHaveBeenCalledWith(3);
    await dbQueries!.getEventsByCatalogueIdCursor('cat', { limit: 2, cursor: first.pagination.nextCursor!, direction });
    const operator = direction === 'desc' ? '$lt' : '$gt';
    expect(find).toHaveBeenLastCalledWith({ catalogue_id: 'cat', $or: [
      { time: { [operator]: time } }, { time, id: { [operator]: 'y' } },
    ] }, {});
  });

  it('scopes single-event lookup to its catalogue', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    (getCollection as jest.Mock).mockResolvedValue({ findOne });
    expect(await dbQueries!.getEventById('cat', id)).toBeUndefined();
    expect(findOne).toHaveBeenCalledWith({ catalogue_id: 'cat', id });
  });
});
