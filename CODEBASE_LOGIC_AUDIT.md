# Codebase Logic Audit — Catalog of Catalogs (NZ Earthquake Catalogues)

**Date:** 2026-06-21
**Scope:** scientific & data-processing logic (`lib/`, `workers/`, `paper/figures`, `report/`) — UI primitives (`components/ui/*`) excluded.
**Method:** a multi-agent audit. 13 domain auditors read each domain's code in full and checked the math/methods against primary literature and format standards (QuakeML 1.2 BED, GeoJSON RFC 7946, FDSN, CSV RFC 4180) via web search. Every high/medium finding and every methodology/units/standards finding was then re-checked by an independent **adversarial verifier** that re-read the code and re-checked the cited source. A cross-cutting critic then looked for systemic themes. **96 agents total.**

**Result:** 161 raw findings → **81 verified** (11 high, 28 medium, 32 low, 10 info), **1 refuted**. The full structured machine output is preserved in the workflow task transcript.

> The framework choices are mostly sound — MLE (not least-squares) for the b-value, the Utsu binning correction, the Hanks–Kanamori moment constant in the paper, QuakeML BED element ordering/namespaces, and the GK *distance* window are all correct. The defects cluster in **units, the antimeridian, and a few mis-wired or mislabeled methods** — not in fundamentally wrong ideas. Most of the high-severity issues reduce to **four root causes** (below), so the remediation surface is smaller than the finding count suggests.

---

## Verdict by domain

| Domain | Assessment |
|---|---|
| Seismicity statistics (b-value, Mc, declustering, FMD) | **significant issues** |
| Geospatial / magnitude / distance math | **significant issues** |
| Station coverage, uncertainty ellipses, focal mechanisms | **significant issues** |
| QuakeML parsing & type model | **significant issues** |
| Quality scoring & data-quality assessment | **significant issues** |
| CSV/GeoJSON parsing & format detection | **significant issues** |
| QuakeML export & validation | minor issues |
| Field & cross-field validation ranges | minor issues |
| Catalogue merge & duplicate detection | minor issues |
| GeoNet/FDSN import & client | minor issues |
| Paper/report figures vs code | minor issues |
| Export utilities | minor issues |
| App/infra correctness | minor issues |

---

## Four systemic root causes

Most of the high findings are symptoms of these four. Fix the root and many symptoms disappear.

### A. No canonical antimeridian (180°) convention across the spatial stack — **high**
Naive `Math.min/max` longitude and `west ≤ lon ≤ east` comparisons recur everywhere and are all wrong for boxes/points crossing the dateline. **NZ's own territory crosses 180°** (Kermadec / Raoul ~183°E, stored as ~−178° because the validator rejects lon > 180), so this is first-class data corruption, not a corner case.
Affected: `lib/geo-bounds-utils.ts` (extraction 18-83, `boundsOverlap`/`pointInBounds` 88-114, `calculateBoundsArea` 138-152), `lib/earthquake-utils.ts` viewport/spatial-index (755-882), `lib/validation.ts` `validateGeographicBounds` (962-1010), `lib/merge.ts` quadtree split (634-657), `lib/geonet-client.ts` NZ bounds (399-417, caps at 179°), and the parsers/validators that reject 0–360 longitudes.
A catalogue with events at +178° and −178° currently yields a ~356°-wide globe-spanning box. Worse, the **read path** (`db.ts getCataloguesByRegion`) detects dateline boxes via `minLon > maxLon`, but the **write path** (`db.ts:867-868`) and `validateBounds` *reject* `minLon > maxLon` — internally contradictory.

