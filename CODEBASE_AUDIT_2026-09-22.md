**Codebase audit — 22 September 2026**

**Repair status — 23 September 2026:** All 13 findings have code fixes. The original
observations below are retained as the audit record. Verification and deployment
requirements are recorded at the end of this file.

Audited the working tree based on commit `4df8cea`, including the existing staged changes. Application code and staged changes were preserved. This review found **13 actionable defects: 3 P1 and 10 P2**, plus dependency advisory alerts. P1 means address before the next production release; P2 means a concrete defect to schedule next. These priorities describe application impact, separately from advisory severity.

The review covered authentication and middleware, upload/storage failure handling, catalogue queries, merging, GeoNet import, parsers and exports, analysis/worker behavior, map rendering, dependencies, and deployment configuration. Findings below are supported by executable probes or direct inspection of the installed dependency code. Database failure probes use controlled mocks; no production database was queried or modified.

1. **[P1] CSP nonces never reach the Next.js script renderer.**

   Location: [middleware.ts:88](/home/kennyg/projects/catalogofcatalogs/middleware.ts:88), [app/layout.tsx:29](/home/kennyg/projects/catalogofcatalogs/app/layout.tsx:29).

   Middleware forwards `x-nonce`, but puts `Content-Security-Policy` only on the response. The layout emits a `csp-nonce` meta tag, which Next.js does not use to nonce its bootstrap scripts. Installed Next.js 15.5.18 reads the nonce from the **request's CSP header** in `node_modules/next/dist/server/app-render/app-render.js:108`. Consequently normal requests produce scripts without the nonce required by the response policy. Production also uses `strict-dynamic`, so the policy blocks the framework scripts needed for hydration and interactivity.

   Evidence: executing the middleware produced a response CSP and a forwarded `x-nonce`, but no forwarded CSP. This matches the requirement in the [official Next.js nonce documentation](https://nextjs.org/docs/app/guides/content-security-policy#how-nonces-work-in-nextjs). Production browser rendering could not be exercised because the build check did not complete.

   Fix: construct one CSP value and set it on both the forwarded request and response. Add a production browser check that verifies hydration and matching nonces on bootstrap scripts.

2. **[P1] Missing pending uploads can attach another event's QuakeML data or silently omit a whole file.**

   Location: [app/api/catalogues/route.ts:815](/home/kennyg/projects/catalogofcatalogs/app/api/catalogues/route.ts:815), [positional join at line 980](/home/kennyg/projects/catalogofcatalogs/app/api/catalogues/route.ts:980), [pending-only path at line 582](/home/kennyg/projects/catalogofcatalogs/app/api/catalogues/route.ts:582).

   In the inline path, absent tokens are skipped while the surviving pending events are concatenated. Those events are then joined to the original browser rows by array position. If file A expires but file B remains, B's full QuakeML data is attached to A's scalar row, including B's source ID, origins, magnitudes, and comments. The pending-only path instead skips the missing file and can return a clean success message based only on the remaining file.

   Evidence: with browser rows A/B and tokens `[expired, present]`, A's stored row acquired `source_id = smi:audit/B` and B's comment while its provenance still identified A. The pending-only probe returned HTTP 201, `partialImport: false`, and “Successfully imported all 1 events.” despite one requested file being absent.

   Fix: fail explicitly when a supplied pending token is missing, or preserve a per-file manifest and stable event identity. Never join a compacted list of surviving uploads by global position. Report omitted files in the response if partial imports are an intentional option.

3. **[P1] Failed parallel uploads can write orphan events after cleanup.**

   Location: [app/api/catalogues/route.ts:488](/home/kennyg/projects/catalogofcatalogs/app/api/catalogues/route.ts:488), [cleanup at line 1038](/home/kennyg/projects/catalogofcatalogs/app/api/catalogues/route.ts:1038).

   Two insert batches run through `Promise.all`. A rejection immediately reaches catalogue cleanup, while the sibling batch remains active and may still be retrying. It can commit after `deleteCatalogue` has removed both the catalogue and the events present at cleanup time. The advertised all-or-nothing behavior therefore leaves inaccessible rows behind.

   Evidence: a 501-row probe failed the first 500-row batch, held the second batch pending, and allowed cleanup to finish and HTTP 500 to return. Releasing the second batch then inserted one orphan row.

   Fix: wait for every launched batch and its retries to settle before deleting partial data. Stop launching further batches after failure and test the delayed-sibling failure case.

4. **[P2] Retried partial writes undercount stored events.**

   Location: [app/api/catalogues/route.ts:450](/home/kennyg/projects/catalogofcatalogs/app/api/catalogues/route.ts:450), [count persistence at line 1028](/home/kennyg/projects/catalogofcatalogs/app/api/catalogues/route.ts:1028).

   A retryable unordered write can commit some rows before throwing. Retrying the same IDs correctly avoids reinserting those rows, but `insertBatchWithRetry` returns only the final attempt's inserted count. The earlier successful writes disappear from catalogue metadata and the response accounting, and are misreported as skipped duplicates.

   Evidence: the first attempt stored one of two rows and raised retryable code 91. The second stored the remaining row. The route reported and persisted one imported event and one duplicate although two rows existed.

   Fix: reconcile the final catalogue count against stored rows before reporting success. Account for persisted IDs across attempts instead of treating the last attempt's count as the operation's total.

5. **[P2] Documented database initialization omits the uniqueness constraint required by ingestion.**

   Location: [scripts/init-database.ts:66](/home/kennyg/projects/catalogofcatalogs/scripts/init-database.ts:66), [scripts/create-indexes.ts:45](/home/kennyg/projects/catalogofcatalogs/scripts/create-indexes.ts:45), [lib/db.ts:841](/home/kennyg/projects/catalogofcatalogs/lib/db.ts:841).

   `bulkInsertEvents` deduplicates only within one call and relies on a unique `(catalogue_id, source_id)` index across calls. The README's initialization command creates only a nonunique single-field source index. The deployment guide's additional index script creates a nonunique compound index. Only the separate `ensure-indexes.ts` attempts the required unique index, and it silently falls back to a nonunique index on failure.

   Impact: duplicate source IDs separated by upload batch boundaries, or inserted concurrently by GeoNet imports, survive on a database created using the documented setup. Counts and scientific analyses then include duplicate earthquakes.

   Evidence: two real `bulkInsertEvents` calls with different row IDs but the same catalogue/source ID both submitted a row to a store with the documented uniqueness constraints. Setup scripts were inspected directly; an actual MongoDB index migration was not run.

   Fix: consolidate index definitions and make the partial unique index a required initialization/migration invariant. Report existing duplicates as a failed migration requiring repair; do not advertise successful integrity setup after installing a nonunique substitute.

6. **[P2] Enabling the unpaginated read limit silently truncates merge inputs.**

   Location: [lib/merge.ts:447](/home/kennyg/projects/catalogofcatalogs/lib/merge.ts:447), [preview at line 3323](/home/kennyg/projects/catalogofcatalogs/lib/merge.ts:3323), [lib/db.ts:940](/home/kennyg/projects/catalogofcatalogs/lib/db.ts:940).

   Both merge paths fetch sources with the unpaginated database method. When `UNPAGINATED_EVENTS_LIMIT` is configured, that method returns only the capped prefix with no truncation metadata. Merge treats it as the complete catalogue and can save or export a successful but incomplete result. The ordinary export route already recognizes this cap and paginates; merge does not.

   Evidence: with the limit set to two and two source catalogues containing three distinct events each, the real merge and database read code returned success with `originalEventCount: 4` and four exported events, rather than six.

   Fix: use an internal complete-data iterator or explicit pagination for both merge and preview, independent of API response-size limits.

7. **[P2] Credential login bypasses the authentication rate limiter.**

   Location: [lib/auth/config.ts:48](/home/kennyg/projects/catalogofcatalogs/lib/auth/config.ts:48), [NextAuth handler](/home/kennyg/projects/catalogofcatalogs/app/api/auth/[...nextauth]/route.ts:9).

   Registration and password endpoints use `authRateLimiter`, but the credentials callback performs database lookup, bcrypt verification, and audit writes without throttling. The NextAuth route directly exports its handler, and middleware excludes `/api/auth`. There is no application-level attempt cap on password guessing or the associated CPU/database work.

   Evidence: twenty consecutive wrong-password attempts all reached password verification and none called the limiter. Any independently configured infrastructure throttling remains outside this audit.

   Fix: enforce bounded credential attempts before password verification, using appropriate account and trusted-client keys and storage shared across deployed instances.

8. **[P2] A reset token can change the password more than once under concurrency.**

   Location: [app/api/auth/reset-password/route.ts:41](/home/kennyg/projects/catalogofcatalogs/app/api/auth/reset-password/route.ts:41), [token consumption at line 82](/home/kennyg/projects/catalogofcatalogs/app/api/auth/reset-password/route.ts:82).

   The route reads an unused token, hashes and writes a password, then marks the token used with an unconditional update. Two simultaneous requests can both pass the initial read and overwrite the password with different values. Session-version invalidation is another separate write.

   Evidence: two concurrent requests with the same token both returned HTTP 200 and both changed the password.

   Fix: atomically claim the unexpired, unused token and permit only the winning request to update credentials. Where supported, commit token consumption and password/session-version changes in one transaction; at minimum update the password and JWT version together on the user document.

9. **[P2] The three-bin safeguard is checked before applying completeness.**

   Location: [lib/seismological-analysis.ts:356](/home/kennyg/projects/catalogofcatalogs/lib/seismological-analysis.ts:356), [workers/seismological-worker.ts:181](/home/kennyg/projects/catalogofcatalogs/workers/seismological-worker.ts:181).

   Populated bins are counted across the input before automatic Mc selection, while the actual b-value uses only events at or above Mc. Incomplete low-magnitude bins can therefore satisfy the three-bin safeguard for a fitted sample that occupies only one bin.

   Evidence: 60 events at M1.0, 10 at M1.1, and 20 at M4.0 produced Mc=1.2 and a reported b-value of approximately 0.152384. Only the M4.0 bin remains above Mc. Both the library and the actual worker message handler returned a fit. This conflicts with the documented minimum-bin safeguard in [the paper](/home/kennyg/projects/catalogofcatalogs/paper/srl_paper.tex:1003).

   Fix: enforce both event-count and populated-bin requirements on the sample actually used for the estimate, after selecting Mc.

10. **[P2] Fit quality is scored against observations excluded from the fit.**

    Location: [lib/seismological-analysis.ts:405](/home/kennyg/projects/catalogofcatalogs/lib/seismological-analysis.ts:405), [workers/seismological-worker.ts:223](/home/kennyg/projects/catalogofcatalogs/workers/seismological-worker.ts:223), [UI grading](/home/kennyg/projects/catalogofcatalogs/app/analytics/page.tsx:1655).

    The model is estimated above Mc, but R² includes every cumulative bin below Mc as well. Changes confined to the excluded, incomplete part of a catalogue alter the displayed quality of an otherwise identical fit.

    Evidence: keeping the complete sample, Mc, a-value, and b-value identical while changing only counts at M2.0/M2.1 changed R² from 0.988289 to 0.864598. The UI consequently changes its label from “Excellent” to “Fair.”

    Fix: compute fit diagnostics over the fitted magnitude domain. The full histogram can remain visible, with the excluded domain identified separately.

11. **[P2] Catalogue names are interpreted as HTML in map popups.**

    Location: [components/merge/DuplicateGroupMap.tsx:171](/home/kennyg/projects/catalogofcatalogs/components/merge/DuplicateGroupMap.tsx:171). The same unsafe interpolation pattern appears for station strings in [StationMarker.tsx:63](/home/kennyg/projects/catalogofcatalogs/components/advanced-viz/StationMarker.tsx:63).

    Catalogue names are user-controlled strings and are interpolated directly into the HTML passed to Leaflet's `bindPopup`. This bypasses React's text escaping. An editor can persist markup that another reviewer sees as real popup elements, including forged forms and UI.

    Evidence: a catalogue name containing a harmless probe form became actual `form` and `input` elements in the rendered popup HTML. This confirms stored HTML injection. JavaScript execution was not demonstrated, and the existing CSP restricts ordinary inline-handler payloads; this finding should not be read as a demonstrated CSP bypass.

    Fix: build popup DOM with `textContent`, render escaped React content into an element, or consistently HTML-escape every untrusted interpolated string.

12. **[P2] The supported Node 18 runtime cannot load authentication.**

    Location: [package.json:7](/home/kennyg/projects/catalogofcatalogs/package.json:7), [uuid override at line 119](/home/kennyg/projects/catalogofcatalogs/package.json:119), [CI matrix](/home/kennyg/projects/catalogofcatalogs/.github/workflows/test.yml:16).

    The project advertises Node >=18 and tests an 18.x matrix entry, but globally overrides NextAuth's CommonJS-compatible UUID dependency with ESM-only UUID 14. Installed MongoDB 7 also declares Node >=20.19.0. Mocked authentication tests conceal the runtime import failure.

    Evidence: using the installed Node 18.20.7 binary to run `require('next-auth')` failed with `ERR_REQUIRE_ESM` from `next-auth/jwt/index.js` requiring `uuid/dist-node/index.js`.

    Fix: align package engines, README, runtime checks, CI, and deployment images with a supported runtime satisfying the installed dependencies, or deliberately restore Node 18-compatible dependencies. Scope major-version overrides to compatible consumers and add a real authentication import/startup smoke check.

13. **[P2] A malformed Bearer header crashes middleware request handling.**

    Location: [middleware.ts:45](/home/kennyg/projects/catalogofcatalogs/middleware.ts:45), [locked NextAuth dependency](/home/kennyg/projects/catalogofcatalogs/package-lock.json:10424).

    Installed NextAuth 4.24.14 decodes a bearer value before its exception handler. `withAuth` calls that helper without catching the error, before this application's middleware callback runs. A request without a session cookie and with `Authorization: Bearer %` therefore throws instead of returning an unauthenticated result.

    Evidence: invoking the real application middleware through `node --import tsx` with that header rejected with `URIError: URI malformed`. No database connection or external request was involved. Impact is an unauthenticated per-request availability failure, not authentication bypass or proof of a whole-process crash. This is covered by the [maintainer advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj).

    Fix: update NextAuth to a patched release, at least 4.24.15 for this advisory, and retain a middleware regression test using the real token parser.

**Dependency advisory results**

The network-enabled `npm audit --json` reported **14 vulnerable package entries: 2 critical, 9 high, 1 moderate, and 2 low**. These totals include transitive and development dependencies; they are not a count of demonstrated application exploits.

| Package group | Installed / reported status | Assessment |
| --- | --- | --- |
| `next` | 15.5.18; critical | Maintainer advisories identify fixes in 15.5.24 for [AVIF image optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and [Windows-hosted RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36). The supplied Docker image uses Linux. No attacker-controlled AVIF optimization path was established. Upgrade and recheck deployment-specific exposure. |
| `next-auth` | 4.24.14; critical aggregate rating | The malformed-header defect is reproduced above. The configured provider is credentials-only, so email-provider and multi-provider OAuth advisory preconditions were not established. [OAuth advisory and patched versions](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279). |
| `echarts` | 5.6.0; moderate | The registry flags an XSS advisory and proposes 6.1.0, a major upgrade. Applicability to the configured chart features was not established; review migration and reachability before changing versions. |
| Other flagged entries | `@babel/core`, `brace-expansion`, `browserslist`, `ip-address`, `js-yaml`, `nanoid`, `postcss`, `postcss-selector-parser`, `sharp`, `undici`, `ws` | Assess production reachability and update compatible versions. The registry reports fixes available. |

The security workflow currently allows `npm audit` failure and also suppresses failure in its reporting step. Thus the reported dependency state does not block CI. No dependency files were changed or automatic fixes applied.

**Verification and limits**

- Type checking: `tsc --noEmit --incremental false` passed.
- Lint: passed with two existing `react-hooks/exhaustive-deps` warnings at `app/merge/page.tsx:927` and `:1109`.
- Existing tests: the full run reported 1,601 passing tests, 44 skipped tests, and one sandbox-blocked Node subprocess. Rerunning the affected timezone suite outside the sandbox passed all eight tests. Across those runs, all 1,602 non-skipped tests passed; 111 suites were exercised and two suites were skipped.
- Focused audit probes: 13 assertions across seven isolated suites reproduced the current failure behavior, including the worker, route handlers, and popup markup. Additional direct runtime checks reproduced the Node 18 import failure and malformed-header middleware failure. These are defect demonstrations, not a claim that the desired behavior passes.
- Production build: the sandboxed build failed fetching Inter from `fonts.googleapis.com` (`EAI_AGAIN`). A network-enabled retry stopped producing output after initialization and was cancelled after several minutes. A successful production build and browser smoke test remain unverified.
- Dependency scan: completed against the npm advisory registry with network access; the initial sandboxed attempt was blocked by DNS restrictions.
- No live MongoDB concurrency/index test, production deployment inspection, coverage run, or exhaustive browser test was performed. The suite contains 85 literal `expect(true).toBe(true)` assertions, including API placeholders, so its pass count alone overstates behavioral coverage.

Temporary evidence is retained in `/tmp/catalogue-deep-audit/` and `/tmp/catalogue-audit-*.log`; the dependency result is `/tmp/catalogue-audit-dependencies-unrestricted.json`. The isolated probes can be rerun from the repository root with:

```sh
./node_modules/.bin/jest --config /tmp/catalogue-deep-audit/jest.config.cjs --runInBand
```

Recommended repair order: restore CSP nonce propagation; fix pending-upload identity and batch cleanup; reconcile writes and enforce database uniqueness; patch and verify authentication dependencies and runtime support; then repair analysis safeguards and popup rendering.

**Repairs applied — 23 September 2026**

| Finding | Implemented repair | Regression evidence |
| --- | --- | --- |
| 1 — CSP | Forward the same CSP to Next.js and the browser; pass the nonce to next-themes; explicitly permit same-origin workers. Handle login outside NextAuth's sign-in-page bypass. | Real middleware runtime check and production Chromium checks on `/login` and `/catalogues`, including nonce equality, theme interaction, and zero CSP violations. |
| 2 — Pending uploads | Reject missing, expired, invalid, repeated, or count-mismatched tokens; never fall back to compacted pending metadata. Roll back streamed imports if any file is absent. Filter expiry in queries and close cursors. | Inline and streamed route regressions; live MongoDB expiry check. |
| 3 — Orphan writes | Await every launched batch and its retries before cleanup; do not launch another window after failure. | Delayed sibling regression proves cleanup waits and the third batch never starts. |
| 4 — Retry counts | Reconcile final event counts against MongoDB before marking the catalogue complete. | Partial-commit/retry regression stores and reports both events. |
| 5 — Required indexes | Share required unique row-ID and partial unique catalogue/source indexes across all three setup scripts; fail on incompatible data/indexes. Remove the nonunique fallback. | Live concurrent writes store one source event; source-less rows remain allowed; legacy duplicates fail setup. |
| 6 — Merge truncation | Explicitly paginate full inputs for merge and preview independently of the public API cap. | Real DB-query code with capped reads and multiple pages yields all six input rows in both paths. |
| 7 — Login throttling | Atomic, shared MongoDB counters before user lookup/bcrypt: 10 attempts per normalized account and 50 per trusted client per fixed 15-minute window. TTL expiry; hashed keys; fail closed on store failure. | Concurrent credential and spraying tests; live MongoDB concurrency and TTL-index checks. |
| 8 — Password reset | Atomically claim each unused, unexpired token; compare the existing password hash when updating; change password and JWT version in one user write. Apply the same atomic password/version update to password changes. | Real concurrent resets produce exactly one success, the winning password, and one version increment. |
| 9 — Bin safeguard | Count populated bins in the complete sample actually used by the estimator. | Library and real worker withhold the one-bin complete sample. |
| 10 — Fit quality | Score R² and draw the fitted line only over the fitted domain; retain the complete histogram. | Changing only the excluded tail leaves the fitted score unchanged; worker parity checks pass. |
| 11 — Popup HTML | Share HTML text escaping across catalogue and station popups and chart tooltips; restrict marker colors to hex values. | Injected forms remain literal text in catalogue and station popups. |
| 12 — Runtime | Align engines, runtime checks, `.nvmrc`, Docker, docs, and CI around Node 22.12+ / 24. Remove the incompatible global UUID override. | Real authentication import/middleware smoke test; CI matrix covers Node 22 and 24. |
| 13 — Malformed headers | Upgrade NextAuth to 4.24.15. | Real parser returns a public response or login redirect for malformed Bearer values without throwing. |

Dependency repairs installed Next.js **15.5.26**, NextAuth **4.24.15**, and ECharts
**6.1.0**, plus compatible transitive security updates. Removed the unused direct
Nano ID dependency; the required PostCSS dependency uses patched Nano ID 3.3.19.
The final online npm advisory scan reports **zero vulnerabilities**. CI now fails
on advisories rated moderate or higher.

The ECharts migration preserves the previous chart theme and tightens axis types;
component regressions and a real SVG render pass. Migration decisions follow the
[Apache ECharts 6 upgrade guide](https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/).
The runtime matrix uses the Node 22 and 24 LTS lines listed by the
[Node.js release project](https://github.com/nodejs/Release).

New repeatable commands are `npm run test:runtime`, `npm run test:database`
(with an explicit disposable `MONGODB_TEST_URI`), and `npm run test:browser`
(with `PRODUCTION_TEST_URL` pointing to a running production test server).
CI runs all three, including a disposable MongoDB service and Chromium.

Deployment requirements: use the supported Node runtime and rerun
`npx tsx scripts/init-database.ts` on the target database before enabling imports.
Existing duplicate data or conflicting index definitions require reviewed repair;
setup deliberately does not delete data. The app's MongoDB role must permit the
login limiter's TTL-index creation. Set `TRUSTED_PROXY_HOPS` to match an ingress
that controls forwarding headers and prevents direct bypass.

Password reset remains compatible with standalone MongoDB: token claim precedes
the atomic user update rather than requiring a multi-document transaction. If that
later write fails, the token remains consumed and the user needs a fresh reset link.
No application database or production deployment was modified. Existing staged
work was preserved; repairs are additional working-tree changes.

**Final verification**

- Full coverage run: **119 suites and 1,627 tests passed**; the existing 2 skipped
  suites / 44 skipped tests remain. Coverage gates passed: statements 74.45%,
  branches 68.37%, functions 77.40%, lines 75.25% of the configured library scope.
  The original suite's placeholder assertions remain a coverage limitation.
- Type checking passed; lint passed with **no warnings or errors**, including repairs
  to the two previously reported merge-page hook warnings.
- Production build passed on Node **22.23.2** / Next.js **15.5.26** in an isolated
  working-tree copy. A real Chromium session verified `/login` and `/catalogues`
  under the production CSP, including working theme controls, matching script
  nonces, and zero script errors or CSP violations.
- Real authentication startup/malformed-header checks passed on **Node 22 and 24**.
- Disposable MongoDB **8.2.6** verified uniqueness under concurrent ingestion,
  account throttling under concurrent requests, single-use password resets with
  an atomic session-version increment, and pending-upload expiry. The test database
  was dropped and its server stopped afterwards.
- Final online `npm audit --json`: **0 vulnerabilities** after adding the persistent
  browser regression tooling. Package/lockfile consistency, CI YAML parsing, and
  `git diff --check` passed.

Final evidence logs are `/tmp/catalogue-fix-coverage.log`,
`/tmp/catalogue-fix-types.log`, `/tmp/catalogue-fix-lint.log`,
`/tmp/catalogue-fix-build-network.log`, `/tmp/catalogue-fix-browser.log`,
`/tmp/catalogue-fix-database.log`, and `/tmp/catalogue-fix-audit-final.json`.
