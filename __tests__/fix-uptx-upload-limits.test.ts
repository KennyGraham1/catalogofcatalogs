/**
 * Pure-function tests for lib/upload-limits.ts's extension helpers.
 *
 * FEATURE: '.quakeml' must be accepted wherever upload extensions are
 * checked. These are the two shared predicates the init route (and, per
 * their own briefs, the other upload routes) use to decide (a) whether a
 * file is allowed at all and (b) whether it should be treated as QuakeML —
 * i.e. streamed and exempted from the synchronous-parse size cap — rather
 * than parsed as CSV/JSON.
 */
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  getUploadFileExtension,
  isAllowedUploadExtension,
  isQuakeMLExtension,
} from '@/lib/upload-limits';

describe('ALLOWED_UPLOAD_EXTENSIONS', () => {
  it('includes quakeml alongside the pre-existing qml/xml extensions', () => {
    expect(ALLOWED_UPLOAD_EXTENSIONS).toEqual(
      expect.arrayContaining(['csv', 'txt', 'dat', 'json', 'geojson', 'xml', 'qml', 'quakeml']),
    );
  });
});

describe('getUploadFileExtension', () => {
  it('lowercases and strips the leading dot', () => {
    expect(getUploadFileExtension('Catalogue.QuakeML')).toBe('quakeml');
  });

  it('returns an empty string for a name with a trailing dot and nothing after it', () => {
    expect(getUploadFileExtension('a.')).toBe('');
  });
});

describe('isAllowedUploadExtension', () => {
  it.each(['a.csv', 'a.txt', 'a.dat', 'a.json', 'a.geojson', 'a.xml', 'a.qml', 'a.quakeml', 'A.QUAKEML'])(
    'accepts %s',
    (name) => {
      expect(isAllowedUploadExtension(name)).toBe(true);
    },
  );

  it.each(['a.pdf', 'a.exe', 'a', 'a.'])('rejects %s', (name) => {
    expect(isAllowedUploadExtension(name)).toBe(false);
  });
});

describe('isQuakeMLExtension', () => {
  it.each(['a.xml', 'a.qml', 'a.quakeml', 'A.QuakeML'])('treats %s as QuakeML', (name) => {
    expect(isQuakeMLExtension(name)).toBe(true);
  });

  it.each(['a.csv', 'a.json', 'a.geojson', 'a.txt'])('does not treat %s as QuakeML', (name) => {
    expect(isQuakeMLExtension(name)).toBe(false);
  });
});