### B. No single canonical unit at the import boundary (m vs km vs degrees) — **high**
- QuakeML depth is divided by 1000 (m→km) on import, but `depth_uncertainty` and `horizontal_uncertainty` are **not** (`lib/quakeml-to-db.ts:43,46-48`, `lib/merge.ts:283-286`) → stored 1000× too large relative to depth.
- The exporter then multiplies them by 1000 assuming km (`lib/quakeml-exporter.ts:1132-1134,1171-1176`) → a QuakeML **parse→export round-trip inflates uncertainties by 1000×**.
- Quality scoring treats a km horizontal uncertainty as if degrees (`lib/quality-scoring.ts:129-138`, `×444`) → the 40-point location penalty saturates above ~0.09 km, collapsing the highest-weighted (35%) quality dimension.
- `minimum_distance` is stored/validated in degrees (`validation.ts:62`) but scored as km (`lib/geonet-quality-score.ts:169-179`) → a 5° (~555 km, very poor) station distance scores "Excellent (≤30 km)".

### C. Completeness magnitude Mc is never estimated before the b-value — **high/medium**
The Aki–Utsu MLE requires the sample to be complete above Mc. The code defaults `Mc = minMagnitude ?? minMag` (`lib/seismological-analysis.ts:325`; worker equivalent), and the UI never supplies `minMagnitude`, so the mean is taken over the whole incomplete catalogue down to its smallest bin → b biased/unstable. A MAXC routine exists but is never fed in. MAXC itself differs between copies (lib `+0.2` vs worker `+0.05`), and the paper figure pipeline asserts `Mc=2.0` instead of estimating it (its own claimed method is MAXC).

