**Critical code review — 25 September 2026**

Reviewed commit `a879a00` (which includes the 22 September audit repairs). The question
was whether the platform is **accurate** (scientifically, numerically, and in units and
conventions) and whether its **logic holds together**.

**Method.** Thirteen specialist reviewers each read one subsystem in full: statistics
engine, analytics UI, merge, parsers, upload pipeline, database/API, exporters,
quality/uncertainty, geospatial/maps, GeoNet import, auth/security, the prior-audit
repairs, and paper/docs-versus-code. Five follow-up reviewers then covered areas no
first-pass reviewer read. Every finding went to independent verifiers told to *refute*
it; high-severity findings got three verifiers with different lenses (reproduce, domain
premise, reachability). The first pass ran twice, so most findings were verified twice
independently. Findings were then de-duplicated by root cause. No repository files were
modified by the review, no database or network service was touched, and probes ran
against the real modules from the scratchpad.

**Baseline.** `tsc --noEmit` passes; lint is clean; the Jest suite passes (119 suites,
1,627 tests, 44 skipped). The local shell runs Node 20.19.6, below the repo's own
`^22.12.0 || ^24` engines field, and nothing enforces that locally.

---

## Verdict

The platform's plumbing is mostly sound — authentication, the repaired upload and
index integrity, antimeridian geometry in the merge matcher, QuakeML parsing, and most
of the validation layer are careful work, and the test suite is broad. **But several
results a scientist would publish from it are wrong or unreliable today:**

1. **The headline b-value is biased about 10% low** for any catalogue whose magnitudes
   are not already rounded to 0.1 — which includes every GeoNet import. A true b = 1.0
   reports as ≈ 0.90 (reproduced: 0.902 with Mc fixed, 0.897 via the Analytics tab's
   automatic Mc; the same data rounded to 0.1 gives 1.006).
2. **The upload schema-mapping step undoes the parser's careful normalisation.** Raw
   cells are copied back over parsed values, so date-order detection, metre→km depth
   conversion and 0–360° longitude handling are silently lost, and common headers
   (`Ms`, `min`, `type`, `depth_m`) are auto-mapped to the wrong fields.
3. **The merge can associate the wrong reports and publish Frankenstein origins.** The
   greedy association is order-dependent in dense sequences (deleting one real event
   and duplicating another), and the field "union" stamps one agency's solution
   metadata (agency, gap, station counts, RMS, status) onto another agency's
   hypocentre. The QuakeML exporter then writes the merged hypocentre *under a
   contributing agency's origin publicID*.
4. **The paper and supplement describe behaviour and figures the code does not
   produce**, including supplement figures that are artifacts of a since-fixed binning
   bug, a quality-score claim the implemented index cannot deliver, and derivation
   errors in the merge-strategies manuscript.

None of these is visible from the test suite, because the tests round synthetic
magnitudes, exercise the parser without the UI mapping step, and in places encode the
wrong expectation.

Severity scale: **High** = wrong results in common use, or data loss. **Medium** =
wrong in plausible cases, or a security/integrity gap with real preconditions. **Low**
= edge cases, misleading labels, docs. No finding reached *critical*.

---

## High severity

