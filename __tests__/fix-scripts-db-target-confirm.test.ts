/**
 * @jest-environment node
 *
 * gs#3: nine scripts resolved MONGODB_DATABASE/MONGODB_URI with their own copy
 * of lib/mongodb.ts's precedence rule, skipping its URI-path fallback — under
 * the documented "optional override" setup they could silently act on a
 * different database than the running app and still report success.
 * scripts/lib/db-target.ts fixes this by never re-deriving the name: it calls
 * the real lib/mongodb.ts getDb() and reads back db.databaseName.
 *
 * gs#4: those same scripts (and others) logged the full MongoDB connection
 * string, password included. scripts/lib/db-target.ts's safeHostFromUri only
 * ever returns the host.
 *
 * gs#3's other requirement ("requires confirmation before writing") is
 * scripts/lib/confirm.ts, tested here as a pure function of injected
 * TTY/prompt/assumeYes inputs — no real stdin needed.
 */

import { safeHostFromUri, resolveDbTarget } from '@/scripts/lib/db-target';
import { requireTypedConfirmation, confirmWrite, type ConfirmContext } from '@/scripts/lib/confirm';

describe('gs#4 safeHostFromUri never exposes credentials', () => {
  it('strips the username/password from an Atlas SRV URI, keeping only the host', () => {
    expect(safeHostFromUri('mongodb+srv://ops_user:Sup3rS3cretPw@cluster0.example.mongodb.net/catalogues_prod?retryWrites=true'))
      .toBe('cluster0.example.mongodb.net');
  });

  it('strips credentials from a plain mongodb:// URI too', () => {
    expect(safeHostFromUri('mongodb://admin:hunter2@db.internal:27017/earthquake_catalogue'))
      .toBe('db.internal:27017');
  });

  it('never throws or returns anything credential-shaped on a malformed URI', () => {
    const host = safeHostFromUri('not a uri at all');
    expect(host).toBe('unknown-host');
    expect(host).not.toMatch(/:/); // could not leak a "user:pass" shape
  });
});

describe('gs#3 resolveDbTarget delegates to the real lib/mongodb.ts, never re-derives the database name', () => {
  const originalUri = process.env.MONGODB_URI;
  afterEach(() => {
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
    jest.dontMock('@/lib/mongodb');
    jest.dontMock('dotenv');
  });

  it('reports whatever database the real getDb() resolved to, even when it differs from MONGODB_DATABASE-style guessing', async () => {
    jest.resetModules();
    process.env.MONGODB_URI = 'mongodb+srv://user:pw@cluster0.example.mongodb.net/catalogues_prod?retryWrites=true';
    const fakeDb = { databaseName: 'catalogues_prod', collection: jest.fn() };
    jest.doMock('@/lib/mongodb', () => ({
      getDb: jest.fn(async () => fakeDb),
      closeConnection: jest.fn(async () => {}),
    }));
    jest.doMock('dotenv', () => ({ config: jest.fn() }));

    const { resolveDbTarget: freshResolve } = await import('@/scripts/lib/db-target');
    const target = await freshResolve();

    // The old per-script logic (`MONGODB_DATABASE || 'earthquake_catalogue'`)
    // would have reported 'earthquake_catalogue' here, silently diverging from
    // the app's real 'catalogues_prod'.
    expect(target.db.databaseName).toBe('catalogues_prod');
    expect(target.host).toBe('cluster0.example.mongodb.net');
    expect(target.isAtlas).toBe(true);
  });
});

describe('gs#3 write confirmation gate (scripts/lib/confirm.ts, pure/injected — no real stdin)', () => {
  const makeCtx = (overrides: Partial<ConfirmContext> = {}): ConfirmContext => ({
    assumeYes: false,
    isTTY: true,
    prompt: jest.fn(async () => ''),
    ...overrides,
  });

  it('--yes bypasses the prompt entirely', async () => {
    const prompt = jest.fn(async () => 'anything');
    const result = await requireTypedConfirmation('msg', 'expected', makeCtx({ assumeYes: true, prompt }));
    expect(result).toEqual({ ok: true });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('refuses (does not silently proceed) in a non-interactive shell without --yes', async () => {
    const result = await requireTypedConfirmation('About to wipe X', 'X', makeCtx({ isTTY: false }));
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/non-interactive/);
  });

  it('proceeds only when the operator types back exactly the expected text', async () => {
    const prompt = jest.fn(async () => 'catalogues_prod');
    const result = await requireTypedConfirmation('msg', 'catalogues_prod', makeCtx({ prompt }));
    expect(result).toEqual({ ok: true });
  });

  it('refuses when the typed text does not match (typo, wrong database, empty)', async () => {
    const prompt = jest.fn(async () => 'catalogues_prod ');
    const result = await requireTypedConfirmation('msg', 'catalogues_staging', makeCtx({ prompt }));
    expect(result.ok).toBe(false);
  });

  it('trims trailing whitespace/newline from the typed answer before comparing', async () => {
    const prompt = jest.fn(async () => 'yes\n');
    const result = await requireTypedConfirmation('msg', 'yes', makeCtx({ prompt }));
    expect(result).toEqual({ ok: true });
  });

  it('confirmWrite prints only the host and database, never a connection string', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const target = { host: 'cluster0.example.mongodb.net', db: { databaseName: 'catalogues_prod' } };
    await confirmWrite(target, 'About to do something', 'yes', true);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    logSpy.mockRestore();

    expect(logged).toContain('cluster0.example.mongodb.net');
    expect(logged).toContain('catalogues_prod');
    expect(logged).not.toMatch(/:\/\//); // no scheme -> no full connection string
    expect(logged).not.toContain('@'); // no embedded credentials separator
  });
});
