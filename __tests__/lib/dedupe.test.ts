import { dedupeById } from '@/lib/utils';

describe('dedupeById', () => {
  it('removes records with duplicate ids, keeping first occurrence and order', () => {
    const out = dedupeById([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }]);
    expect(out.map((x) => x.v)).toEqual([1, 2]);
  });
  it('keeps records without an id', () => {
    const out = dedupeById([{ id: null, v: 1 }, { id: null, v: 2 }, { id: 'x', v: 3 }] as any);
    expect(out).toHaveLength(3);
  });
  it('treats numeric and string ids by value', () => {
    const out = dedupeById([{ id: 1 }, { id: '1' }, { id: 2 }] as any);
    expect(out).toHaveLength(2);
  });
  it('handles empty input', () => {
    expect(dedupeById([])).toEqual([]);
  });
});