### H1. b-value biased ~10% low on unrounded magnitudes (GeoNet, ComCat, ISC)
[lib/seismological-analysis.ts:390](lib/seismological-analysis.ts#L390),
[workers/seismological-worker.ts:213](workers/seismological-worker.ts#L213)

`b = log10(e) / (M̄ − (Mc − ΔM/2))` applies the Utsu/Bender half-bin correction
unconditionally. That correction is only valid when magnitudes are *reported* on a ΔM
grid, so that the cut `M ≥ Mc` really admits `[Mc − ΔM/2, ∞)`. Here the mean and the cut
use raw magnitudes and nothing rounds them (GeoNet import stores `parseFloat` values), so
for continuous data the estimator returns `b / (1 + 0.05·b·ln10)` ≈ 0.897 b. The a-value,
fitted line and per-cluster b-values inherit the bias, and the b < 0.8 "stress
accumulation" badge fires for true b ≈ 0.88. Found independently by three reviewers;
reproduced through both the library and the real worker.

*Fix:* either round magnitudes to the analysis grid (nearest, not floor) before MAXC,
the cut and the mean, keeping ΔM/2; or infer the reporting resolution δ from the data
and use δ/2 (0 for continuous data). Change both copies, add a test with unrounded
synthetic magnitudes, and state in the paper (`srl_paper.tex:944–949`) that ΔM is the
reporting resolution.

### H2. Schema mapping copies raw cells over the parser's normalised values
[app/upload/page.tsx:216](app/upload/page.tsx#L216),
[app/api/catalogues/route.ts:304](app/api/catalogues/route.ts#L304)

The parser makes file-level decisions once (day/month order, depth and uncertainty
units, 0–360° longitudes, preferred magnitude). Each parsed event also keeps the raw
columns. The schema mapper auto-maps those same raw columns (`datetime`, `lon`, `dep`,
`depth_m`, `herr` …) and both save paths (`applyUIMappings` inline,
`applyFieldMappingsToPendingEvent` for large files) copy the **raw** cell back onto
the target. "Do not map" has no effect either, because the stored row starts from the
parser's event (`{ ...event }`), and only the first file's columns are offered for
mapping.

*Example:* `datetime,lat,lon,dep` with `03/04/2024 10:00:00,-29.3,182.1,800`: the
parser yields 2024-03-04, lon −177.9, depth 0.8 km; the stored row has 2024-04-03, lon
182.1 (rejected), depth 800 km. Within one file, depth units can end up mixed per row.

*Fix:* send the final mapping to the server and re-run the parser with it as the alias
table, so every normalisation happens once. Build rows only from the final mapping.

### H3. Auto-mapping sends common seismological headers to the wrong fields
[lib/field-definitions.ts:768](lib/field-definitions.ts#L768),
[lib/field-definitions.ts:606](lib/field-definitions.ts#L606),
[components/upload/EnhancedSchemaMapper.tsx:249](components/upload/EnhancedSchemaMapper.tsx#L249)

Bidirectional substring matching accepts any header contained in an alias. Verified:
`Ms` → `standard_error` (inside `rms`), `min` → `min_horizontal_uncertainty` (inside
`smin`), `depth_m` → `depth` with no unit conversion, `type` → `magnitude_type` (so
ComCat event types like `quarry blast` become a magnitude scale and blasts stay in the
statistics). The mapper also forces named magnitude columns (ML, mb) onto `magnitude`
*after* the parser's Mw > generic > ML choice, keeping the wrong `magnitude_type`
(`Mw,mb = 6.1,5.6` stores 5.6 labelled Mw).

*Fix:* require token-boundary matches and a minimum alias length; add negative entries
for magnitude scale names and date/time parts; move `type` to `event_type` or resolve by
value; stop injecting named-magnitude columns into the mapping.

### H4. Greedy merge association picks the wrong partner in dense sequences
[lib/merge.ts:1341](lib/merge.ts#L1341), [lib/merge.ts:1155](lib/merge.ts#L1155)

Each anchor, in time order, takes every other-source candidate in its window without
checking whether that candidate matches a later event from the anchor's own source
better. With the UI default (60 s / 10 km): GeoNet A1 (t = 0) and A2 (t = 40 s), ISC B1
(t = 39 s, 1 km from A2) → groups `[[A1,B1],[A2]]`. The merged catalogue then holds two
records of one earthquake 1 s apart, and A1 survives only in provenance. The salvage
split for failed groups ranks candidates by |ΔM| rather than space-time distance, so it
also keeps the wrong partner. The merge white paper names this exact regime as a
limitation.

*Fix:* one-to-one assignment by normalised space-time distance (mutual nearest
neighbour, or min-cost assignment per candidate component), with magnitude only as a
tie-breaker.

### H5. Merge "field union" mixes one agency's origin metadata into another's origin
[lib/merge.ts:1784](lib/merge.ts#L1784)

`UNION_SCALAR_FIELDS` fills nulls on the chosen row from the highest-quality member
regardless of source: `agency_id`, `author`, `method_id`, `earth_model_id`,
`azimuthal_gap`, station and phase counts, `standard_error`, distances,
`time_uncertainty`, and evaluation mode and status. These describe a single origin
solution (QuakeML BED Origin/OriginQuality/CreationInfo). The code already keeps
location, depth and magnitude metadata with their own solution; origin metadata needs
the same rule. The `average` strategy has the mirror problem. The quality score is then
computed from the mixed record.

*Fix:* add an `ORIGIN_META_FIELDS` set filled only from the member whose time and
epicentre were published; null them in `mergeByAverage`.

### H6. QuakeML export of merged rows rewrites a contributing agency's origin
[lib/quakeml-exporter.ts:1096](lib/quakeml-exporter.ts#L1096),
[lib/quakeml-exporter.ts:1351](lib/quakeml-exporter.ts#L1351)

`applyMergedOriginValues` copies a source origin and overwrites its time, latitude,
longitude and depth with the merged values. It keeps that agency's `publicID`,
`creationInfo`, quality, method and arrivals, whose residuals belong to the replaced
hypocentre. The agency's real solution disappears from the file, and values it never
reported are published under its identifier. Separately, when the preferred origin is
not first, its arrivals are also attached to `origins[0]`. That duplicates arrival
publicIDs on the wrong solution. The magnitude path in the same file was already fixed
for exactly this reason (line 1286).

*Fix:* leave source origins untouched; emit the merged hypocentre as a new local
origin (`smi:local/origin/<id>-merged`) and point `preferredOriginID` at it. Attach
standalone arrivals only to the preferred origin.

### H7. Temporary-network import script stores origin times shifted by the host's UTC offset
[scripts/import-temp-networks.ts:364](scripts/import-temp-networks.ts#L364),
[line 262](scripts/import-temp-networks.ts#L262)

FDSN text times carry no zone designator. `new Date(event.time)` reads them as local
time (ECMA-262), so on an NZ machine every event in all seven temporary-network
catalogues, and their time extents, are 12–13 h early. Matching against GeoNet (windows
of seconds) then fails for every event. If these catalogues were imported from an NZ
machine, the stored data needs repair.

*Fix:* use `normalizeTimestamp()` (as the main importer does); re-import affected
catalogues.

---

## Medium severity

### Statistics and analytics

- **M1. Mc shown by the G-R fit bypasses the 50-event floor.** `calculateGutenbergRichter`
  runs its own MAXC from 10 events and shows it as "Mc (Completeness)", while
  `estimateCompletenessMagnitude` refuses below 50 (the paper's stated floor). The same Mc
  drives per-cluster b-values. [lib/seismological-analysis.ts:366](lib/seismological-analysis.ts#L366)
- **M2. The magnitude slider feeds MAXC, so "Mc" becomes cut + 0.2.** On a truncated
  sample, MAXC peaks at the first bin by construction. The tool therefore reports Mc =
  cut + 0.2 as the catalogue's completeness and discards ~36% of the events the user kept.
  `minMagnitude` is supported by the worker but never passed.
  [hooks/use-seismological-worker.ts:96](hooks/use-seismological-worker.ts#L96)
- **M3. "Load All Catalogues" double-counts.** Source and merged catalogues are pooled
  and de-duplicated only by row id (merged rows get new ids), so moment, rates, clusters
  and b-value count each earthquake once per catalogue holding it (probe: 3× moment,
  2,953 "clusters" that are one earthquake's copies). The dashboard's "Total earthquake
  events" has the same flaw. [app/analytics/page.tsx:252](app/analytics/page.tsx#L252),
  [components/dashboard/StatisticsCards.tsx:46](components/dashboard/StatisticsCards.tsx#L46)
- **M4. The default depth filter drops null and negative depths from magnitude-only
  analyses.** A catalogue with no depth column gets no analyses at all, and the slider
  cannot reach the validator's −5 km. [app/analytics/page.tsx:303](app/analytics/page.tsx#L303)
- **M5. b and Mc are fitted over mixed magnitude scales with no warning.** The paper
  claims CofC warns about this. [app/analytics/page.tsx:1602](app/analytics/page.tsx#L1602)
- **M6. Gardner-Knopoff declustering is O(N²) with per-comparison date parsing.** 10k
  events take 22 s; national catalogues effectively never finish, and they block the cheap
  time series sent in the same worker message.
  [lib/seismological-analysis.ts:571](lib/seismological-analysis.ts#L571)

### Ingestion and upload

- **M7. Day/month order is detected from the first 50 rows only.** Time-sorted US-format
  catalogues whose first 50 events fall on days 1–12 are split between two calendars.
  `parseJSON` does no detection at all.
  [lib/parsers.ts:386](lib/parsers.ts#L386), [lib/parsers.ts:657](lib/parsers.ts#L657)
- **M8. Unrecognised timestamp shapes fall through to `new Date()`**, which uses server
  local time and MM/DD order: 2-digit years, `YYYY/MM/DD HH:MM`, 7-digit fractional
  seconds (SQL Server/.NET). Day-of-year and impossible dates roll over into wrong but
  valid dates. [lib/earthquake-utils.ts:538](lib/earthquake-utils.ts#L538),
  [:231](lib/earthquake-utils.ts#L231), [:472](lib/earthquake-utils.ts#L472)
- **M9. Separate `date` and `time` columns are never combined.** Every row is rejected
  as "Invalid timestamp format". [lib/parsers.ts:1552](lib/parsers.ts#L1552)
- **M10. Chunked uploads (> 3.5 MB) pass the delimiter *name* (`'comma'`) to the parser.**
  Any explicit delimiter choice yields zero events; the same file under 3.5 MB works.
  [app/api/upload/finalize/route.ts:182](app/api/upload/finalize/route.ts#L182)
- **M11. The chunked path keeps a UTF-8 BOM.** Large BOM-prefixed JSON/GeoJSON fail to
  parse (`Buffer.toString` versus `File.text()`).
  [lib/upload-chunks.ts:192](lib/upload-chunks.ts#L192)
- **M12. Pending-upload tokens are keyed by file name and joined to rows by position**
  (the repair for prior-audit #2 is incomplete). Same-named files collapse to one token,
  retries resend removed files, and permuted tokens attach one file's QuakeML identity to
  another file's rows. The server returns 201 in each case.
  [app/upload/page.tsx:470](app/upload/page.tsx#L470),
  [app/api/catalogues/route.ts:991](app/api/catalogues/route.ts#L991)
- **M13. The UI reports the browser's parse count, not what the server stored.** The
  server's `importMessage`/`validationReport` (duplicates skipped, rejections) are
  ignored, and the stored `validation_summary` is the browser's.
  [app/upload/page.tsx:791](app/upload/page.tsx#L791)
- **M14. The inline-versus-pending threshold uses source bytes.** The JSON payload is
  ~5× larger, so 0.8–3.5 MB files exceed the documented Vercel 4.5 MB limit, and
  finalize returns every event. [app/upload/page.tsx:679](app/upload/page.tsx#L679)

### Merge

- **M15. GeoNet's bare `M` magnitude type is unrecognised**, so the most common NZ
  duplicate pairing (GeoNet M vs ISC mb) fails the magnitude gate and stays duplicated.
  [lib/merge.ts:2380](lib/merge.ts#L2380)
- **M16. The default "Newest" strategy keeps the latest *origin time*, not the latest
  determination.** The UI and paper describe it as "most recently updated"; the actual
  effect is close to arbitrary. [lib/merge.ts:3289](lib/merge.ts#L3289)
- **M17. Inverse-variance averaging gives a solution with no uncertainty σ = 1 km**, so it
  outweighs documented solutions. A test asserts this.
  [lib/merge.ts:2931](lib/merge.ts#L2931)
- **M18. The magnitude hierarchy publishes raw mb over ML** (mb saturates earlier) and
  accepts a *rejected* `Mw(mB)` over the preferred magnitude.
  [lib/merge.ts:2483](lib/merge.ts#L2483)
- **M19. Depth selection ignores `depth_type`.** A fixed depth reported with 0
  uncertainty beats a free depth, contrary to the white paper.
  [lib/merge.ts:2847](lib/merge.ts#L2847)
- **M20. Agency identity comes from substrings of the catalogue display name.**
  "Franz Josef" or "USGS … NZ" is ranked as GeoNet-authoritative. "Custom Order" has no
  implementation. [lib/merge.ts:2506](lib/merge.ts#L2506)
- **M21. Focal-mechanism authority selection never runs on stored rows.** It reads
  `event.quakeml`, which DB rows lack, so other agencies' mechanisms are dropped.
  [lib/merge.ts:1946](lib/merge.ts#L1946)
- **M22. Merge-page export uses the capped unpaginated read**, and merge input
  pagination uses skip/offset outside the transaction, so concurrent writes duplicate or
  drop rows (prior-audit #6 repair incomplete).
  [app/merge/page.tsx:484](app/merge/page.tsx#L484), [lib/merge.ts:14](lib/merge.ts#L14)
- **M23. The CSV "Source" column names the earliest group member**, not the agency whose
  solution was kept. [lib/exporters.ts:905](lib/exporters.ts#L905)

### Export

- **M24. Event and depth types the DB accepts are not QuakeML BED values** (`tremor`,
  `volcano-tectonic` …). Exports fail XSD validation and ObsPy drops those events. The
  depth-type allow-list is also wrong (case-sensitivity bug).
  [lib/quakeml-exporter.ts:1486](lib/quakeml-exporter.ts#L1486)
- **M25. GeoNet EventIDs are lost in QuakeML.** The publicID falls back to an internal cuid
  that changes on re-import. [lib/quakeml-exporter.ts:1198](lib/quakeml-exporter.ts#L1198)
- **M26. Strings from stored JSON blobs are interpolated into QuakeML unescaped** (XML
  injection or malformed export); control characters also break well-formedness.
  [lib/quakeml-exporter.ts:67](lib/quakeml-exporter.ts#L67),
  [:1002](lib/quakeml-exporter.ts#L1002)
- **M27. The platform cannot re-import its own JSON export** (nested versus flat fields).
  [lib/exporters.ts:709](lib/exporters.ts#L709)
- **M28. Browser-side merged downloads omit merge strategy, thresholds and sources.**
  In export-only mode that makes the result irreproducible.
  [components/merge/MergeActions.tsx:146](components/merge/MergeActions.tsx#L146)

### Quality, uncertainty, focal mechanisms

- **M29. The quality index Q has no upper bound.** Negative or −999 sentinel uncertainties
  *add* points; the upload report showed "Excellent (A+) 334/100".
  [lib/quality-scoring.ts:211](lib/quality-scoring.ts#L211)
- **M30. `quality_score` is never stored.** The table column, "With Quality Score" card and
  quality sort are always empty, and the two tables use different scales.
  [app/catalogues/[id]/page.tsx:92](app/catalogues/[id]/page.tsx#L92)
- **M31. The quality legend on the live map uses stale grade bands** that contradict
  `getQualityColor` and paper Table 2. Every colour is labelled one grade off.
  [components/visualize/UnifiedEarthquakeMap.tsx:452](components/visualize/UnifiedEarthquakeMap.tsx#L452)
- **M32. The preferred focal mechanism is ignored** (index 0 is always drawn), and the
  GeoNet path loses `preferredPlane` when rebuilding the XML.
  [lib/focal-mechanism-utils.ts:78](lib/focal-mechanism-utils.ts#L78),
  [lib/geonet-import-service.ts:772](lib/geonet-import-service.ts#L772)
- **M33. Fault type depends on which nodal plane is listed first**, and 0–360° rakes are
  misclassified (rake 270 is reported as "right-lateral strike-slip").
  [lib/focal-mechanism-utils.ts:353](lib/focal-mechanism-utils.ts#L353)
- **M34. "With Uncertainty" ignores horizontal and depth uncertainty**, so GeoNet and
  USGS catalogues report 0%. [lib/db.ts:1109](lib/db.ts#L1109)

### GeoNet import and geography

- **M35. The import route reads the form's "UTC" date range in server-local time.**
  [app/api/import/geonet/route.ts:52](app/api/import/geonet/route.ts#L52)
- **M36. The import form never sends a `catalogueId`**, so every import creates a new
  catalogue and "Update existing events" does nothing.
  [components/import/ImportForm.tsx:133](components/import/ImportForm.tsx#L133)
- **M37. GeoNet `duplicate` / `not locatable` / `outside of network interest` types become
  null**, so events GeoNet flagged as duplicates are stored as ordinary events.
  [lib/geonet-import-service.ts:991](lib/geonet-import-service.ts#L991)
- **M38. The "New Zealand (All)" preset (166–179°E) excludes the Chathams, the Kermadecs
  and everything east of 179°E.** The import form also rejects the antimeridian-crossing
  boxes the server supports.
  [components/catalogues/RegionSelectorMap.tsx:178](components/catalogues/RegionSelectorMap.tsx#L178),
  [components/import/ImportForm.tsx:122](components/import/ImportForm.tsx#L122)

### Security, API and data integrity

- **M39. The custom `/api/auth/session` returns `{user:null}`**, which next-auth treats as
  truthy. Every anonymous visitor is "authenticated": no Login entry in the menu, and
  "Editor access required" instead of "Log in".
  [app/api/auth/session/route.ts:14](app/api/auth/session/route.ts#L14)
- **M40. The new login limiter allows account-lockout DoS.** The per-account counter is
  keyed only on the submitted email and counts before password checks, so 10 requests per
  15 minutes lock out any admin (regression from the prior-audit #7 repair). The
  rate-limit client key comes from spoofable `X-Forwarded-For` in the shipped
  docker-compose topology, and a non-numeric `TRUSTED_PROXY_HOPS` collapses every client
  into one bucket.
  [lib/auth/login-rate-limit.ts:38](lib/auth/login-rate-limit.ts#L38),
  [lib/rate-limiter.ts:185](lib/rate-limiter.ts#L185)
- **M41. Role-request approval applies a stale snapshot.** It can demote an admin, or
  re-elevate a user who has since been demoted.
  [app/api/role-requests/[id]/route.ts:100](app/api/role-requests/[id]/route.ts#L100)
- **M42. The CSP `img-src` blocks two of the five base layers** (Esri satellite,
  OpenTopoMap). [middleware.ts:25](middleware.ts#L25)
- **M43. `/api/faults/nearby` is anonymous, unthrottled and uncapped.** One request fanned
  out to 405 upstream WFS calls in a probe.
  [app/api/faults/nearby/route.ts:28](app/api/faults/nearby/route.ts#L28)
- **M44. Saved filters have no owner.** Any self-registered viewer can overwrite or delete
  everyone's filters, and the list is served without authentication.
  [app/api/saved-filters/[id]/route.ts:118](app/api/saved-filters/[id]/route.ts#L118)
- **M45. `/api/events/search` accepts `limit=0` (no limit)**, so any viewer can load the
  whole events collection into memory.
  [app/api/events/search/route.ts:35](app/api/events/search/route.ts#L35)
- **M46. The catalogue-list cache is never invalidated** by delete, rename, merge or GeoNet
  import. Deleted catalogues reappear, and new merged catalogues show "not found".
  [app/api/catalogues/[id]/route.ts:139](app/api/catalogues/[id]/route.ts#L139)
- **M47. Privilege changes, deactivations, deletions and password resets are never
  audit-logged.** [app/api/users/[id]/route.ts:115](app/api/users/[id]/route.ts#L115)

### Paper and documentation

- **M48. Supplement Figs S1–S3 are artifacts of the since-fixed binning bug.** Mc = 2.4,
  41.8% and b = 0.963 show the old floor-binning signature; current code gives Mc = 2.2.
  The S3 caption contradicts its own screenshot.
  [paper/srl_supplement.tex:61](paper/srl_supplement.tex#L61)
- **M49. The abstract, conclusions and Fig 2 caption say quality scoring "isolates" the
  gap > 180° population.** In Eq. 1 the gap moves Q by at most 12.5 points: a 330° gap
  event still scores 74 (B) and passes the paper's own Q ≥ 70 cut. The worked example
  uses a gap-driven surrogate, not Eq. 1.
  [paper/srl_paper.tex:1600](paper/srl_paper.tex#L1600)
- **M50. merge_strategies.tex has derivation errors.** The GOR regression limits are
  swapped (verified numerically), the Bayesian posterior mean is wrong, it cites a
  Scordilis (2006) ML relation that does not exist, and a Bondár formula contradicts its
  own text. [publication/merge_strategies.tex:677](publication/merge_strategies.tex#L677)
- **M51. The paper's provenance claims are false.** There is no per-event merge strategy
  or Q in exports, no filtered or version-specific exports, and no CSV "all fields"
  lineage. The interactive-map overlays the paper describes (ellipses, beach balls,
  colour by gap/source) are not mounted in any live page.
  [paper/srl_paper.tex:1093](paper/srl_paper.tex#L1093),
  [:634](paper/srl_paper.tex#L634)

---

## Low severity (condensed)

**Analytics/UI labels:**
- "Catalogue Completeness %" is really the fraction ≥ Mc; a perfect catalogue scores
  about 63% ([lib/seismological-analysis.ts:479](lib/seismological-analysis.ts#L479)).
- The timeline's last bin is partial but plotted as a full period, showing a false drop
  at the end ([lib/event-timeline.ts:25](lib/event-timeline.ts#L25)).
- Histogram tooltips label "< 2.0" as "Great class" and "40+ km" as "Shallow-focus"
  ([components/charts/DistributionCharts.tsx:52](components/charts/DistributionCharts.tsx#L52)).
- The region filter survives a catalogue switch
  ([app/analytics/page.tsx:269](app/analytics/page.tsx#L269)).
- Dashboard "Auto-refresh: 30s" is actually 6 h.
- Several popups and QC cards show origin times in unlabelled browser-local time, one with
  a UTC string labelled "local"
  ([components/catalogues/CatalogueStatsPopover.tsx:52](components/catalogues/CatalogueStatsPopover.tsx#L52),
  [components/merge/DuplicateGroupMap.tsx:177](components/merge/DuplicateGroupMap.tsx#L177)).

**Statistics engine:**
- The library and worker use different decluster thresholds (10 vs 3 events)
  ([lib/seismological-analysis.ts:1013](lib/seismological-analysis.ts#L1013)).
- The moment-eligibility comments contradict the code on untyped magnitudes.

**Maps:**
- A duplicate pair straddling 180° is drawn 360° apart at world zoom
  ([components/merge/DuplicateGroupMap.tsx:220](components/merge/DuplicateGroupMap.tsx#L220)).
- Magnitude legend swatches understate M6 and M7+.
- Depth-legend class names contradict the standard 70/300 km classes.
- The merge map colours unknown depth as shallow.

**Parsing:**
- Out-of-range depths are silently nulled on CSV but reject the event on QuakeML.
- The large-file QuakeML stream path lacks the bare-`&` escaping.
- A leading `#` comment line becomes the CSV header, so the app's own
  `metadata=comments` export will not re-import.

**Upload:**
- `chunkIndex` accepts non-integers.
- The one-hour upload TTL is never extended.
- Upload sessions record no owner. Exploiting this needs a leaked random ID, so it is
  hardening only.

**Provenance:** `created_by`/`modified_*` are client-writable on POST and PATCH and never
set by the server ([lib/db.ts:1248](lib/db.ts#L1248)).

**Export:**
- Arrival and MomentTensor publicIDs are omitted, and a unit test requires the invalid
  form ([lib/quakeml-exporter.ts:572](lib/quakeml-exporter.ts#L572)).
- CSV and JSON drop the error ellipse.
- The scalar fallback never sets `preferredOriginID`.

**Quality:**
- Cross-field rules treat blank cells (null) as 0.
- The FocalMechanismCard legend calls the P-axis quadrants "Tensional".
- The station-distribution "random" reference is off by about 2×, so random networks are
  labelled "clustered".
- The duplicate-timestamp check counts timestamps, not events.
- In the in-house "GeoNet QS", a missing distance outscores a reported one, and the docs
  present it as the published GeoNet method.
- Error ellipses get an invented N–S orientation when the azimuth is absent.

**GeoNet import:**
- The circuit breaker counts HTTP 400s as outages, and its half-open success counter
  carries over between trials.
- The import counts don't add up, and "updated" counts unchanged rewrites.
- Simultaneous imports overwrite each other's status and bounds.
- The temp-network script records the minimum magnitude as "completeness".
- A comment claims CSRF validation that doesn't exist.

**API:**
- Global search drops negative magnitude/depth tokens silently.
- The filtered-events endpoint passes NaN into queries and returns 200.
- Index scripts conflict with `init-database` (the documented follow-up exits 1).
- Catalogue delete races in-flight imports.

**Auth:**
- The server doesn't stop an admin demoting or deactivating themselves, or the last admin
  being removed.
- Accounts can be enumerated through register 409, "Account is disabled" and bcrypt-skip
  timing.
- Change-password logs the user out while promising /profile.
- The only end-to-end auth test suite is always skipped under jsdom; when run, 4 of 17
  fail.

**Docs:**
- The merging guide describes a "Magnitude Difference" control that doesn't exist and
  wrong defaults and weights.
- The paper still says Node ≥ 18, 1/σ weighting, moment "whatever its type", and uses
  the `.quakeml` extension.

---

## Gap-area findings

A second round reviewed five areas the first pass did not cover. It produced 37 findings,
each independently verified (one verifier failed to run, so G33 is plausible rather than
confirmed). Severities below are the verified ones; several duplicate first-pass findings
and are marked so.

**Maintenance and migration scripts**

| # | Sev | Finding |
|---|---|---|
| G1 | Med | `migrate-uncertainty-units` selects rows by size (> 100), so legacy metre values ≤ 100 m stay 1000× too large and re-runs divide again |
| G2 | Med | `fix-catalogue-event-counts` writes the capped read's length, which disables the export truncation check |
| G3 | Low | `fix-missing-geo-bounds` tests `!== null`, so it skips the catalogues it exists to repair |
| G4 | Med | Scripts that use the driver directly ignore the database named in `MONGODB_URI` |
| G5 | Low | Several scripts print the full connection string, including the password |
| G6 | Low | The `clean-*` scripts delete a SQLite file and call a deleted script |
| G7 | Low | `migrate-auth-schema` matches the admin email case-sensitively, so it can create a duplicate admin |

**Paper figure generator and test data**

| # | Sev | Finding |
|---|---|---|
| G8 | High | The Python Gardner-Knopoff port lacks the platform's head reservation, so the paper's declustering numbers are not the platform's |
| G9 | Med | The worked example's quality scores come from a gap-driven surrogate, not Eq. 1 (see M49) |
| G10 | Med | Supplement S1/S2 show an artifact of a since-fixed binning bug (see M48) |
| G11 | Low | The S3 caption contradicts its own screenshot |
| G12 | Low | The "48,600 above Mc" step is never computed from the retained set |
| G13 | Low | `generate_test_data.py` draws magnitudes from a Beta law, not Gutenberg-Richter |
| G14 | Low | `import_test_catalogues_api.sh` cannot import anything |

**Ingest-path parity**

| # | Sev | Finding |
|---|---|---|
| G15 | High | The Quality merge strategy's winner depends on which ingestion path brought the GeoNet data |
| G16 | Med | Averaging treats a missing σ as 1 km (duplicates M17) |
| G17 | Med | GeoNet event identity is stored differently on each path |
| G18 | Med | The platform's own JSON export cannot be re-imported (duplicates M27) |
| G19 | Med | Seven or more fractional-second digits are parsed in local time (duplicates M8) |
| G20 | Low | The GeoNet importer drops `preferredPlane` and ignores `preferredFocalMechanismID` |
| G21 | Low | 0–360° longitudes are rejected by the GeoJSON and QuakeML parsers but accepted from CSV |
| G22 | Low | Two valid QuakeML depth types can never be stored |

**Test oracles and developer docs**

| # | Sev | Finding |
|---|---|---|
| G23 | Med | Several date shapes are still parsed in local time, and the timezone suite runs in UTC, so it cannot detect this |
| G24 | Med | `scientific-conventions.rst` claims per-file units and magnitude priority that the upload path overrides |
| G25 | Med | An import test locks in erasing GeoNet's own event classifications |
| G26 | Low | Both integration suites (44 tests) are always skipped |
| G27 | Low | `data_validation_guide.rst` states wrong seismology and stale rules |
| G28 | Low | The GeoNet QS appendix presents the in-house heuristic as the published method |
| G29 | Low | A statistics test locks in an invented 0–0 km depth range |
| G30 | Low | Magnitude class labels are non-standard ('Major' for M ≥ 8; 'Minor' for M < 3) |

**Client state and settings**

| # | Sev | Finding |
|---|---|---|
| G31 | Med | Client-side catalogue caches are never invalidated |
| G32 | Low | A Settings mapping's priority is used as its match confidence |
| G33 | Med | The field-mapping config is stored unvalidated; one malformed rule breaks every upload |
| G34 | Low | The dashboard counts every catalogue as merged |
| G35 | Low | Settings' JSON/QuakeML/GeoJSON mapping tabs never apply, and "Strict Schema Validation" is read nowhere |
| G36 | Low | 16 settings controls are saved and read by nothing |
| G37 | Low | Catalogue time-period fields are captured in local wall-clock time |

---

## Checked and rejected

- **The GeoJSON parser ignores GeoNet lowercase aliases:** true at the parser level, but
  the schema mapper's auto-detection recovers these fields on the real upload path.
- **The quality scorer ignores a single lat/lon marginal:** requiring both marginals is
  defensible; the inconsistency with the uncertainty card is cosmetic.
- Two severity disputes were settled toward the lower rating (see the individual
  entries).

---

## Suggested fix order

_(Written before the repairs; kept for the record. See **Repairs** below for what was done.)_

1. **H1** (b-value): a small, contained change with the largest scientific impact. Then
   re-run the paper's worked example and regenerate supplement S1–S3 (**M48**).
2. **H2 + H3** (upload mapping): stop re-deriving values from raw cells. This also fixes
   M13's miscounts and makes "Do not map" work. Audit existing uploaded catalogues for
   metre depths and US/International date swaps.
3. **H7** (temp-network times): fix and re-import the seven catalogues if they were loaded
   from an NZ-time machine.
4. **H4–H6 + M15–M21** (merge and QuakeML export): one-to-one association, origin-coherent
   fields, and non-destructive merged origins in QuakeML.
5. **M39–M47** (auth and API): the session-route fix is one line; then the lockout DoS,
   saved-filter ownership, the search limit, and cache invalidation.
6. **Paper** (M49–M51 and the stale statements): align the text with the code, or
   implement the claimed features, before submission.

---

## Repairs — 25–29 September 2026

Every finding above has a code fix, including all 37 gap findings. Each fix has a regression test that
failed on the original code and exercises the real code path; only the database driver, `fetch` or the
browser worker are mocked. Where the paper, white papers or Sphinx docs described a feature the code
lacked, the feature was **implemented** (your decision). Text describing old or incorrect behaviour was
**revised**. An independent second review of the fixes then found further problems, most of them
introduced by the fixes; those are fixed too (see *Post-fix review*). Commit `59955b4` holds only the
first repair pass. The post-fix review repairs and the final paper and docs updates came after it.

### How the repairs were checked

- **Static checks:** `tsc --noEmit` 0 errors; `next lint` clean; ESLint on `__tests__` clean.
- **Tests:** 263 suites and 3,157 tests pass, none skipped (at `a879a00`: 119 suites, 1,627 tests, 44 of
  them skipped). An earlier full run of the same suite also passed in-band with `--detectOpenHandles`
  and under ten randomised test orders. The two integration suites that were always skipped under
  jsdom now run. Commit `59955b4` alone passes its own 252 suites, but the 11 suites added after it
  fail there (112 of their 131 tests).
- **Production build:** `next build` passes in an isolated copy with no `.env` files and no network.
  Pages render in the intended font now that the webpack cache override is gone.
- **Disposable MongoDB 7 (single-node replica set, localhost only):**
  - `init-database`, `create-indexes` and `ensure-indexes` in any order give identical index sets;
  - `test:database`, the quality backfill and the orphan sweep run clean;
  - `test:runtime` and `test:browser` pass (production CSP and every base-map layer), on both
    `next start` and the standalone Docker-style server.
- **End-to-end API checks (511 of 511 passed, re-run on 29 September against a fresh production build
  of the final code):**
  - CSV and QuakeML upload through the real upload flow;
  - quality-strategy and Custom Order merges;
  - every export format (the CSV `X-Export-Rows-SHA256` equals the body's hash; QuakeML validates
    against QuakeML-BED-1.2 with lxml and ObsPy 1.5 reads it without warnings);
  - the PATCH and DELETE lifecycle, saved-filter ownership, Origin checks and login throttling.
    Three throttling checks written for the earlier per-window account rule were updated to the final
    consecutive-failure rule. A separate run (6 of 6) confirmed that after 100 failures from 20
    addresses a new browser gets `AccountProtected`, the owner's known-device cookie still signs in,
    and that success lets new browsers in again.
- **Paper:**
  - The worked example now runs on the platform's own TypeScript engine.
  - Supplement S1–S3 and the two merge figures were recaptured from the repaired app through its real
    upload page; every value on screen matches the engine's expected values.
  - `srl_paper.pdf` (43 pp), `srl_supplement.pdf` (6 pp), `main.pdf` (50 pp) and
    `merge_strategies.pdf` (29 pp) were rebuilt with no errors or undefined references.
- **Docs:** the Sphinx build has 852 warnings (876 before), none new.

### High-severity findings

| # | Repair |
|---|---|
| H1 b-value bias | The Utsu half-bin correction now comes from the magnitudes' **reporting step**: 0 for full precision (GeoNet), δ/2 for data rounded to δ (0.001–0.5), and share-weighted for mixed grids. Magnitudes within 2⁻²⁰ of a grid count as on it. The library and the worker are in exact parity. For a planted b = 1: continuous magnitudes 0.897 → 1.002. |
| H2 mapping overwrote parsed values | Stored rows are the parser's events. Only explicit per-file changes apply, re-read from the raw cell with that file's date-order and unit decisions. "Do not map" removes the field. Columns the parser consumed are never auto-mapped. |
| H3 wrong auto-mapping | The parser's own header resolution comes first and is shared with the UI. After that, only whole-word matches are accepted, and magnitude-scale and date/time-part columns are never guessed. `type` maps to event_type. |
| H4 greedy association | One-to-one best match in increasing Δt/τ + d/δ, at most one report per catalogue per group, independent of input order. Close calls are flagged in the preview. |
| H5 origin metadata mixed | Origin and depth metadata come only from the report whose solution was published. Averaged rows carry no borrowed origin fields. |
| H6 QuakeML rewrote an agency's origin | Contributing origins are emitted untouched. The published hypocentre has its own origin (or reuses the contributor's own), and every `preferred*` reference resolves. |
| H7 temporary-network times | FDSN times are parsed as UTC. **Catalogues already imported from an NZ-time machine must be re-imported** (see *Data repair*). |

### Medium and low findings, by area

- **Statistics and analytics:**
  - Mc: the 50-event floor applies wherever Mc is estimated. The magnitude filter is an explicit
    cut-off, and neither magnitude bound truncates the G-R/Mc fit.
  - Pooled catalogues: physical totals are withheld.
  - Depths and scales: null and negative depths are kept. A mixed-scale warning, a type table and a type
    filter were added.
  - Declustering: Gardner-Knopoff is O(N log N) and robust to unparseable times.
  - Labels and bins: labels and tooltips corrected; partial time bins are scaled only against a known
    period.
- **Ingestion:**
  - Dates and times:
    - Day/month order is decided from the whole file.
    - Nothing is ever parsed in local time; AM/PM and asctime are accepted.
    - Two-digit years are read only when the order is unambiguous.
    - Date and time columns are combined, including when the time column is recognised only by its values.
  - Chunked uploads: the delimiter is mapped from its name and a BOM is stripped.
  - Multi-file uploads: files are joined through a per-file token manifest. The server checks every
    file's count and validates every row before writing anything.
  - Responses and reports: upload responses are genuinely bounded, and the server's own counts are
    shown.
- **Merge:**
  - Magnitude types: GeoNet's bare "M" is treated as the ML family.
  - Strategies:
    - "Most Recent Solution" uses the agency's determination time.
    - Quality-based compares only the metrics every report states.
    - Averaging uses 1/σ² only when every report states σ.
    - Magnitude preference switches at M6.2.
  - Selection: fixed depths are used last; agency identity is never taken from catalogue-name
    substrings; Custom Order is implemented; focal mechanisms are united across reports.
  - Inputs: merge inputs are read with a keyset cursor; duplicate source catalogues are rejected.
- **Export:**
  - BED types are mapped at export, and GeoNet event IDs survive into QuakeML.
  - Blob values are type-, enumeration-, length- and date-checked, and illegal XML characters are
    stripped.
  - IDs are distinct per object.
  - QuakeML is streamed.
  - Exports return 409 while a catalogue is changing.
  - The platform's own JSON and CSV exports can be re-imported.
- **Quality, uncertainty and focal mechanisms:**
  - Q is bounded to 0–100, stored on every insert, and backfillable.
  - Legends are generated from the colour functions.
  - The preferred focal mechanism is honoured, and faulting style comes from P/T/B plunges.
  - Null-safe cross-field rules; a corrected station-distribution reference.
- **GeoNet import:**
  - Dates are read as UTC, and imports can target an existing catalogue with real update semantics.
  - Agency-flagged records are excluded and counted, with the raw type kept.
  - The NZ region crosses 180°. Circuit-breaker and accounting fixes.
- **Security:**
  - Sessions and redirects: the session route returns `{}` when signed out; post-sign-in redirects are
    same-origin only.
  - Sign-in throttling:
    - per (account, client) and per client;
    - a consecutive-failure cap for browsers without a signed known-device cookie, so the owner is
      never locked out;
    - reset links that cannot be invalidated by an attacker.
  - Admin and access:
    - role approvals are compare-and-set, and the last admin is protected;
    - the CSP allows every base-map layer, and the Origin check compares full origins;
    - saved filters are owner-scoped, search limits are clamped, and fault lookups are capped per user.
  - Caches and audit: caches are invalidated through a shared generation, and privileged actions are
    audit-logged with the client IP.
- **Maintenance scripts:**
  - Every script resolves the database as the app does, masks credentials and asks for confirmation.
  - The unit migration works by provenance and is idempotent.
  - Counts and bounds come from full reads.
  - The reset script is guarded.
- **Client state and settings:**
  - Client caches really invalidate.
  - Dashboard counts no longer double-count merged catalogues.
  - Saved mapping rules are validated (no catastrophic regexes).
  - 16 inert settings controls were removed.

### Features implemented from the paper and docs

- **Analysis page:**
  - Mc: an adjustable MAXC correction (0–0.5); goodness-of-fit Mc (Wiemer & Wyss 2000, 95%/90%, with
    MAXC fallback).
  - Temporal tab: a seismicity-rate series above Mc; magnitude–time; cumulative moment and energy;
    UTC Auto/Day/Week/Month bins.
  - Filters: Q, azimuthal-gap and magnitude-type filters; agency-flagged records excluded by default.
- **Maps:** colour by depth, quality, azimuthal gap or source catalogue. On-demand overlays draw
  uncertainty ellipses (labelled "N% confidence" when stated) and beach balls.
- **Quality:** Q and grade stored on import; a minimum-Q filter and uncertainty filters; per-event grades
  and a catalogue-level distribution.
- **Provenance:**
  - Merged rows carry the strategy, parameters, source catalogue IDs, the selected report and Q at merge
    time.
  - Exports carry per-event lineage, the catalogue version and a SHA-256 checksum (past versions cannot
    be retrieved from the platform).
  - Filtered and declustered exports are available.
- **Catalogue versions:** MAJOR.MINOR.PATCH following the paper's policy. The depositor's own label is
  kept as `source_version`.
- **Merge:** Custom Order (a designated primary catalogue); Most Recent Solution.
- **GeoNet import:** import into an existing catalogue.

### Post-fix review

Six independent reviewers re-examined the fixed code and backed each claim with a probe. They found:

- **Upload:** two high-severity regressions introduced by the fixes. An untouched upload could re-type
  Mw values, and split date/time columns were truncated to midnight.
- **Security:** a high-severity open redirect introduced by the new post-sign-in redirect. The
  account-wide sign-in limit also still allowed owner lockout and a high guessing budget.
- **Science and parsers:** medium issues including the GFT empty-bin sum, a declustering regression on
  unparseable times, float-noise tolerance, a quadratic header regex, unbounded caches, and rejected
  AM/PM times.
- **Merge, database and exports:** a magnitude-preference switch at M5.5 that biased published
  magnitudes low by up to 0.28, no-op saves bumping versions, table/export filter mismatches, QuakeML
  ID collisions and blob-validation gaps.

All of these are fixed with the reviewers' probes turned into regression tests.

### Behaviour changes users and API clients will notice

| Area | Change |
|---|---|
| Sessions and sign-in | `/api/auth/session` returns `{}` when signed out. Sign-in errors are codes, including `AccountProtected`. A wrong current password returns 400. |
| Request checks | Writes to `/api` with a foreign `Origin` get 403. A stale role approval gets 409. Self-demotion gets 400. Removing the last admin gets 409. |
| Upload | `POST /api/catalogues` takes a `pendingUploads` manifest. Upload and finalize responses are bounded previews. |
| Export | Returns 409 while a catalogue is importing, being deleted or changing. |
| Merge | The strategy labels changed: "Most Recent Solution", "Quality-Based". |
| Parsing | Zone-less times are UTC. Unrecognised time formats, named local zones and ambiguous two-digit years are rejected. Out-of-range depths become unknown on every format. |
| Settings | The settings page lost its 16 inert controls. |

### Deployment and data repair

- **Replica set:** saved merges use a MongoDB transaction and need a replica set (Atlas, or a local
  single-node set; now documented in *Getting started*).
- **Before enabling the repaired app:**
  1. Run `npx tsx scripts/init-database.ts` (idempotent).
  2. Run `npx tsx scripts/backfill-quality-scores.ts --apply`.
  3. Run `npx tsx scripts/migrate-uncertainty-units.ts` as a dry run, then with `--write` if it reports
     legacy metre values.
- **Temporary-network catalogues** imported from a non-UTC machine are shifted by 12–13 h.
  - Check: GeoNet event 2879335 (Darfield, ZU) must read `2010-09-03T16:35:46Z`.
  - Repair: delete those seven catalogues, re-run `scripts/import-temp-networks.ts`, then the backfill,
    then any merges built from them.
- **Throttling behind a proxy:** set `TRUSTED_PROXY_HOPS`. `nginx/nginx.conf` overwrites
  `X-Forwarded-For` and forwards `Host`, `X-Forwarded-Proto` and `X-Forwarded-Port`, which the Origin
  check needs. `APP_BIND_ADDRESS=127.0.0.1` with the `with-nginx` compose profile keeps the app off the
  public interface. `nginx -t` was not run here.
- **Secret rotation:** rotating `NEXTAUTH_SECRET` forgets every known-device cookie.
- **Node:** use Node 22 or 24. Verification ran on Node 20, with engine warnings.

### Known limitations and open items

- **Paper:** the worked example's scientific conclusions changed with the move to the real engine (see
  the paper's §6). They need the authors' endorsement. The paper grew from 38 to 43 pages. The release
  tag v0.1.0 points at pre-repair code.
- **Magnitude averaging:** the Utsu correction for coarse steps (0.2–0.5) leaves b 2–10% low; Bender's
  (1983) exact estimator would remove this.
- **Merge:**
  - The global authority table still ranks GeoNet first outside NZ.
  - Stored origin/magnitude blobs on merged rows are supplementary copies from one report.
  - Very large saved merges run in one MongoDB transaction and are subject to its 60 s lifetime.
- **Unused code and files:** `SchemaMapper.tsx`, `FilterPanel.tsx`, `MapView.tsx`, `EnhancedMapView.tsx`,
  an orphaned docs page, and four unreferenced screenshots in `paper/figures`.
