/** @jest-environment node */
import { ensureEventIntegrityIndexes } from '@/lib/event-indexes';

it('requires both stable row IDs and source identity uniqueness, exempting missing sources', async () => {
  const createIndex = jest.fn(async () => 'index');
  await ensureEventIntegrityIndexes({ createIndex });
  expect(createIndex).toHaveBeenCalledWith({ id: 1 }, { name: 'idx_id', unique: true });
  expect(createIndex).toHaveBeenCalledWith({ catalogue_id: 1, source_id: 1 }, {
    name: 'catalogue_source_id_unique_idx', unique: true,
    partialFilterExpression: { source_id: { $exists: true, $type: 'string' } },
  });
});
it('fails setup on legacy duplicates without installing a nonunique replacement', async () => {
  const createIndex = jest.fn().mockResolvedValueOnce('id').mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: 11000 }));
  await expect(ensureEventIntegrityIndexes({ createIndex })).rejects.toThrow(/repair them/);
  expect(createIndex).toHaveBeenCalledTimes(2);
});