### D. Several deliverables are mislabeled as standard-conformant — **medium**
- GeoNet Quality Score claims Warren-Smith et al. (2025) but uses RMS + uncertainties (not the paper's inputs), omits P/S-phase coverage and the fixed-depth criterion, and uses min-of-criteria instead of the paper's sum-of-six-binaries. The repo's own docs admit the paper was paywalled and the thresholds were guessed.
- The uncertainty "error ellipse" is not a covariance eigen-decomposition and "confidence" is fabricated from azimuthal gap (`lib/uncertainty-utils.ts:29-64`).
- Coverage-quality thresholds are not Bondár (2004) (`lib/station-coverage-utils.ts:132-147`).
- An ML→Mw coefficient is misattributed to Scordilis (2006) (`lib/merge.ts:1898-1920`).

**Structural risks:** the seismology logic is **duplicated** in `lib/` and `workers/` and is drifting; and **no round-trip / property test exists for any format** (QuakeML, GeoJSON, CSV all have parse↔export asymmetries one test suite would catch).

---

## The 11 confirmed high-severity findings

1. **Gardner–Knopoff declustering branches swapped** — `lib/seismological-analysis.ts:443-445`, `workers/seismological-worker.ts:191-193`. Code uses `M≥6.5 → 10^(0.5409M−0.547)`, `M<6.5 → 10^(0.032M+2.7389)`; canonical (van Stiphout 2012 Table 1 / OpenQuake `hmtk`) is the reverse. Physical check: a M4 currently gets a 736-day window (should be ~41 d); a M8 gets 6026 d (~16.5 yr, should be ~989 d). Over-clusters small events ~5–18×, corrupting mainshock lists, cluster/swarm counts, declustered rates. *(The paper's `.tex` has the correct coefficients — only the code is wrong.)*
2. **b-value computed with no real Mc** — `workers/seismological-worker.ts`, `lib/seismological-analysis.ts:325`. See root cause C. The headline b-value in the analytics tab is invalid for any real (incomplete) catalogue.
3. **Depth/horizontal uncertainties kept in metres while depth is km** — `lib/quakeml-to-db.ts:43,46-48`, `lib/merge.ts:283-286`. See root cause B.
4. **…which inflates uncertainties 1000× on QuakeML round-trip** — `lib/quakeml-exporter.ts:1132-1134,1171-1176`.
5. **Horizontal uncertainty (km) scored as if degrees** — `lib/quality-scoring.ts:129-138`. Saturates the 35%-weighted location dimension.
6. **`minimum_distance` (degrees) scored as km** — `lib/geonet-quality-score.ts:169-179`. Criterion is meaningless for real input.
7. **GeoNet QS does not implement the cited paper** — `lib/geonet-quality-score.ts`. Not reproducible against the cited DOI.
8. **Bounds extraction is not dateline-aware** — `lib/geo-bounds-utils.ts:18-83`. See root cause A.
9. **Uncertainty ellipse orientation inverted vs renderer** — `lib/uncertainty-utils.ts:43-47`. Rotation branch is 90° off; an event most uncertain N–S is drawn elongated E–W. (Visualization-only.)
10. **Beachball is a decorative heuristic, not a nodal-plane projection** — `lib/focal-mechanism-utils.ts:95-219`. Ignores dip entirely; never computes P/T/B axes; docstring falsely claims "equal-area projection". (Visualization-only.)
11. **No GeoNet pagination against the 10,000-event / HTTP 413 cap** — `lib/geonet-client.ts:155-287`. NZ produces >10k located events/yr, so broad imports fail hard or (with a future change) silently truncate.

---

## Fairness notes (what is correct, and what was refuted)

- **Refuted (1):** `getFaultType` left/right-lateral handedness is **not** swapped — cleared on verification against Aki & Richards. (The beachball-shading and `isPointCompressional`-gap issues in the same file are real; the handedness one is not.)
- Verified **correct**: MLE choice for b-value + binning correction; the paper's Hanks–Kanamori N·m constant; the GK *distance* window `10^(0.1238M+0.983)`; the paper's σ_b lower-bound caveat; QuakeML BED root namespaces, `q:quakeml` wrapper, and event child-element ordering; the paper's GK coefficients.

---

## Audit gaps (not covered — for a follow-up pass)

1. `db.ts getCataloguesByRegion` and its `crossesDateline` contract end-to-end (consumer of buggy bounds).
2. No format has a parse→export→parse round-trip test; one suite would catch several findings.
3. `lib/parsed-event-to-db.ts` and the full DB schema/index unit declarations (`mongodb.ts`).
4. Auth/authorization and general API-route input validation/error handling.
5. Bulk insert/update atomicity & partial-failure rollback in `geonet-import-service.ts`.
6. Which seismology copy (`lib/` vs `workers/`) the live UI actually uses.
7. Large-N performance/memory (~218k events), worker timeouts.
8. Independent verification of the report's real inventory counts against primary DOIs (only internal consistency checked).
9. Chunked-upload corruption surface (out-of-order/duplicate/missing chunks; no checksum).

---

## Remediation status

Fixes have been applied to the working tree in priority order.

| # | Item | Status |
|---|---|---|
| B | Unit conventions (uncertainties m→km, quality-scoring km/deg, GeoJSON depth round-trip) | **done** — import ÷1000 at both QuakeML→DB sites; `*444`→`*4`; minimum_distance °→km; GeoJSON depth producer-disambiguation; +7 round-trip/regression tests |
| A | Antimeridian handling across spatial stack | **done** — minimum-arc longitude in bounds extraction; dateline-aware overlap/point-in/area/center; write path accepts the crossing convention; region read filters longitude precisely in JS; `validateGeographicBounds` no longer rejects crossing; +10 tests |
| C | Mc → b-value wiring; MAXC reconcile; FMD top-bin off-by-one | **done** — MAXC Mc (+0.2) auto-estimated and mean taken over M≥Mc in both lib and worker; worker no longer averages the full array; reconciled +0.2/+0.05; index-based bins; ad-hoc residual<0.2 Mc removed; +5 tests |
| #1 | Gardner–Knopoff swapped branches | **done** — branches swapped to match van Stiphout 2012 / OpenQuake in both files; comments fixed; covered by tests |
| D | Standards relabeling | **done** — GeoNet QS de-attributed from the Warren-Smith DOI and labeled an in-house heuristic; ellipse/"confidence" and coverage thresholds documented as heuristics; ML→Mw de-attributed from Scordilis (2006) |
| #9 | Uncertainty ellipse orientation inverted | **done** — rotation corrected to match the renderer's E–W axis convention; +2 tests |
| #11 | GeoNet pagination | **done** — extracted dependency-free `fetchTimeWindowChunked`; importer bisects the time window on HTTP 413 / the 10k cap and dedupes boundary events by EventID; +5 tests |

**Summary of this remediation pass:** all 11 high-severity findings are fixed or (where a full correct implementation is a larger task) honestly relabeled, and the four systemic root causes are resolved, with **24 new regression tests** added (548 lib/seismology tests pass; `tsc --noEmit` clean).

### Not yet addressed (medium/low tail — recommended next pass)

These confirmed findings were **not** changed in this pass. They are lower-severity or need a product decision / larger rework:

- **Focal mechanism (high, partial):** beach-ball is now clearly labeled approximate, but a correct nodal-plane/P-T-axis implementation is still TODO. Moment-tensor NED→USE sign convention (`parsers.ts:1026-1037`) unchanged.
- **CSV safety/conformance (medium):** `delimiter-detector` is not RFC 4180 (quoting, embedded newlines); CSV export does not neutralize spreadsheet formula-injection (`export-utils.ts`, `chart-config.ts`).
- **Timezone handling (medium):** naive timestamps treated as local time in `earthquake-utils.normalizeTimestamp`, `quakeml-parser`, and merge time-association; future-time check uses the client clock.
- **QuakeML parser robustness (medium):** SAX entity re-injection unescaping; event `<type>` first-match scan; arrivals flattened across origins; self-closing-tag miscount in `quakeml-validator`.
- **Merge (medium):** no magnitude tolerance in the association gate; spatial-grid radius vs adaptive radius; merge vs duplicate-detection method divergence.
- **Quality scoring (medium/low):** missing-`minimum_distance` default (documented, needs product decision); azimuthal-gap uses only the primary gap; 0–100 weights/penalty curves not empirically grounded.
- **Geo viewport (low):** `earthquake-utils` viewport/spatial-index longitude comparisons (755-882) are still not dateline-aware (bounds extraction/storage/query now are).
- **App/infra (low):** rate-limiter reset timestamp; `defaultShouldRetry` hardcoded `attempt>=3`; "token bucket" mislabel; chunked-upload checksum; in-memory state under serverless multi-instance.
- **Paper figure (medium):** GR fit-line intercept (`generate_figures.py:313-316`, missing `+b·Mc`); `Mc=2.0` asserted rather than MAXC-estimated.

See the appendix for the full list with locations.

---

## Appendix — all 81 verified findings

(Severity is the verifier-corrected severity. `partial` = partially-confirmed.)

| Sev | Domain | Cat | Verdict | Finding | Location |
|---|---|---|---|---|---|
| high | geo-magnitude-distance | edge-case | confirmed | extractBoundsFromEvents/extractBoundsFromMergedEvents produce wrong globe-spanning bounds across the dateline | `lib/geo-bounds-utils.ts:18-83` |
| high | geonet-import | methodology | confirmed | No pagination/chunking against GeoNet's 10,000-event hard limit (HTTP 413) | `lib/geonet-client.ts:139-287, 155-287` |
| high | quakeml-export-validate | units | confirmed | depth_uncertainty and horizontal_uncertainty inflated 1000x on parse->export roundtrip | `lib/quakeml-exporter.ts:1132-1134, 1171-1176` |
| high | quakeml-parse | units | confirmed | depth_uncertainty and horizontal_uncertainty kept in metres while depth is converted to km | `lib/quakeml-to-db.ts, lib/merge.ts, lib/parsers.ts:quakeml-to-db.ts:43,46-48; merge.ts:283,284-286; parsers.ts:223` |
| high | quality-scoring | standard-conformance | confirmed | GeoNet QS does not replicate the cited paper's criteria/thresholds (guessed, not extracted) | `lib/geonet-quality-score.ts:geonet-quality-score.ts:1-10,43-179` |
| high | quality-scoring | units | confirmed | Horizontal uncertainty computed in km but scored as if in degrees (location score saturates) | `lib/integrated-quality-assessment.ts / lib/quality-scoring.ts:integrated-quality-assessment.ts:39,79-93; quality-scoring.ts:129-138` |
| high | quality-scoring | units | confirmed | minimum_distance scored in km but stored/validated in degrees | `lib/geonet-quality-score.ts / lib/integrated-quality-assessment.ts:geonet-quality-score.ts:18,169-179; integrated-quality-assessment.ts:59; validation.ts:62` |
| high | seismicity-stats | bug | confirmed | Gardner-Knopoff time-window magnitude branches are swapped | `lib/seismological-analysis.ts, workers/seismological-worker.ts` |
| high | seismicity-stats | methodology | confirmed | b-value uses mean magnitude over the entire incomplete catalogue (no true Mc applied) | `workers/seismological-worker.ts, lib/seismological-analysis.ts` |
| high | station-uncertainty-focal | bug | confirmed | Ellipse rotation/axis assignment is inverted relative to the renderer (major axis drawn in wrong direction) | `lib/uncertainty-utils.ts:43-47` |
| high | station-uncertainty-focal | methodology | confirmed | Beachball quadrant shading is a heuristic, not a true nodal-plane projection | `lib/focal-mechanism-utils.ts:95-219` |
| medium | app-infra-correctness | methodology | confirmed | In-memory cache, rate limiter and circuit breaker are per-instance and ineffective under serverless multi-instance | `lib/cache.ts:212-215` |
| medium | exporters | bug | confirmed | GeoJSON depth is exported as negative metres but re-imported as positive km (broken round-trip) | `lib/exporters.ts vs lib/geojson-parser.ts:exporters.ts:131-133; geojson-parser.ts:247,254` |
| medium | exporters | standard-conformance | confirmed | CSV export does not neutralize spreadsheet formula-injection characters | `lib/export-utils.ts (csvField) + app/api/catalogues/[id]/export/route.ts (generateCSV):export-utils.ts:55-62; route.ts:382-434` |
| medium | figures-paper | bug | confirmed | GR fit line on cumulative FMD uses wrong intercept (missing +b*Mc), line sits ~2 orders of magnitude below data | `paper/figures/generate_figures.py:313-316, 325-326` |
| medium | generic-parsing | standard-conformance | confirmed | Content is split on raw newlines, so quoted multi-line fields corrupt the row stream | `lib/delimiter-detector.ts:126, 20` |
| medium | generic-parsing | standard-conformance | confirmed | Moment-tensor NED→USE conversion documented against non-standard z=up; real NED (z=down) flips three signs | `lib/parsers.ts:1026-1037` |
| medium | generic-parsing | standard-conformance | confirmed | parseLine does not implement RFC 4180 quoting (escaped quotes, embedded delimiters, trimming) | `lib/delimiter-detector.ts:91-117` |
| medium | geo-magnitude-distance | methodology | confirmed | normalizeTimestamp coerces bare date/time strings to UTC, which may mislabel local-time catalogues | `lib/earthquake-utils.ts:198-483` |
| medium | geonet-import | edge-case | confirmed (partial) | NZ bounds and bounds-merge defaults drop seismicity east of 180 (Kermadec/offshore) | `lib/geonet-client.ts:399-417` |
| medium | merge-dedup | edge-case | confirmed (partial) | Spatial-grid neighbourhood radius can be smaller than the true adaptive search radius (missed matches) | `lib/merge.ts:563-594, 1158-1180, 895-922` |
| medium | merge-dedup | methodology | confirmed | Event association uses only space+time; no magnitude tolerance in the merge gate | `lib/merge.ts:1009-1047, 1189-1212` |
| medium | merge-dedup | standard-conformance | confirmed | ML->Mw conversion coefficient is misattributed to Scordilis (2006) and is questionable | `lib/merge.ts:1898-1920, 2045-2053` |
| medium | merge-dedup | units | confirmed (partial) | Time differences rely on Date parsing; naive timestamps are treated as local time | `lib/earthquake-utils.ts:157-161, 198-222` |
| medium | quakeml-export-validate | bug | confirmed | Well-formedness check miscounts self-closing tags, giving false 'mismatched tags' errors | `lib/quakeml-validator.ts:60-70` |
| medium | quakeml-parse | bug | confirmed | Event-level <type> extracted by first-match scan over whole event XML can pick up nested magnitude/amplitude type | `lib/quakeml-parser.ts:653-654 (also 656,672-679,319-323)` |
| medium | quakeml-parse | bug | confirmed | SAX streaming reconstruction re-injects decoded entities unescaped, truncating/dropping text fields | `lib/quakeml-parser.ts:865-869, 843-863, 871-873` |
| medium | quakeml-parse | methodology | confirmed | Arrivals flattened to event level, losing which origin each arrival belongs to | `lib/quakeml-parser.ts:713-719 (type model: types/quakeml.ts:231-232,479; consumed quakeml-to-db.ts:99)` |
| medium | quakeml-parse | units | confirmed | QuakeML time strings stored verbatim without ensuring UTC, risking local-time misinterpretation | `lib/quakeml-parser.ts, lib/parsers.ts:quakeml-parser.ts:103-122; parsers.ts:220 (consumed merge.ts:1140,1426 via new Date(e.time))` |
| medium | quality-scoring | methodology | confirmed | Azimuthal-gap scoring uses only primary gap; ignores secondary gap and station-count interaction | `lib/geonet-quality-score.ts:geonet-quality-score.ts:89-99` |
| medium | quality-scoring | methodology | confirmed | Missing minimum_distance defaults to score 3 while all other missing criteria default to 0 | `lib/geonet-quality-score.ts:geonet-quality-score.ts:90,106,122,138,154,170` |
| medium | quality-scoring | units | confirmed | QuakeML depth uncertainty (metres) scored/validated as km | `lib/geonet-quality-score.ts / lib/quality-scoring.ts:geonet-quality-score.ts:153-163; quality-scoring.ts:140-146; (source: quakeml-to-db.ts:43)` |
| medium | seismicity-stats | methodology | confirmed | MAXC Mc differs between implementations: lib adds +0.2 correction, worker adds +0.05 bin-center | `lib/seismological-analysis.ts, workers/seismological-worker.ts` |
| medium | seismicity-stats | methodology | confirmed | calculateGutenbergRichter.completeness uses an ad-hoc residual<0.2 rule, not a recognized Mc method | `lib/seismological-analysis.ts` |
| medium | station-uncertainty-focal | edge-case | confirmed (partial) | isPointCompressional rake categories overlap/leave gaps and mis-handle oblique mechanisms | `lib/focal-mechanism-utils.ts:185-219` |
| medium | station-uncertainty-focal | methodology | confirmed | 'confidence' is a fabricated function of azimuthal gap, not a statistical confidence level | `lib/uncertainty-utils.ts:49-55` |
| medium | station-uncertainty-focal | methodology | confirmed | Uncertainty 'error ellipse' is not derived from a covariance matrix / eigen-decomposition | `lib/uncertainty-utils.ts:29-64` |
| medium | validation | edge-case | confirmed | Future-time rejection uses client clock / local Date, risking spurious rejection of near-real-time events | `lib/validation.ts:15-23 (schema refine) and lib/cross-field-validation.ts:237-253` |
| medium | validation | units | confirmed | latitude/longitude uncertainty bounds (max 10) mix degrees and km semantics | `lib/validation.ts:35-36; cross-ref lib/validation.ts:915-918 (treats >0.1 as >~10 km)` |
| low | app-infra-correctness | bug | confirmed | Rate limiter reports a moving/incorrect reset timestamp (not the window end) | `lib/rate-limiter.ts:112, 244, 249` |
| low | app-infra-correctness | bug | confirmed | defaultShouldRetry hardcodes attempt>=3, ignoring configured maxAttempts | `lib/retry-utils.ts:66-69, 175, 195` |
| low | app-infra-correctness | data-quality | confirmed | Chunked-upload reassembly has no content-integrity (checksum/hash) verification | `lib/upload-chunks.ts:159-237` |
| low | app-infra-correctness | methodology | confirmed | Documented as 'token bucket' but implemented as a fixed window counter | `lib/rate-limiter.ts:1-12, 80-114` |
| low | exporters | standard-conformance | confirmed | Duplicate ad-hoc CSV escaper in chart-config.ts is not RFC 4180 complete | `lib/chart-config.ts (exportDataAsCSV):chart-config.ts:444-464` |
| low | figures-paper | methodology | confirmed | Mc=2.0 is asserted in the figure pipeline rather than estimated by MAXC, despite MAXC being the paper's claimed method | `paper/figures/generate_figures.py:70, 281-282` |
| low | figures-paper | methodology | confirmed | Recovered b-value is calibrated-then-recovered (circular by construction) but explicitly disclosed as a self-check | `paper/figures/generate_figures.py:93-106, 286-304` |
| low | generic-parsing | edge-case | confirmed (partial) | No 0-360 longitude normalization in parse path rejects valid NZ offshore events near 180 deg | `lib/parsers.ts:412, 1171-1188 (depth path); longitude untouched` |
| low | generic-parsing | methodology | confirmed (partial) | Mw-beats-ML magnitude selection can silently override the mapped magnitude column | `lib/parsers.ts:1274-1289` |
| low | generic-parsing | units | confirmed (partial) | Depth meters-vs-km auto-conversion uses a magnitude heuristic that can misclassify deep events | `lib/parsers.ts:1171-1188` |
| low | geo-magnitude-distance | edge-case | confirmed (partial) | Viewport filtering and spatial index use raw longitude comparisons (no dateline wrap) | `lib/earthquake-utils.ts:755-882` |
| low | geo-magnitude-distance | edge-case | confirmed (partial) | boundsOverlap and pointInBounds assume minLon<=maxLon and fail for dateline-crossing boxes | `lib/geo-bounds-utils.ts:88-114` |
| low | geonet-import | bug | confirmed | 204/404 'no data' handling after retryFetch is partly unreachable | `lib/geonet-client.ts:162-179, 300-317` |
| low | geonet-import | methodology | confirmed | Focal-mechanism extraction round-trips parsed XML back to a string before regex parsing | `lib/geonet-import-service.ts:92-150, 496-502, 665-675` |
| low | merge-dedup | methodology | confirmed | Magnitude-dependent distance multipliers differ between the two modules and from cited basis | `lib/duplicate-detection.ts:102-111` |
| low | merge-dedup | methodology | confirmed (partial) | Merge and duplicate-detection modules answer the same question with different methods and thresholds | `lib/duplicate-detection.ts:58-111, 125-202, 217-292` |
| low | quakeml-export-validate | edge-case | confirmed (partial) | Scalar fallbacks emit magnitude/lat/lon/time values without null/NaN guards | `lib/quakeml-exporter.ts:1027, 1109-1127` |
| low | quakeml-export-validate | standard-conformance | confirmed | Validator treats magnitude/depth/quality as required/recommended more strictly than BED requires | `lib/quakeml-validator.ts:142-148, 276-299` |
| low | quakeml-export-validate | standard-conformance | confirmed | publicID validation only checks for a colon, not the smi:/quakeml: resource-identifier grammar | `lib/quakeml-validator.ts:96-104` |
| low | quality-scoring | methodology | confirmed (partial) | 0-100 dimension weights and per-metric penalty curves are arbitrary / not empirically grounded | `lib/quality-scoring.ts:quality-scoring.ts:48-67,124-299` |
| low | seismicity-stats | bug | confirmed | Weekly time-series bins use a non-ISO week number and sort lexically | `lib/seismological-analysis.ts, workers/seismological-worker.ts` |
| low | seismicity-stats | edge-case | confirmed (partial) | GR/completeness binning loop omits the maximum-magnitude bin (off-by-one) | `lib/seismological-analysis.ts, workers/seismological-worker.ts` |
| low | seismicity-stats | methodology | confirmed | Data-completeness 'overall' score uses arbitrary fixed category weights and averages percentages | `lib/completeness-metrics.ts` |
| low | seismicity-stats | methodology | confirmed | a-value is not normalized per year (it is a raw-count a-value) | `lib/seismological-analysis.ts, workers/seismological-worker.ts` |
| low | seismicity-stats | methodology | confirmed | b-value uncertainty uses Aki sigma_b = b/sqrt(N); Shi & Bolt (1982) is preferable | `lib/seismological-analysis.ts, workers/seismological-worker.ts` |
| low | seismicity-stats | units | confirmed (partial) | Date handling mixes UTC (toISOString) and local-time (getFullYear/getDay) methods | `lib/seismological-analysis.ts, workers/seismological-worker.ts, lib/anomaly-detection.ts` |
| low | station-uncertainty-focal | methodology | confirmed | Coverage-quality thresholds (90/180/270 deg) are ad-hoc, not Bondar (2004) criteria | `lib/station-coverage-utils.ts:132-147` |
| low | station-uncertainty-focal | methodology | confirmed (partial) | calculateLocationQuality penalty coefficients are arbitrary and unit-fragile | `lib/uncertainty-utils.ts:99-166` |
| low | validation | edge-case | confirmed (partial) | Geographic-bounds validation/overlap does not handle the antimeridian (180°), affecting NZ offshore catalogues | `lib/validation.ts:962-1010 (validateGeographicBounds); see also lib/geo-bounds-utils.ts:88-98 boundsOverlap, 102-114 pointInBounds` |
| low | validation | methodology | confirmed | Magnitude-uncertainty-exceeds-magnitude check is geophysically meaningless (magnitude is a logarithmic scale) | `lib/cross-field-validation.ts:103-111` |
| low | validation | methodology | confirmed | Two shallow-large-magnitude heuristics use inconsistent thresholds (M>7 vs M>8) | `lib/validation.ts:898-910 (depth<5 & mag>7); cross-field-validation.ts:25-34 (depth<5 & mag>8)` |
| low | validation | methodology | confirmed | phase>=1.2×station 'low phase count' heuristic is weak and assumes P+S availability | `lib/cross-field-validation.ts:142-163` |
| info | app-infra-correctness | standard-conformance | confirmed | reIndex/compact admin commands have version/topology limitations | `lib/query-optimizer.ts:135-152` |
| info | figures-paper | methodology | confirmed | sigma_b = b/sqrt(N) used but correctly flagged as a lower bound vs Shi & Bolt (1982) | `paper/srl_paper.tex:859-871` |
| info | figures-paper | standard-conformance | confirmed | Gardner-Knopoff declustering window coefficients match the canonical van Stiphout (2012) tabulation | `paper/srl_paper.tex:917-923` |
| info | figures-paper | units | confirmed | Hanks-Kanamori moment relation uses the correct N·m constant (-6.07 / +9.1), not the dyne-cm value | `paper/srl_paper.tex:943-949` |
| info | geo-magnitude-distance | units | confirmed (partial) | calculateBoundsArea returns square degrees, not km^2 (documented), and is wrong across the dateline | `lib/geo-bounds-utils.ts:138-152` |
| info | geonet-import | methodology | confirmed | No magnitude-type homogenisation; mixed ML/Mw/mB stored and filtered together | `lib/geonet-import-service.ts:324-336, 488, 642-649` |
| info | merge-dedup | numerical | confirmed | Spatial-spread QC uses a flat-Earth km approximation (acceptable for small clusters) | `lib/merge.ts:1361-1395` |
| info | quakeml-export-validate | standard-conformance | confirmed | Event child-element ordering matches the BED XSD sequence | `lib/quakeml-exporter.ts:948-1244` |
| info | quakeml-export-validate | standard-conformance | confirmed | Origin emits originUncertainty/quality after time-lat-lon-depth; harmless because BED order is unenforced | `lib/quakeml-exporter.ts:206-356, 1106-1204` |
| info | quakeml-export-validate | standard-conformance | confirmed | Root namespaces and q:quakeml wrapper are the canonical QuakeML 1.2 BED pairing | `lib/quakeml-exporter.ts:1261-1263, 1338-1339` |
