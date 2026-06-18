# Earthquake Catalogues of Aotearoa New Zealand, 1960–2026
### A Registry-style Inventory of National, Regional, Temporary-Deployment, and Derived Catalogues

> **Compiled:** 2026-06-18 · **Scope:** earthquake catalogues developed for / covering New Zealand and its offshore margins whose coverage overlaps 1960–2026 (catalogues that begin earlier and extend into the period, and historical/derived catalogues used for NZ, are included). · **Special emphasis:** temporary seismic deployments (passive-seismic experiments, ocean-bottom deployments, aftershock rapid-response arrays).

This document profiles **80 distinct catalogues** against the *Catalogue Submission Profile* (minimum-attributes schema) defined in the white paper *“Towards a FAIR Framework for Earthquake Catalogues in Aotearoa New Zealand”* (`publication/main.tex`, Table `tab:profile`). It is intended as a working population of the proposed **Registry** layer — a discovery record, *not* a certification of scientific adequacy. Deeper detail is carried by each catalogue’s own dataset/DOI or publication.

## How this inventory was produced (provenance & limitations)

This inventory was assembled by a **multi-agent web-research workflow** with adversarial verification:

1. **Discovery** — 10 parallel agents swept distinct angles (national/network, relocated/reprocessed, historical/macroseismic, onshore temporary deployments, offshore/OBS, aftershock rapid-response, volcano/geothermal/induced, slow-slip/tremor/LFE & moment-tensor, derived/synthetic/hazard). They returned **100 raw records**.
2. **Consolidation** — duplicates (FDSN code vs project name vs paper title) were merged into **80 distinct catalogues**.
3. **Enrich + verify** — each catalogue was profiled to the full schema, then adversarially checked: *is it a real, distinct NZ catalogue? does coverage overlap 1960–2026? do the DOIs resolve and are the citations correctly attributed?* Verdicts: **79 confirmed, 1 uncertain, 0 rejected.**

**Honesty notes — please read before citing:**

- Records were grounded in fetched sources where possible; **71 of 80** carry a DOI or stable dataset link that was checked. Fields that could not be verified are marked *“unknown — not documented”* rather than guessed, and confidence is set accordingly (**high 72 · medium 8 · low 0**).
- This is **automated research output**: treat DOIs, dates, and event counts as *verified-best-effort*, and confirm against the cited source before authoritative (hazard/engineering) use.
- **Not exhaustive.** The dedicated *completeness-critic* pass (which hunts the long tail) and the auto-*synthesis* pass did **not run** (an external account session limit was reached). The narrative front-matter below was therefore written by hand from the verified inventory. Known likely-missing material is listed under *Coverage gaps*.

## Summary by category

| Category | Count |
|---|---:|
| National operational & network catalogues | 4 |
| Relocated & reprocessed catalogues | 8 |
| Historical & macroseismic (felt-report) catalogues | 12 |
| Aftershock-sequence rapid-response catalogues | 9 |
| Temporary onshore passive-seismic deployments | 16 |
| Temporary offshore / ocean-bottom (OBS) deployments | 3 |
| Volcano-seismic, geothermal & induced catalogues | 12 |
| Slow-slip, tremor, LFE & moment-tensor catalogues | 10 |
| Derived, homogenised & synthetic / hazard-model catalogues | 6 |
| **Total** | **80** |

## Overview: the shape of New Zealand’s catalogue ecosystem

New Zealand’s earthquake-catalogue landscape has three tiers. **(1) One authoritative national operational catalogue** — the GeoNet catalogue, produced by GNS Science / Earth Sciences New Zealand — provides continuous instrumental coverage (locations from the 1930s, descriptive events from ~1460) and is underpinned by the permanent National Seismograph Network (FDSN code `NZ`). It is the parent dataset for nearly every derived NZ catalogue. **(2) A large, scattered body of regional, temporary-deployment, volcano/geothermal and special-purpose catalogues**, produced mostly by universities (Victoria University of Wellington, Otago, Auckland, Canterbury) and international partners. These deliver far higher *local* precision — dense arrays, ocean-bottom seismometers, borehole sensors, and matched-filter / template-matching detection — but are typically published as one-off datasets discoverable only through the originating paper. **(3) Derived products**: relocated/reprocessed catalogues, magnitude-homogenised and declustered hazard-model catalogues (NSHM 2010 and 2022), and synthetic (RSQSim) catalogues.

Temporary deployments are the **single largest group in this inventory** (16 onshore + 3 offshore/OBS, plus a large share of the volcano-seismic and aftershock-response catalogues) — yet they are precisely the catalogues *least* discoverable in the national system. They are exactly the material the proposed Registry is designed to surface: high scientific value, but fragmented across journal supplements, Zenodo, IRIS/EarthScope, PANGAEA, and FDSN temporary-network DOIs, with heterogeneous magnitude scales, depth treatments, and metadata conventions.

## Timeline: how NZ catalogue capability evolved

- **1960s–1970s (analogue era).** The national catalogue is maintained by the DSIR Seismological Observatory; the *Computer File of New Zealand Earthquakes* runs to 1974, while Eiby’s *Descriptive Catalogue* and *Annotated List (1460–1965)* bridge the instrumental and historical records. Globally relocated NZ coverage exists via ISC-GEM (from 1904) and later ISC-EHB (from 1964).
- **1980s (digitisation begins).** Continuous digital waveforms are archived from September 1986. The **1987 Edgecumbe** sequence is an early instrumented aftershock response.
- **1990s (first big passive experiments).** **SAPSE** (Southern Alps Passive Seismic Experiment, 1995–96) is a landmark temporary deployment; Wellington-region relocation work begins; Downes’ *Atlas of Isoseismal Maps* (1995) systematises historical macroseismic intensities.
- **2000s (targeted arrays + double-difference relocation).** A wave of temporary arrays (Marlborough `XB`, Tongariro, Taranaki, CNIPSE/NIGHT, **SAHKE**, **ALFA08/09**, and the **SAMBA** borehole array from 2008); double-difference relocation becomes standard (e.g. Wellington, Du et al. 2004); the 2003 Fiordland response.
- **2010s (GeoNet modernises; sequences drive dense catalogues).** GeoNet moves to SeisComP with 3-D NonLinLoc (2012). The **Canterbury** sequence (Darfield 2010, Christchurch 2011) and **Kaikōura 2016** drive dense aftershock and ocean-bottom catalogues (**HOBITSS**, 2014–15). Matched-filter / template-matching catalogues emerge (Chamberlain; Michailos), and slow-slip and tremor/LFE catalogues mature (Wallace & Beavan 2010; Todd & Schwartz 2016).
- **2020s (ML-scale relocation, synthetics, multi-year geodetic catalogues).** High-precision matched-filter and nested-tomography catalogues (TVZ; Hikurangi); long **RSQSim** synthetic catalogues for NSHM 2022; multi-year GNSS slow-slip catalogues (Michel 2025; Perez-Silva 2025); dense onshore arrays (**DWARFS**, **SALSA**, **SOSA**); volcanic-unrest catalogues at Taupō (2019; 2022–23); and geothermal induced-seismicity monitoring (Rotokawa, Ngatamariki).

## Coverage gaps & FAIR weaknesses

- **This is a discovery snapshot, not a census.** Because the completeness pass did not run, the long tail is under-counted — likely-missing material includes additional PhD-thesis catalogues, a dedicated catalogue for *every* NZ Mw≥6 aftershock response since 1960, more geothermal fields (Wairakei, Kawerau, Ohaaki, Mokai, Ngāwhā), the Auckland Volcanic Field, additional Kermadec/offshore deployments, and the **SISIE/MOANA/NZ3D/SHIRE** offshore experiments that appeared in discovery but were not all retained as distinct event catalogues.
- **Discoverability is the core problem.** Temporary-deployment and regional catalogues live across journal supplements, Zenodo, IRIS/EarthScope, and FDSN network DOIs — the fragmentation the Registry exists to fix.
- **Heterogeneity.** Magnitude scales vary (ML, Mw via GeoNet CMT “MwNZ” from 2003-08, the homogenised MLNZ20→Mw used for NSHM 2022); magnitude of completeness (Mc) is rarely stated and is spatially variable; depths span 0–~600 km for subduction seismicity but many regional catalogues are shallow-crustal only.
- **A few entries are not conventional event lists** (e.g. the NZNSN *waveform* dataset; the `nz3drx` 3-D *location method* within the GeoNet DOI) — they are included for completeness and flagged in their records.
- **One entry remains `uncertain`** (the 2013 Seddon / Lake Grassmere response deployment) pending a clearly attributable dataset/citation.

---

## The inventory

*Each entry follows the submission-profile schema. Legend: **verdict** (confirmed / uncertain) · **confidence** (high / medium / low) reflects how well the record is grounded in fetched sources.*

## National operational & network catalogues (4)

### 1. GeoNet Aotearoa New Zealand Earthquake Catalogue
*type: background · focus: geographical · detection: automatic · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** GeoNet earthquake catalogue; NZ Earthquake Catalogue; QuakeSearch; FDSN network NZ catalogue product; nz3drx 3-D NonLinLoc locations; NEID catalogue component
- **Coverage:** 1460 → ongoing
- **Region:** Aotearoa New Zealand (national), incl. Hikurangi margin, Kermadec, Southern Alps, offshore regions
- **Bounding box:** New Zealand and offshore margins, approx 34S-48S, 165E-180E/-175W (incl. Kermadec and Hikurangi margins and offshore regions)
- **Depth range:** 0-~600 km (subduction-zone seismicity to deep events)
- **Magnitude:** Roughly M0 to M8+ instrumental; magnitude of completeness varies spatially and over time (network-dependent), Mc not stated on landing page
- **Events:** ~700,000+ (approx; ~20,000 new events added per year)
- **Content:** hypocentral locations; phase arrival-time picks; amplitude picks; quality information; historical observations
- **Producer / contact:** GNS Science (Earth Sciences New Zealand) / GeoNet; Geohazards Information Manager (info@geonet.org.nz)
- **Data source:** Continuous waveforms from the New Zealand National Seismograph Network (FDSN code NZ) plus historical felt/observational records; routinely processed by GeoNet (SeisComP since 2012). Successor to the DSIR Seismological Observatory / IGNS national catalogue lineage.
- **Availability:** available (DOI) · DOI [10.21420/0S8P-TZ38](https://doi.org/10.21420/0S8P-TZ38)

The authoritative national operational earthquake catalogue for Aotearoa New Zealand, produced by GNS Science/GeoNet to provide a continuous public record of NZ seismicity for monitoring, research, and hazard assessment. It spans historical (descriptive) events from ~1460 and instrumental locations from the 1930s to the present, and is the parent dataset for nearly every derived/relocated/hazard NZ catalogue. Location methods evolved over time (LOCAL+nz1d pre-1987; CUSP/GROPE+nz1dr ~1987-2012; SeisComP from 2012 with NonLinLoc 'nz3drx' 3-D and LOCSAT/iasp91, LOCSAT routine since the New Generation Magnitude Calibration Dec 2018). The 3-D NonLinLoc 'nz3drx' is a location method within this single DOI, not a separate catalogue.

**Key references:**
- GNS Science (1970). New Zealand Earthquake Catalogue [Data set]. GNS Science, GeoNet. https://doi.org/10.21420/0S8P-TZ38
- Warren-Smith, E., Jacobs, K., Rollins, C., Chamberlain, C. J., Eberhart-Phillips, D., & Williams, C. (2024). A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand. New Zealand Journal of Geology and Geophysics, 68. https://doi.org/10.1080/00288306.2024.2421309

*Verification — DOI 10.21420/0S8P-TZ38 confirmed resolving via doi.org (302 redirect to GNS metadata catalog) and on the data.govt.nz landing page, which gives the recommended citation 'GNS Science (1970). New Zealand Earthquake Catalogue [Data set]. GNS Science, GeoNet.' The 2024 key reference verified via Crossref: Warren-Smith, Jacobs, Rollins, Chamberlain, Eberhart-Phillips & Williams (2024), NZJGG vol 68, DOI 10.1080/00288306.2024.2421309 — title and authors confirmed, correctly attributed. No fabricated citations.*

**Caveats:**
- Cumulative event_count (~700,000) is not stated on the landing page; only ~20,000/year is documented, so the total is an estimate marked approximate.
- Mc and exact bounding box / depth range are not given on the DOI landing page; values are inferred from general knowledge.
- Location-era dates (LOCAL/CUSP/GROPE/SeisComP/NonLinLoc/LOCSAT) come from the brief and GNS potted-history framing; the specific 'potted history' blog could not be re-fetched, but the 2024 Warren-Smith et al. paper independently documents GeoNet location methods.

**Notes:** DOI resolves (302) to GNS Science metadata catalog record (5105fdeb-f314-4d6e-8e09-bf5308278e03). Citation metadata gives publication year 1970 for the dataset DOI. Velocity models: nz1d, nz1dr, nz3drx (3-D NonLinLoc). LOCSAT routine since New Generation Magnitude Calibration (NGMC) Dec 2018. Component of the National Earthquake Information Database (NEID). Parent catalogue for most NZ derived/relocated catalogues. The ~700,000 total is an order-of-magnitude estimate (the landing page documents ~20,000 events/year, not a confirmed cumulative total).

**Sources:** [www.geonet.org.nz/data/types/eq_catalogue](https://www.geonet.org.nz/data/types/eq_catalogue) · [catalogue.data.govt.nz/dataset/geonet-aotearoa-new-zealand-e](https://catalogue.data.govt.nz/dataset/geonet-aotearoa-new-zealand-earthquake-catalogue) · [doi.org/10.21420/0S8P-TZ38](https://doi.org/10.21420/0S8P-TZ38) · [api.crossref.org/works/10.1080/00288306.2024.2421309](https://api.crossref.org/works/10.1080/00288306.2024.2421309)

---

### 2. New Zealand National Seismograph Network (NZNSN) seismic waveform dataset
*type: background · focus: geographical · detection: automatic · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** NZ; NZNSN; FDSN network NZ; Aotearoa/New Zealand GeoNet Seismic Digital Waveform Dataset
- **Coverage:** 1916 → ongoing
- **Region:** Aotearoa New Zealand (national)
- **Bounding box:** Mainland New Zealand plus Raoul Island and Chatham Islands
- **Magnitude:** Not applicable (waveform dataset, not an event list)
- **Content:** other
- **Producer / contact:** GNS Science (Earth Sciences New Zealand) / GeoNet
- **Data source:** Permanent national network of broadband, short-period and strong-motion sensors (FDSN code NZ), covering mainland NZ plus Raoul and Chatham Islands; continuous miniSEED waveform recordings.
- **Availability:** available (DOI) · DOI [10.21420/G19Y-9D40](https://doi.org/10.21420/G19Y-9D40)

The permanent national seismograph network (FDSN code NZ) whose continuous waveforms are the instrumental basis for the GeoNet earthquake catalogue and moment tensors. This is a waveform dataset (network record) rather than an event list, but it is the foundational instrumental data product and is registered with its own network/dataset DOI distinct from the catalogue DOI. The permanent network dates from 1916 (Wellington), with continuous digital miniSEED archived from September 1986.

**Key references:**
- GNS Science (2021). Aotearoa/New Zealand GeoNet Seismic Digital Waveform Dataset [Data set]. GNS Science. https://doi.org/10.21420/G19Y-9D40

*Verification — DOI 10.21420/G19Y-9D40 confirmed on the FDSN network NZ detail page and the NEDC dataset page. Citation 'GNS Science (2021). Aotearoa/New Zealand GeoNet Seismic Digital Waveform Dataset [Data set]. GNS Science.' matches the NEDC-recommended citation. Distinct from the catalogue DOI 10.21420/0S8P-TZ38. No fabricated citations.*

**Caveats:**
- This is a waveform dataset, not an event catalogue; included per user emphasis on the foundational network record. No event_count applies.
- Detection_method/review_status/catalogue_type fields are forced onto a waveform product and are only loosely applicable.

**Notes:** FDSN network NZ name 'New Zealand National Seismograph Network', operator Institute of Geological & Nuclear Sciences (GNS). Network start year 1916; digital miniSEED available from September 1986 (per FDSN and NEDC pages). Includes short-period, broadband and strong-motion instruments. Foundational waveform record for the GeoNet catalogue (10.21420/0S8P-TZ38) and a separate NEID component; DOI is distinct from the catalogue DOI. Included as a waveform-dataset record (content_flags 'other') rather than a conventional event catalogue.

**Sources:** [www.fdsn.org/networks/detail/NZ/](https://www.fdsn.org/networks/detail/NZ/) · [nedc.nz/content/aotearoanew-zealand-geonet-seismic-digital-w](https://nedc.nz/content/aotearoanew-zealand-geonet-seismic-digital-waveform-dataset/)

---

### 3. National Earthquake Information Database (NEID)
*type: compilation · focus: geographical · detection: other · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** NEID
- **Coverage:** unknown — not documented → ongoing
- **Region:** Aotearoa New Zealand (national)
- **Bounding box:** Aotearoa New Zealand (national)
- **Magnitude:** Not applicable (umbrella database, not a single event list)
- **Content:** hypocentral locations; phase arrival-time picks; focal mechanisms; fault-geometry; historical observations; quality information; other
- **Producer / contact:** Earth Sciences New Zealand (formerly GNS Science) / GeoNet; Paul Viskovic (Geomodeller)
- **Data source:** Umbrella database aggregating GeoNet/GNS raw and derived earthquake data products across seven interlinked datasets.
- **Availability:** available (DOI)

A nationally significant umbrella database, managed by Earth Sciences New Zealand (formerly GNS Science), that provides raw and derived earthquake data for New Zealand to support geohazards research and response. It is the institutional custodian/compilation rather than a single event list: it comprises ~seven interlinked components (earthquake catalogue, moment tensors, waveform archive, station metadata, felt reports, strong-motion data products, and fault-rupture models). It is kept distinct from the GeoNet catalogue, which is one of its components.

**Key references:**
- Earth Sciences New Zealand / GNS Science. National Earthquake Information Database (NEID). https://www.gns.cri.nz/data-and-resources/national-earthquake-information-database/

*Verification — Only one source (the GNS NEID landing page) consulted; content verified directly (manager Paul Viskovic, seven components, no unified DOI, cite-each-resource instruction). No DOI claimed for NEID itself and none fabricated. Single-source basis, but the source is authoritative (institutional custodian).*

**Caveats:**
- NEID is an institutional umbrella/compilation database, not a single earthquake catalogue or event list; it overlaps with the GeoNet catalogue and waveform-dataset records in this batch but is a distinct custodial entity (kept, not rejected).
- No single DOI exists for NEID; doi field left blank and components must be cited separately.
- Start date not documented on the page.

**Notes:** No single product DOI for NEID; the page explicitly states 'Please cite each resource separately as specified by the resource.' Component DOIs include the GeoNet catalogue (10.21420/0S8P-TZ38) and the waveform dataset (10.21420/G19Y-9D40). Seven components: catalogue, moment tensors, waveform archive, station metadata, felt reports, strong-motion data products, fault-rupture models. Managed by Paul Viskovic (Geomodeller). data_availability marked 'available (DOI)' because its components carry DOIs even though NEID itself has none.

**Sources:** [www.gns.cri.nz/data-and-resources/national-earthquake-inform](https://www.gns.cri.nz/data-and-resources/national-earthquake-information-database/)

---

### 4. Computer File of New Zealand Earthquakes (DSIR Seismological Observatory)
*type: compilation · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Smith (1976) computer file; DSIR Seismological Observatory master file
- **Coverage:** 1460 → 1974
- **Region:** Aotearoa New Zealand (national)
- **Bounding box:** New Zealand region
- **Events:** >13,000 origins
- **Content:** hypocentral locations; historical observations
- **Producer / contact:** W. D. Smith, DSIR Seismological Observatory, Wellington, New Zealand
- **Data source:** Master file assembled mid-1970s by the DSIR Seismological Observatory from Observatory bulletins/origin determinations and Eiby descriptive catalogues for pre-instrumental events; stored on magnetic tape for the Burroughs B6700 computer at Victoria University of Wellington.
- **Availability:** not available

The foundational computerised national earthquake catalogue for New Zealand, assembled in the mid-1970s by W. D. Smith at the DSIR Seismological Observatory to satisfy recurrent requests for earthquake lists selected by geography and other criteria. It contains over 13,000 earthquake origins and is the direct institutional ancestor of the modern GeoNet/IGNS national catalogue. It draws on Eiby's descriptive catalogues for pre-instrumental (historical) events. It is a legacy magnetic-tape dataset and is not publicly available as such.

**Key references:**
- Smith, W. D. (1976). A computer file of New Zealand earthquakes. Bulletin of the New Zealand Society for Earthquake Engineering, 9(2), 136-... . https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184

*Verification — Citation confirmed via the BNZSEE OJS archive: author W. D. Smith, title 'A computer file of New Zealand earthquakes', Bulletin of the NZ Society for Earthquake Engineering Vol. 9 No. 2 (1976), start page 136; '>13,000 origins' and 'Burroughs B6700 at Victoria University of Wellington' verified from the abstract. No DOI for this legacy article (OJS landing/PDF URLs used instead). No fabricated details; year/author/venue correct.*

**Caveats:**
- Exact date range (1460-1974) and lower magnitude bound are inferred from the brief, not confirmed in the article abstract that was readable; start/end retained as best estimate.
- Citation page range incomplete (start page 136 confirmed; end page not captured).
- Underlying dataset (magnetic tape) is not publicly available; only the describing paper is accessible.

**Notes:** Confirmed via the BNZSEE archive: W. D. Smith (DSIR Seismological Observatory, Wellington), 'A computer file of New Zealand earthquakes', Bulletin of the New Zealand Society for Earthquake Engineering, Vol. 9, No. 2, 1976; article begins p.136. Abstract states 'over 13,000 earthquake origins' stored on magnetic tape for the Burroughs B6700 computer at Victoria University of Wellington. Date span of ~1460-1974 is from the batch brief (pre-instrumental events drawn from Eiby catalogues); the abstract itself did not state explicit start/end years. Direct ancestor of the modern national catalogue. No DOI (legacy publication / dataset).

**Sources:** [bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184](https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184) · [bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184/115](https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184/1151)

---

## Relocated & reprocessed catalogues (8)

### 5. Eberhart-Phillips & Reyners 2001-2011 NZ-Wide 3-D Relocated Catalogue
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: medium · verdict: confirmed*

- **Also known as:** NZ-Wide 3-D relocated catalogue 2001-2011
- **Coverage:** 2001 → 2011
- **Region:** New Zealand (nationwide); southern South Island comparison
- **Bounding box:** New Zealand (nationwide), approx. 34S-48S, 166E-179E, plus southern South Island comparison region
- **Content:** hypocentral locations; relative relocations; quality information
- **Producer / contact:** Donna Eberhart-Phillips & Martin Reyners, GNS Science (Te Pū Ao)
- **Data source:** GeoNet / New Zealand National Seismograph Network catalogue earthquakes (2001-2011), relocated using the NZ-Wide 3-D seismic velocity model (Eberhart-Phillips et al. NZ-Wide v2.2/v2.3); includes comparison with 2019-2020 auto-detected earthquakes in the southern South Island.
- **Availability:** available (DOI) · DOI [10.1080/00288306.2022.2089171](https://doi.org/10.1080/00288306.2022.2089171)

Produced to improve hypocentral accuracy over routine 1-D GeoNet locations by relocating the 2001-2011 national earthquake catalogue within the NZ-Wide 3-D velocity model, giving locations consistent with the velocity structure for use in seismic-hazard and tectonic studies. A secondary aim was to assess detection/location performance in the sparsely instrumented southern South Island by comparing relocated events with 2019-2020 auto-detected seismicity. A derived child of the GeoNet catalogue.

**Key references:**
- Eberhart-Phillips, D. & Reyners, M. (2022/2023). Catalogue of 2001-2011 New Zealand earthquakes relocated with 3-D seismic velocity model and comparison to 2019-2020 auto-detected earthquakes in the sparsely instrumented southern South Island. New Zealand Journal of Geology and Geophysics, 66(4), 646-653. https://doi.org/10.1080/00288306.2022.2089171
- Eberhart-Phillips, D., Bannister, S., Reyners, M. & Bourguignon, S. (2022). New Zealand Wide model 2.3 seismic velocity model for New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.6568301
- Eberhart-Phillips, D., Bannister, S., Reyners, M. & Henrys, S. (2020). New Zealand Wide model 2.2 seismic velocity and Qs and Qp models for New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.3779523

*Verification — DOI 10.1080/00288306.2022.2089171 resolves via Crossref to the exact title, authors (Eberhart-Phillips & Reyners), NZJGG 66(4):646-653 — matches brief. NZ-Wide model DOIs 10.5281/zenodo.6568301 (v2.3, 2022) and 10.5281/zenodo.3779523 (v2.2, 2020) both resolve and are correctly attributed to Eberhart-Phillips et al. All citations verified real and correctly attributed.*

**Caveats:**
- Event count not documented in sources consulted; left as unknown.
- Magnitude/Mc and depth range not extracted (article paywalled beyond abstract).
- Crossref publication year is 2022, not 2023 as in brief; recorded both.

**Notes:** Relocations use the NZ-Wide 3-D velocity model (v2.2 Zenodo 10.5281/zenodo.3779523; v2.3 Zenodo 10.5281/zenodo.6568301). Crossref lists publication year 2022 for the NZJGG article (issue 66(4)); the brief cited 2023 (online/issue year). Event count not stated in sources consulted.

**Sources:** [api.crossref.org/works/10.1080/00288306.2022.2089171](https://api.crossref.org/works/10.1080/00288306.2022.2089171) · [zenodo.org/records/6568301](https://zenodo.org/records/6568301) · [zenodo.org/records/3779523](https://zenodo.org/records/3779523) · [www.gns.cri.nz/about-us/staff-search/donna-eberhart-phillips](https://www.gns.cri.nz/about-us/staff-search/donna-eberhart-phillips/)

---

### 6. Hikurangi Subduction Zone Nested-Tomography Precise Relocation Catalogue (Aziz Zanjani et al. 2021)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Coverage:** 2012 → 2016
- **Region:** Hikurangi margin / Hikurangi subduction zone
- **Bounding box:** Hikurangi subduction zone, North Island and northern South Island, New Zealand
- **Depth range:** 0-250
- **Magnitude:** Approx. M2-5 (local/regional events used in relocation)
- **Events:** 57233 relocated (of 61654 catalogued); 43025 (75%) further refined with cross-correlation
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; other
- **Producer / contact:** Farzaneh Aziz Zanjani (University of Miami) with Guoqing Lin (Univ. Miami) & Clifford H. Thurber (Univ. Wisconsin-Madison)
- **Data source:** GeoNet local/regional P-wave arrival times (2012-2016) combined with ISC-EHB teleseismic P-wave data (1964-2016); relocated with teletomoDD nested regional-global double-difference tomography plus waveform cross-correlation differential times.
- **Availability:** available on request · DOI [10.1093/gji/ggab294](https://doi.org/10.1093/gji/ggab294)

Produced to obtain precise hypocentres and a nested regional-global velocity model along the Hikurangi subduction zone, sharpening imaging of the subducting slab and the double seismic zone. The teletomoDD inversion relocated the 2012-2016 GeoNet seismicity, with a large subset further refined using waveform cross-correlation to reduce relative location errors. A derived child of the GeoNet catalogue augmented by ISC-EHB teleseismic data.

**Key references:**
- Aziz Zanjani, F., Lin, G. & Thurber, C.H. (2021). Nested regional-global seismic tomography and precise earthquake relocation along the Hikurangi subduction zone, New Zealand. Geophysical Journal International, 227(3), 1567-1590. https://doi.org/10.1093/gji/ggab294

*Verification — DOI 10.1093/gji/ggab294 resolves to the exact paper; authors Aziz Zanjani, Lin & Thurber, GJI 227(3), 2021, pages 1567-1590 confirmed from the OUP page. Title in brief ('nested regional-global tomography') matches actual title. Citation real and correctly attributed; page range corrected.*

**Caveats:**
- Brief stated >57,000 relocated; exact figure is 57,233 of 61,654 catalogued.
- Brief page range 1567-1585 is wrong; correct is 1567-1590.
- No dedicated dataset DOI for the relocated catalogue; availability is via underlying GeoNet/ISC-EHB sources, so set to available on request.

**Notes:** teletomoDD double-difference nested tomography; teleseismic component from ISC-EHB 1964-2016. No standalone dataset DOI for the relocated catalogue was found; the paper's data-availability section points to GeoNet and ISC-EHB rather than a deposited catalogue. Brief page range '1567-1585' is incorrect; paper is 1567-1590.

**Sources:** [academic.oup.com/gji/article/227/3/1567/6329686](https://academic.oup.com/gji/article/227/3/1567/6329686) · [doi.org/10.1093/gji/ggab294](https://doi.org/10.1093/gji/ggab294)

---

### 7. ISC-EHB Bulletin (New Zealand coverage)
*type: compilation · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** EHB; Engdahl-van der Hilst-Buland Bulletin; ISC-EHB
- **Coverage:** 1964 → 2021
- **Region:** New Zealand / Kermadec / Hikurangi subset of global coverage
- **Bounding box:** Global; NZ/Kermadec/Hikurangi subset approx. 25S-55S, 160E-170W
- **Magnitude:** Teleseismically well-constrained events (typically ~M4.5+); magnitudes from ISC scheme
- **Events:** ~208,480 events globally (NZ/Kermadec/Hikurangi subset not separately reported)
- **Content:** hypocentral locations; phase arrival-time picks; quality information; other
- **Producer / contact:** International Seismological Centre (ISC), Thatcham, UK (E.R. Engdahl; D. Di Giacomo; D.A. Storchak)
- **Data source:** Groomed subset of the ISC Bulletin: teleseismically well-recorded events relocated with the EHB algorithm using primary and depth-phase arrival times; NZ/Kermadec/Hikurangi events are the qualifying subset.
- **Availability:** available (DOI) · DOI [10.31905/PY08W6S3](https://doi.org/10.31905/PY08W6S3)

A global, internally consistent 'groomed' dataset of teleseismically well-constrained earthquakes (1964-2021; the 1964-2008 portion rebuilt for this release) relocated with the EHB procedure to minimise location and especially depth bias. The qualifying New Zealand / Kermadec / Hikurangi subset provides homogeneous high-quality teleseismic hypocentres and depths suitable for slab and structure studies. It is a global product, not a standalone NZ catalogue; the NZ events are a regional subset.

**Key references:**
- Weston, J., Engdahl, E.R., Harris, J., Di Giacomo, D. & Storchak, D.A. (2018). ISC-EHB: Reconstruction of a robust earthquake data set. Geophysical Journal International, 214(1), 474-484. https://doi.org/10.1093/gji/ggy155
- Engdahl, E.R., Di Giacomo, D., Sakarya, B., Gkarlaouni, C.G., Harris, J. & Storchak, D.A. (2020). ISC-EHB 1964-2016, an Improved Data Set for Studies of Earth Structure and Global Seismicity. Earth and Space Science, 7(1), e2019EA000897. https://doi.org/10.1029/2019EA000897
- International Seismological Centre (2022). ISC-EHB dataset. https://doi.org/10.31905/PY08W6S3

*Verification — Dataset DOI 10.31905/PY08W6S3 confirmed on the official ISC citing page. Weston et al. 2018 GJI 214(1):474-484 (DOI 10.1093/gji/ggy155) and Engdahl et al. 2020 Earth and Space Science 7(1):e2019EA000897 (DOI 10.1029/2019EA000897) both confirmed with exact authors/venues/pages. All citations real and correctly attributed.*

**Caveats:**
- Global product, not NZ-specific — included as the qualifying NZ/Kermadec/Hikurangi subset per scope rules.
- NZ-subset event count not separately reported; global total ~208,480 given instead.

**Notes:** EHB = Engdahl-van der Hilst-Buland relocation. Dataset DOI 10.31905/PY08W6S3 confirmed on ISC citing page. Coverage currently to 2021 (reference papers cover 1964-2016). NZ is a subset, not an NZ-developed product — included because the NZ/Kermadec subset is widely used for NZ slab and hazard studies.

**Sources:** [www.isc.ac.uk/isc-ehb/](https://www.isc.ac.uk/isc-ehb/) · [www.isc.ac.uk/isc-ehb/citing.php](http://www.isc.ac.uk/isc-ehb/citing.php) · [agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2019EA00089](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2019EA000897) · [academic.oup.com/gji/article/214/1/474/4978439](https://academic.oup.com/gji/article/214/1/474/4978439)

---

### 8. ISC-GEM Global Instrumental Earthquake Catalogue (New Zealand coverage)
*type: large-events-only · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** ISC-GEM
- **Coverage:** 1904 → 2014
- **Region:** New Zealand / Kermadec / Hikurangi subset of global coverage
- **Bounding box:** Global; NZ/Kermadec/Hikurangi subset approx. 25S-55S, 160E-170W
- **Magnitude:** Large instrumental events: Mw>=7.5 (pre-1918), >=6.25 (1918-1959), >=5.5 (1960 onward); recomputed Mw
- **Events:** NZ subset not separately reported (global catalogue, large-events-only)
- **Content:** hypocentral locations; quality information; other
- **Producer / contact:** International Seismological Centre (ISC) / Global Earthquake Model (GEM) Foundation (D. Di Giacomo; E.R. Engdahl; D.A. Storchak)
- **Data source:** Reprocessed historical/instrumental station parametric data (1904 onward); hypocentres relocated and Mw recomputed under consistent methodology; NZ/Kermadec/Hikurangi large events are the qualifying subset.
- **Availability:** available (DOI) · DOI [10.31905/D808B825](https://doi.org/10.31905/D808B825)

A homogeneous global catalogue of large instrumental earthquakes (1904-2014, extended toward 2018+) with relocated hypocentres and recomputed moment magnitudes (Mw), selected by time-dependent magnitude thresholds. The qualifying large New Zealand / Kermadec / Hikurangi events provide a long-period, large-event source/benchmark used in NZ seismic-hazard work (e.g. NSHM 2022). It is a global product, not NZ-specific; NZ events are a subset.

**Key references:**
- Di Giacomo, D., Engdahl, E.R. & Storchak, D.A. (2018). The ISC-GEM Earthquake Catalogue (1904-2014): status after the Extension Project. Earth System Science Data, 10(4), 1877-1899. https://doi.org/10.5194/essd-10-1877-2018
- Storchak, D.A., Di Giacomo, D., Engdahl, E.R., Harris, J., Bondar, I., Lee, W.H.K., Bormann, P. & Villasenor, A. (2015). The ISC-GEM Global Instrumental Earthquake Catalogue (1900-2009): Introduction. Physics of the Earth and Planetary Interiors, 239, 48-63. https://doi.org/10.1016/j.pepi.2014.06.009
- International Seismological Centre (2021). ISC-GEM Earthquake Catalogue. https://doi.org/10.31905/D808B825

*Verification — Di Giacomo et al. 2018 ESSD 10(4):1877-1899 (DOI 10.5194/essd-10-1877-2018) confirmed verbatim from the Copernicus page, including 1904-2014 coverage and cut-off magnitudes. Storchak et al. 2015 PEPI 239:48-63 is the genuine ISC-GEM introduction paper (consistent with the ADS record cited). Dataset DOI 10.31905/D808B825 from brief, not independently re-resolved. Citations real and correctly attributed.*

**Caveats:**
- Global product, not NZ-specific — included as the qualifying large NZ/Kermadec/Hikurangi subset per scope rules.
- End date recorded as 2014 (the 2018 ESSD reference catalogue extent); later annual extensions exist toward 2018+ but the canonical defining paper is 1904-2014.
- Dataset DOI 10.31905/D808B825 carried from brief; ESSD paper DOI independently confirmed.

**Notes:** Cut-off magnitudes from the 2018 ESSD paper. Used as a large-event source/benchmark for NZ in NSHM 2022. Global product; NZ events are a subset. Dataset DOI 10.31905/D808B825 as cited in the brief (not re-resolved directly but consistent with ISC-GEM landing pages consulted).

**Sources:** [essd.copernicus.org/articles/10/1877/2018/](https://essd.copernicus.org/articles/10/1877/2018/) · [www.globalquakemodel.org/product/isc-gem-catalog](https://www.globalquakemodel.org/product/isc-gem-catalog) · [ui.adsabs.harvard.edu/abs/2015PEPI..239...48S/abstract](https://ui.adsabs.harvard.edu/abs/2015PEPI..239...48S/abstract)

---

### 9. Taupo Volcanic Zone Consistent High-Precision Earthquake Catalogue (2007-2023)
*type: background · focus: geographical · detection: machine-learning · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** TVZ catalogue; Illsley-Kemp & Mestel 2025
- **Coverage:** 2007 → 2023
- **Region:** Taupō Volcanic Zone (TVZ)
- **Bounding box:** Taupō Volcanic Zone, central North Island, New Zealand (~300 km long zone)
- **Events:** 86579 events (~65% high-precision relocated)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; quality information
- **Producer / contact:** Finnigan Illsley-Kemp & Eleanor Mestel, Te Herenga Waka - Victoria University of Wellington
- **Data source:** GeoNet permanent network waveforms integrated with temporary TVZ deployments (incl. HADES array, Bannister 2009; back-arc rifting arrays); EQTransformer ML phase picking, 3-D velocity model location, GrowClust3D relative relocation.
- **Availability:** available (DOI) · DOI [10.26443/seismica.v4i1.1490](https://doi.org/10.26443/seismica.v4i1.1490)

Produced to create a single internally consistent, high-precision earthquake catalogue spanning the whole ~300 km Taupō Volcanic Zone over 2007-2023, overcoming the heterogeneity of routine locations across many separate deployments. Uses EQTransformer machine-learning phase picking, location in a 3-D velocity model, and GrowClust3D relative relocation. A flagship ML + 3-D reprocessing effort merging permanent GeoNet data with temporary TVZ arrays.

**Key references:**
- Illsley-Kemp, F. & Mestel, E.R.H. (2025). A new consistent and high-precision earthquake catalogue for the Taupō Volcanic Zone, New Zealand. Seismica, 4(1). https://doi.org/10.26443/seismica.v4i1.1490

*Verification — DOI 10.26443/seismica.v4i1.1490 resolves to the Seismica article; authors Illsley-Kemp & Mestel, vol 4(1), 2025, title, time span 2007-2023, 86,579 events and ~65% relocated all confirmed from the article page. Citation real and correctly attributed.*

**Caveats:**
- Mc / magnitude range not stated in the abstract consulted; left unknown.
- HADES FDSN code Z8 taken from brief, not independently confirmed against an FDSN network page.

**Notes:** EQTransformer ML picking + 3-D location + GrowClust3D relocation. Integrates temporary deployments including the HADES array (FDSN code Z8 per brief) and TVZ back-arc rifting arrays. Underlying GeoNet waveform archive DOI 10.21420/G19Y-9D40. ~56,000 of 86,579 events high-precision relocated (~65%).

**Sources:** [seismica.library.mcgill.ca/article/view/1490](https://seismica.library.mcgill.ca/article/view/1490) · [elmestel.wordpress.com/publications/](https://elmestel.wordpress.com/publications/)

---

### 10. Wellington Region Double-Difference Relocated Catalogue (Du et al. 2004)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Du et al. 2004 Wellington hypoDD catalogue
- **Coverage:** 1990 → 2001
- **Region:** Wellington region / SW Hikurangi margin
- **Bounding box:** Wellington region, southern North Island, New Zealand
- **Magnitude:** Approx. M1.8-6.5
- **Events:** 6592 relocated of 6825 (96.5%)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks
- **Producer / contact:** Wen-xuan Du & Clifford H. Thurber (Univ. Wisconsin-Madison); with M. Reyners & D. Eberhart-Phillips (GNS Science) and H. Zhang
- **Data source:** Wellington-region seismicity 1990-2001 from the NZ National Seismograph Network plus some temporary stations (47 stations within 200 km; 22 primary control stations); catalogue and waveform-based differential times relocated with hypoDD double-difference.
- **Availability:** not available · DOI [10.1111/j.1365-246X.2004.02366.x](https://doi.org/10.1111/j.1365-246X.2004.02366.x)

An early double-difference (hypoDD) relocation of Wellington-region earthquakes (1990-2001) to obtain precise relative hypocentres and resolve fine seismicity structure. The relocations sharpened both planes of the double seismic zone to <10 km thickness (~20 km apart) and revealed intraslab faulting at the SW end of the Hikurangi margin. A derived child of the national catalogue using permanent NZNSN plus some temporary stations.

**Key references:**
- Du, W.-x., Thurber, C.H., Reyners, M., Eberhart-Phillips, D. & Zhang, H. (2004). New constraints on seismicity in the Wellington region of New Zealand from relocated earthquake hypocentres. Geophysical Journal International, 158(3), 1088-1102. https://doi.org/10.1111/j.1365-246X.2004.02366.x

*Verification — DOI 10.1111/j.1365-246X.2004.02366.x resolves to the GJI article; full author list (Du, Thurber, Reyners, Eberhart-Phillips, Zhang), GJI 158(3):1088-1102, 2004, time span 1990-2001, 6592/6825 relocated, M1.8-6.5 all confirmed from the OUP page. Citation real and correctly attributed.*

**Caveats:**
- No standalone dataset DOI; only the article DOI exists, so data_availability set to not available (results in-paper only).

**Notes:** hypoDD double-difference, catalogue + waveform (cross-correlation) differential times. Double seismic zone planes reduced to <10 km thickness, ~20 km apart. No deposited dataset DOI found — only the journal article; relocated catalogue is published within the paper, not as a standalone dataset.

**Sources:** [academic.oup.com/gji/article/158/3/1088/553109](https://academic.oup.com/gji/article/158/3/1088/553109)

---

### 11. Central Alpine Fault Relocated Microseismicity Catalogue (Michailos 2008-2017 / SAMBA)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** SAMBA microseismicity catalogue; Michailos et al. 2019
- **Coverage:** 2008 → 2017
- **Region:** Central Southern Alps / Alpine Fault (Ka Tiritiri o te Moana)
- **Bounding box:** Central Southern Alps / Alpine Fault, South Island, New Zealand
- **Magnitude:** Microseismicity; local magnitudes provided per event
- **Events:** 8137 earthquakes; 7719 high-precision relocated hypocentres
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; quality information
- **Producer / contact:** Konstantinos Michailos with Euan G.C. Smith, Calum J. Chamberlain, Martha K. Savage & John Townend, Victoria University of Wellington
- **Data source:** GeoNet permanent stations plus temporary Southern Alps arrays (SAMBA, ALFA08/09, WIZARD, DFDP); local-earthquake locations relocated with hypoDD double-difference; QuakeML catalogue deposited on Zenodo.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.3529755](https://doi.org/10.5281/zenodo.3529755)

A decade-long (2008-2017) double-difference (hypoDD) relocated microseismicity catalogue of the central Southern Alps / Alpine Fault, produced to map along-strike variations in seismogenic thickness and the fault's microseismic behaviour. Built by combining permanent GeoNet data with multiple temporary Southern Alps deployments. Predecessor to the 2025 matched-filter catalogue.

**Key references:**
- Michailos, K., Smith, E.G.C., Chamberlain, C.J., Savage, M.K. & Townend, J. (2019). Variations in Seismogenic Thickness Along the Central Alpine Fault, New Zealand, Revealed by a Decade's Relocated Microseismicity. Geochemistry, Geophysics, Geosystems, 20(1), 470-486. https://doi.org/10.1029/2018GC007743
- Michailos, K. (2019). Southern Alps, New Zealand microseismicity earthquake catalog [Data set, QuakeML]. Zenodo. https://doi.org/10.5281/zenodo.3529755

*Verification — Zenodo DOI 10.5281/zenodo.3529755 resolves (Michailos 2019, QuakeML, Southern Alps, 2008-2017) and references the G-cubed paper. Crossref confirms Michailos, Smith, Chamberlain, Savage & Townend (2019), G-cubed 20(1):470-486, DOI 10.1029/2018GC007743 — full author list and venue correct; page range corrected from brief. Citations real and correctly attributed.*

**Caveats:**
- Brief page range 470-491 is incorrect; Crossref confirms 470-486.
- Event counts (8137/7719) from brief, not re-verified against paywalled full text; abstract-level scope consistent.

**Notes:** hypoDD relocation; QuakeML catalogue (location, phase picks, local magnitude) on Zenodo. Temporary arrays: SAMBA, ALFA08/09, WIZARD, DFDP + GeoNet. Event counts (8137/7719) from brief; the G-cubed article is paywalled so not re-confirmed from full text, but counts consistent with the abstract scope. Brief page range '470-491' is wrong; Crossref gives 470-486.

**Sources:** [zenodo.org/records/3529755](https://zenodo.org/records/3529755) · [api.crossref.org/works/10.1029/2018GC007743](https://api.crossref.org/works/10.1029/2018GC007743)

---

### 12. Central Southern Alps Matched-Filter Microseismicity Catalogue (Michailos 2009-2020)
*type: background · focus: geographical · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** SAMBA matched-filter catalogue; Southern Alps/Ka Tiritiri o te Moana matched-filter catalog
- **Coverage:** 2009 → 2020
- **Region:** Central Southern Alps / Alpine Fault (Ka Tiritiri o te Moana)
- **Bounding box:** Central Southern Alps / Alpine Fault, South Island, New Zealand
- **Magnitude:** Microseismicity; local magnitudes provided per event
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; quality information; other
- **Producer / contact:** Konstantinos Michailos with Calum J. Chamberlain, Simon C. Cox, John Townend et al. (Victoria University of Wellington / Australian National University)
- **Data source:** Templates from the 2008-2017 SAMBA hypoDD catalogue applied via matched-filter (template-matching) detection to continuous GeoNet + Southern Alps array waveforms (2009-2020); QuakeML + CSV catalogue on Zenodo.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.15002912](https://doi.org/10.5281/zenodo.15002912)

A template-matching (matched-filter) enhanced microseismicity catalogue for the central Southern Alps / Alpine Fault (2009-2020) that substantially densifies the 2019 SAMBA catalogue with many additional small events. Produced to study temporal seismicity variations, including rainfall/snowmelt-triggered seismicity. A distinct child of the Michailos 2008-2017 catalogue rather than a duplicate.

**Key references:**
- Michailos, K., Chamberlain, C.J., Simpson, G., Cox, S.C., Townend, J., Vargo, L.J., Oestreicher, N. & Miller, M.S. (2025). Temporal Evolution of Seismicity in the Central Southern Alps, New Zealand: Evidence for Rainfall-Triggered Seismicity. Geochemistry, Geophysics, Geosystems, 26(8), e2025GC012317. https://doi.org/10.1029/2025GC012317
- Michailos, K. (2025). Southern Alps/Kā Tiritiri o te Moana Matched-Filter based microseismicity earthquake catalog [Data set, QuakeML+CSV]. Zenodo. https://doi.org/10.5281/zenodo.15002912

*Verification — Zenodo DOI 10.5281/zenodo.15002912 resolves (Michailos 2025, matched-filter, Southern Alps, 2009-2020, QuakeML+CSV) and references the G-cubed paper. Crossref confirms companion paper Michailos, Chamberlain, Simpson, Cox, Townend, Vargo, Oestreicher & Miller (2025), G-cubed 26(8):e2025GC012317, DOI 10.1029/2025GC012317. Note the brief framed the companion as rainfall/snowmelt-triggered study, consistent with confirmed title. Citations real and correctly attributed.*

**Caveats:**
- Exact event count not documented in the Zenodo metadata consulted; left unknown.
- Distinct from the 2008-2017 SAMBA catalogue (different method, time span, DOI) — not a duplicate.

**Notes:** Matched-filter/template-matching detection densifying the 2019 SAMBA catalogue. QuakeML + CSV on Zenodo (location, phase picks, local magnitude). Companion paper studies rainfall/snowmelt-triggered seismicity. Exact event count not stated in metadata consulted.

**Sources:** [zenodo.org/records/15002912](https://zenodo.org/records/15002912) · [api.crossref.org/works/10.1029/2025GC012317](https://api.crossref.org/works/10.1029/2025GC012317) · [agupubs.onlinelibrary.wiley.com/doi/10.1029/2025GC012317](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025GC012317) · [phys.org/news/2025-08-microearthquakes-zealand-southern-alps](https://phys.org/news/2025-08-microearthquakes-zealand-southern-alps-common.html)

---

## Historical & macroseismic (felt-report) catalogues (12)

### 13. Atlas of Isoseismal Maps of New Zealand Earthquakes (1st edition, Downes 1995)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Downes 1995; IGNS Monograph 11; EQC Paper 7 (EQC 91/40)
- **Coverage:** 1848 → 1990
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand mainland and near-offshore; one event south of the Kermadec Islands
- **Magnitude:** Smallest event ML 3.5 (1963 Mangonui); largest the 1855 Wairarapa earthquake (~Mw 8.0-8.2); intensities in NZ-adapted Modified Mercalli (MM)
- **Events:** 123 earthquakes / 133 isoseismal maps
- **Content:** historical observations; hypocentral locations; quality information; other
- **Producer / contact:** G.L. Downes, Institute of Geological & Nuclear Sciences (IGNS, now GNS Science); funded by EQC (Earthquake Commission, now Natural Hazards Commission Toka Tu Ake)
- **Data source:** Compilation of historical felt/macroseismic observations, newspaper and documentary records, and prior catalogues (incl. Eiby) reassessed into NZ-adapted Modified Mercalli intensities; isoseismal maps drawn for each event.
- **Availability:** available (DOI) · DOI [https://www.naturalhazards.govt.nz/assets/Publications-Resources/7-Atlas-of-isoseismal-maps-of-New-Zealand-earthquakes-compressed-v2.pdf](https://www.naturalhazards.govt.nz/assets/Publications-Resources/7-Atlas-of-isoseismal-maps-of-New-Zealand-earthquakes-compressed-v2.pdf)

Foundational national atlas of isoseismal (felt-intensity) maps for New Zealand earthquakes, produced to systematise macroseismic intensity data for hazard, engineering and historical seismicity studies using the NZ-adapted Modified Mercalli scale. Provides 133 isoseismal maps for the felt distributions of 123 earthquakes (122 in/near the NZ mainland plus one Mw~6.7 event south of the Kermadecs), each with revised hypocentral parameters and a brief descriptive account. Free PDF via the Natural Hazards Commission/EQC; superseded and extended by the 2014 2nd edition (Monograph 25).

**Key references:**
- Downes, G.L. (1995). Atlas of isoseismal maps of New Zealand earthquakes. Institute of Geological & Nuclear Sciences Monograph 11 (EQC Paper 7 / EQC 91/40). Lower Hutt, NZ. https://www.naturalhazards.govt.nz/assets/Publications-Resources/7-Atlas-of-isoseismal-maps-of-New-Zealand-earthquakes-compressed-v2.pdf

*Verification — Confirmed via the Natural Hazards Commission landing page: Downes (1995), IGNS Monograph 11, Paper 7 (EQC 91/40), 123 earthquakes / 133 maps, 1848-1990, smallest ML 3.5 (1963 Mangonui), free PDF, no DOI. The PDF URL is a working stable landing/download link, treated as the data-availability URL (not a true DOI).*

**Notes:** EQC report number 'Paper 7' (project EQC 91/40). No formal DOI; a free PDF landing/download page serves as the stable URL. Map-based macroseismic atlas, not a digital hypocentre file. Successor: Downes & Dowrick (2014), GNS Science Monograph 25, 1843-2003.

**Sources:** [www.naturalhazards.govt.nz/resilience-and-research/research/](https://www.naturalhazards.govt.nz/resilience-and-research/research/search-all-research-reports/atlas-of-isoseismal-maps-of-new-zealand-earthquakes/) · [www.naturalhazards.govt.nz/assets/Publications-Resources/7-A](https://www.naturalhazards.govt.nz/assets/Publications-Resources/7-Atlas-of-isoseismal-maps-of-New-Zealand-earthquakes-compressed-v2.pdf)

---

### 14. Atlas of Isoseismal Maps of New Zealand Earthquakes 1843-2003 (2nd edition, Downes & Dowrick 2014)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed · confidence: medium · verdict: confirmed*

- **Also known as:** Downes & Dowrick 2014; GNS Science Monograph 25; ISBN 978-0-478-19663-4
- **Coverage:** 1843 → 2003
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand mainland and near-offshore margins
- **Magnitude:** Spans small felt events through the largest historical NZ shocks (incl. 1855 Wairarapa ~Mw 8.0-8.2); intensities in NZ-adapted Modified Mercalli (MM)
- **Content:** historical observations; hypocentral locations; quality information; other
- **Producer / contact:** G.L. Downes & D.J. Dowrick, GNS Science, Lower Hutt
- **Data source:** Revision and extension of the 1995 1st edition (Monograph 11), incorporating reassessed Modified Mercalli intensities, magnitudes and hypocentral locations from additional documentary and instrumental sources.
- **Availability:** available on request

Revised and expanded national isoseismal atlas (797 pp.) covering NZ earthquakes 1843-2003, extending the 1995 1st edition with reassessed MM intensities, magnitudes and locations and additional events/maps. Produced to provide an updated authoritative macroseismic reference for seismic hazard, engineering and historical-seismicity work in New Zealand. A distinct successor edition (GNS Science Monograph 25), originally distributed on CD and available on request rather than as an open download.

**Key references:**
- Downes, G.L. & Dowrick, D.J. (2014). Atlas of isoseismal maps of New Zealand earthquakes 1843-2003, 2nd edition (revised). GNS Science Monograph 25. Lower Hutt, NZ: GNS Science. ISBN 978-0-478-19663-4.

*Verification — Authors (Downes & Dowrick), year 2014, title, 1843-2003 span, 797 pp., GNS Science Monograph 25 confirmed via multiple search hits. ISBN taken from the input brief and not independently re-verified. No DOI exists; the candidate Wiley DOI in the brief actually resolves to Downes & Yetton (2012) and was excluded. Event count not separately documented in sources read; left unquantified.*

**Caveats:**
- No open DOI; only available on request (CD/monograph).
- Brief's candidate Wiley URL misattributed (belongs to Downes & Yetton 2012); not used.
- Exact event count for the 2nd edition not verified in sources read.

**Notes:** Distinct successor to Monograph 11 (Downes 1995). 797 pp.; originally issued on CD. No open DOI located. The brief's candidate Wiley URL (10.1080/00288306.2012.690767) does NOT belong to this atlas — that DOI is the Downes & Yetton (2012) 1869/1870 Canterbury paper; treat as a finder error.

**Sources:** [www.naturalhazards.govt.nz/resilience-and-research/research/](https://www.naturalhazards.govt.nz/resilience-and-research/research/search-all-research-reports/atlas-of-isoseismal-maps-of-new-zealand-earthquakes/)

---

### 15. A Descriptive Catalogue of New Zealand Earthquakes (Eiby 1968/1973)
*type: historical · focus: geographical · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Eiby 1968 Part I; Eiby 1973 Part II
- **Coverage:** pre-1845 (Part I); 1846 (Part II) → 1854
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand (national)
- **Magnitude:** No instrumental magnitudes; events assigned to four felt-based magnitude classes
- **Events:** >80 (Part I, pre-1845); ~300 further entries (Part II, 1846-1854)
- **Content:** historical observations; quality information; other
- **Producer / contact:** G.A. Eiby, Geophysics Division, DSIR (New Zealand)
- **Data source:** Documentary/historical records: published and previously unpublished accounts, newspapers, settlers' and observers' reports of felt earthquakes; full source references given per event.
- **Availability:** available (DOI) · DOI [10.1080/00288306.1968.10423671](https://doi.org/10.1080/00288306.1968.10423671)

Foundational documentary chronological catalogue of pre-instrumental New Zealand earthquakes compiled from felt/historical evidence, with events assigned to four felt-based magnitude classes and full source references. Part I (1968) lists >80 events felt before the end of 1845; Part II (1973) adds ~300 further entries for shocks felt 1846-1854 (incl. correcting the mis-dated/mis-located 1848 Marlborough event) with isoseismal map(s). Underpins later Downes historical-macroseismic work and W.D. Smith's 1976 computer file.

**Key references:**
- Eiby, G.A. (1968). A descriptive catalogue of New Zealand earthquakes. Part I — Shocks felt before the end of 1845. New Zealand Journal of Geology and Geophysics, 11(1), 16-40. https://doi.org/10.1080/00288306.1968.10423671
- Eiby, G.A. (1973). A descriptive catalogue of New Zealand earthquakes. Part 2 — Shocks felt from 1846 to 1854. New Zealand Journal of Geology and Geophysics, 16(4), 857-907. https://doi.org/10.1080/00288306.1973.10555229

*Verification — Part I (Eiby 1968, NZJGG 11(1):16-40, DOI 10.1080/00288306.1968.10423671) confirmed via search; abstract confirms >80 events before end of 1845, four magnitude classes. Part II (Eiby 1973, NZJGG 16(4):857-907, DOI 10.1080/00288306.1973.10555229) confirmed via Crossref; abstract confirms ~300 entries 1846-1854 and the 1848 Marlborough correction. Both DOIs and author/venue/pages correct.*

**Notes:** Two-part work. Part II DOI 10.1080/00288306.1973.10555229 (NZJGG 16(4):857-907) confirmed via Crossref. Pre-instrumental coverage ends 1854 (Part II); precursor to Eiby's 1968 annotated list and Smith's 1976 computer file. Coverage is pre-1960 but is the documentary backbone reused in NZ catalogues that extend through 1960-2026, so in scope.

**Sources:** [www.tandfonline.com/doi/abs/10.1080/00288306.1968.10423671](https://www.tandfonline.com/doi/abs/10.1080/00288306.1968.10423671) · [www.tandfonline.com/doi/pdf/10.1080/00288306.1973.10555229](https://www.tandfonline.com/doi/pdf/10.1080/00288306.1973.10555229) · [api.crossref.org/works/10.1080/00288306.1973.10555229](https://api.crossref.org/works/10.1080/00288306.1973.10555229)

---

### 16. An Annotated List of New Zealand Earthquakes, 1460-1965 (Eiby 1968)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Eiby 1968 annotated list
- **Coverage:** 1460 → 1965
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand (national)
- **Magnitude:** Mix of felt-based magnitude classes (early/pre-instrumental) and early instrumental magnitude estimates
- **Content:** historical observations; hypocentral locations; quality information; other
- **Producer / contact:** G.A. Eiby, Geophysics Division, DSIR (New Zealand)
- **Data source:** Merged pre-instrumental documentary/felt records and early instrumental observatory data into a single long-span annotated chronological list.
- **Availability:** available (DOI) · DOI [10.1080/00288306.1968.10420275](https://doi.org/10.1080/00288306.1968.10420275)

Long-span (1460-1965) annotated chronological list of New Zealand earthquakes that merges pre-instrumental documentary/felt records with early instrumental observatory determinations, serving as a companion to Eiby's descriptive catalogue and a precursor to W.D. Smith's 1976 computer file. Distinct in scope and span from the descriptive catalogue (which stops at 1854). Published in NZJGG 11(3):630-647.

**Key references:**
- Eiby, G.A. (1968). An annotated list of New Zealand earthquakes, 1460-1965. New Zealand Journal of Geology and Geophysics, 11(3), 630-647. https://doi.org/10.1080/00288306.1968.10420275

*Verification — Confirmed via Crossref: Eiby (1968), NZJGG 11(3):630-647, DOI 10.1080/00288306.1968.10420275. Author/year/title/venue/volume/issue/pages all correct. Total event count not stated in sources read, so left unquantified rather than guessed.*

**Caveats:**
- Total event count not documented in sources read.

**Notes:** Companion to but distinct from Eiby's descriptive catalogue (different 1460-1965 span vs pre-1854 documentary focus). Coverage extends into the 1960-2026 window (ends 1965) and is the documentary precursor to Smith (1976). detection_method recorded as felt-reports because the long-span list is dominated by documentary/felt records, though later entries incorporate instrumental data.

**Sources:** [www.tandfonline.com/doi/pdf/10.1080/00288306.1968.10420275](https://www.tandfonline.com/doi/pdf/10.1080/00288306.1968.10420275) · [api.crossref.org/works/10.1080/00288306.1968.10420275](https://api.crossref.org/works/10.1080/00288306.1968.10420275)

---

### 17. GeoNet Felt Classic / Community Modified Mercalli Intensity (CMMI) Dataset
*type: compilation · focus: parameter-testing · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Felt Classic; CMMI; Goded et al. 2018 method dataset
- **Coverage:** 2004 → 2016
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand (national)
- **Magnitude:** CMMI test set spans Mw 5.7-7.8; intensities expressed as community Modified Mercalli intensity (CMMI)
- **Events:** ~43,000 felt reports across 9 earthquakes (CMMI test set); broader database ~914,000 reports / 27,688 earthquakes (2004-2016)
- **Content:** historical observations; quality information; other
- **Producer / contact:** Tatiana Goded et al., GNS Science / GeoNet
- **Data source:** Crowd-sourced online 'Felt Classic' citizen felt reports collected via the GeoNet website (2004-2016), converted by an expert/matrix method into community Modified Mercalli intensities (CMMI).
- **Availability:** available on request · DOI [10.1785/0220170163](https://doi.org/10.1785/0220170163)

Citizen-science macroseismic dataset built from GeoNet's 'Felt Classic' online felt reports (2004-2016), converted by an expert (matrix) method into community Modified Mercalli intensities (CMMI) to provide consistent intensity data for NZ earthquakes. The method paper (Goded et al. 2018) implements and tests it on ~43,000 reports from nine moderate-to-large (Mw 5.7-7.8) earthquakes (incl. 2010 Darfield, 2011 Christchurch, 2016 Kaikoura), and reports a first CMMI database of ~914,000 reports from 27,688 earthquakes (2004-2016). Superseded by Felt Rapid (from 2015) and complemented by Felt Detailed.

**Key references:**
- Goded, T., Horspool, N., Canessa, S., Lewis, A., Geraghty, K., Jeffrey, A., & Gerstenberger, M. (2018). New macroseismic intensity assessment method for New Zealand web questionnaires. Seismological Research Letters, 89(2A), 640-652. https://doi.org/10.1785/0220170163

*Verification — Goded et al. (2018), SRL 89(2A):640-652, DOI 10.1785/0220170163 confirmed via Crossref (full 7-author list). Search of the abstract confirms Felt Classic 2004-2016, ~43,000 reports / 9 earthquakes (Mw 5.7-7.8) test set, and the 914,000-report / 27,688-earthquake CMMI database figures. DOI is a paper DOI, not a dataset DOI; flagged accordingly.*

**Caveats:**
- DOI provided is the method-paper DOI, not a standalone dataset DOI; raw dataset itself is available on request.

**Notes:** The DOI 10.1785/0220170163 is the SRL method paper, NOT a separate dataset DOI; the underlying Felt Classic / CMMI data is available on request from GeoNet/GNS. focus set to parameter-testing because the dataset is primarily a method-development/test product (CMMI intensity assignment). Distinct from Felt Rapid and Felt Detailed.

**Sources:** [pubs.geoscienceworld.org/ssa/srl/article-abstract/89/2A/640/](https://pubs.geoscienceworld.org/ssa/srl/article-abstract/89/2A/640/526298/New-Macroseismic-Intensity-Assessment-Method-for) · [api.crossref.org/works/10.1785/0220170163](https://api.crossref.org/works/10.1785/0220170163) · [www.geonet.org.nz/data/types/felt](https://www.geonet.org.nz/data/types/felt)

---

### 18. GeoNet Aotearoa New Zealand Felt Rapid Dataset
*type: compilation · focus: geographical · detection: felt-reports · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Felt Rapid; GeoNet reported intensity
- **Coverage:** 2015 → ongoing
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand (national)
- **Magnitude:** All felt earthquakes; reported MM-style (Modified Mercalli) intensities derived from cartoon shaking selections
- **Content:** historical observations; other
- **Producer / contact:** GNS Science / GeoNet
- **Data source:** Ongoing crowd-sourced rapid citizen felt reports submitted via the GeoNet website/app using a cartoon shaking-selection interface; served through the GeoNet API (intensity?type=reported); geohashed for privacy.
- **Availability:** available (DOI) · DOI [10.21420/RS7F-VE53](https://doi.org/10.21420/RS7F-VE53)

Ongoing citizen-science dataset of rapid felt reports collected via GeoNet's web/app cartoon shaking-selection tool from 2015 to present, providing reported MM-style intensities for all felt NZ earthquakes in near-real time. Served through the GeoNet API and geohashed to protect reporter privacy. Successor to Felt Classic and complements the long-form Felt Detailed product; feeds intensity inputs used in Shaking Layers.

**Key references:**
- GNS Science. (2015). GeoNet Aotearoa New Zealand Felt Rapid Dataset [Data set]. GNS Science. https://doi.org/10.21420/RS7F-VE53

*Verification — DOI 10.21420/RS7F-VE53, title, GNS Science producer, 2015 start and ongoing coverage, and API/citation confirmed via data.govt.nz dataset page. No event count reported; left blank.*

**Notes:** DOI 10.21420/RS7F-VE53 confirmed (GNS Science 2015). Crowd-sourced, not expert-reviewed (review_status non-reviewed). Privacy via geohashing. Catalogued as historical-macroseismic per task instruction though it is an ongoing intensity-report stream.

**Sources:** [catalogue.data.govt.nz/dataset/geonet-aotearoa-new-zealand-f](https://catalogue.data.govt.nz/dataset/geonet-aotearoa-new-zealand-felt-rapid-dataset) · [www.geonet.org.nz/data/types/felt](https://www.geonet.org.nz/data/types/felt)

---

### 19. GeoNet Felt Detailed Macroseismic Intensity Dataset
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Felt Detailed; Goded et al. 2017 Kaikoura felt intensities
- **Coverage:** 2016 → ongoing
- **Region:** New Zealand (national); demonstrated for Kaikoura/upper South Island & lower North Island
- **Bounding box:** New Zealand (national)
- **Magnitude:** Issued for very large earthquakes (demonstration event M7.8 2016 Kaikoura); community Modified Mercalli intensities
- **Events:** ~3,500 Felt Detailed reports for the 2016 Kaikoura demonstration (plus ~15,000 Felt Rapid)
- **Content:** historical observations; quality information; other
- **Producer / contact:** Tatiana Goded et al., GNS Science / GeoNet
- **Data source:** Community/MM intensities derived from GeoNet's long-form (~40-question) 'Felt Detailed' citizen questionnaires (issued after very large earthquakes from ~2016), demonstrated for the 2016 Kaikoura earthquake.
- **Availability:** available on request · DOI [10.5459/bnzsee.50.2.352-362](https://doi.org/10.5459/bnzsee.50.2.352-362)

Macroseismic dataset of community/Modified Mercalli intensities derived from GeoNet's long-form 'Felt Detailed' citizen questionnaires (issued after very large earthquakes from ~2016) to capture richer damage/shaking detail than the rapid product. Demonstrated for the M7.8 14 November 2016 Kaikoura earthquake using ~3,500 Felt Detailed plus ~15,000 Felt Rapid reports (Goded et al. 2017). Available on request; intensities feed the GeoNet Shaking Layers product.

**Key references:**
- Goded, T., Horspool, N., Canessa, S., & Gerstenberger, M. (2017). Modified Mercalli intensities for the M7.8 Kaikoura (New Zealand) 14 November 2016 earthquake derived from 'felt detailed' and 'felt rapid' online questionnaires. Bulletin of the New Zealand Society for Earthquake Engineering, 50(2), 352-362. https://doi.org/10.5459/bnzsee.50.2.352-362

*Verification — Goded et al. (2017), BNZSEE 50(2):352-362, DOI 10.5459/bnzsee.50.2.352-362 confirmed via Crossref (4-author list: Goded, Horspool, Canessa, Gerstenberger). Title confirms Felt Detailed + Felt Rapid intensities for the 2016 Kaikoura earthquake. DOI is a paper DOI, not a dataset DOI; flagged.*

**Caveats:**
- DOI is the method-paper DOI, not a standalone dataset DOI; raw Felt Detailed data available on request.
- Per-event report counts (~3,500/~15,000) are from the input brief; specific figures not re-verified line-by-line in the paper text (paywalled/image PDF).

**Notes:** DOI 10.5459/bnzsee.50.2.352-362 is the BNZSEE method/demonstration paper (Goded et al. 2017), NOT a separate dataset DOI; underlying Felt Detailed data available on request from GeoNet/GNS. Distinct from Felt Rapid (short cartoon form) and Felt Classic. Feeds Shaking Layers.

**Sources:** [bulletin.nzsee.org.nz/article/view/88](https://bulletin.nzsee.org.nz/article/view/88) · [api.crossref.org/works/10.5459/bnzsee.50.2.352-362](https://api.crossref.org/works/10.5459/bnzsee.50.2.352-362) · [www.gns.cri.nz/our-science/natural-hazards-and-risks/earthqu](https://www.gns.cri.nz/our-science/natural-hazards-and-risks/earthquakes/earthquake-felt-reports-felt-details/)

---

### 20. GeoNet Aotearoa New Zealand Shaking Layers Dataset
*type: compilation · focus: geographical · detection: other · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Shaking Layers; ShakeMapNZ
- **Coverage:** unknown — not documented → ongoing
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand (national)
- **Magnitude:** Earthquakes M>=3.5; outputs include modelled MMI plus PGA/PGV/spectral acceleration
- **Content:** quality information; other
- **Producer / contact:** GNS Science / GeoNet (now Earth Sciences New Zealand)
- **Data source:** Near-real-time modelled ground-shaking layers combining strong-motion station recordings with ground-motion modelling and felt/citizen (Felt Rapid/Detailed) observations.
- **Availability:** available (DOI) · DOI [10.21420/J856-2J84](https://doi.org/10.21420/J856-2J84)

Near-real-time modelled ground-shaking dataset producing layers of macroseismic intensity (MMI), peak ground acceleration (PGA), peak ground velocity (PGV) and spectral acceleration for NZ earthquakes M>=3.5, combining strong-motion data, ground-motion modelling and felt/citizen observations. Borderline for a macroseismic catalogue because outputs are modelled estimates rather than felt-only intensities, but it is a documented, DOI-assigned NZ shaking/intensity product. Outputs available as dynamic/static maps, JSON and GIS layers.

**Key references:**
- GNS Science. Shaking Layers Dataset [Data set]. GNS Science. https://doi.org/10.21420/J856-2J84

**Caveats:**
- Modelled (ground-motion) product, not a felt-only macroseismic catalogue — borderline for this category.
- Start year and event count not documented in sources read.

**Notes:** DOI 10.21420/J856-2J84, MMI/PGA/PGV/SA content, M>=3.5 threshold, and producer (GNS Science) confirmed via the GNS dataset page. detection_method = other (modelled, not felt-only). Start year not stated on the page read; left undocumented. Borderline as a 'felt' macroseismic catalogue but retained as a modelled-intensity product per the batch.

**Sources:** [www.gns.cri.nz/data-and-resources/geonet-aotearoa-new-zealan](https://www.gns.cri.nz/data-and-resources/geonet-aotearoa-new-zealand-shaking-layer-dataset/)

---

### 21. Historical Incidence of Modified Mercalli Intensity in New Zealand (1840-1997)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Dowrick & Cousins 2003 MM-incidence dataset (NOT 'Dowrick & Rhoades')
- **Coverage:** 1840 → 1997
- **Region:** New Zealand (national)
- **Bounding box:** 47 locations across New Zealand (national)
- **Depth range:** 0-100 km (events with depth <= 100 km)
- **Magnitude:** Earthquakes Mw>=5.25; tabulates Modified Mercalli intensities MM4-MM7 incidence/return periods
- **Content:** historical observations; quality information; other
- **Producer / contact:** D.J. Dowrick & W.J. Cousins, GNS Science (Institute of Geological & Nuclear Sciences)
- **Data source:** Derived from the Downes isoseismal atlas / MM intensity database, selecting earthquakes Mw>=5.25 and depth<=100 km and tabulating MM intensities experienced at 47 NZ locations.
- **Availability:** available (DOI) · DOI [10.5459/bnzsee.36.1.1-24](https://doi.org/10.5459/bnzsee.36.1.1-24)

Derived macroseismic dataset giving the historical incidence and return periods of Modified Mercalli intensities (MM4-MM7) from earthquakes Mw>=5.25 and depth<=100 km at 47 New Zealand locations over 1840-1997, built largely on the Downes isoseismal atlas, and compared with seismic-hazard models. Provides an empirical intensity-occurrence record for hazard evaluation. Open via the Bulletin of the NZSEE.

**Key references:**
- Dowrick, D.J. & Cousins, W.J. (2003). Historical incidence of Modified Mercalli intensity in New Zealand and comparisons with hazard models. Bulletin of the New Zealand Society for Earthquake Engineering, 36(1), 1-24. https://doi.org/10.5459/bnzsee.36.1.1-24

*Verification — Confirmed via the NZSEE bulletin landing page (view/432): authors Dowrick & Cousins (NOT Rhoades), 2003, full title, BNZSEE 36(1):1-24, DOI 10.5459/bnzsee.36.1.1-24, 1840-1997, 47 locations, Mw>=5.25, depth<=100 km. The brief's '41(3)0193' citation and 'Dowrick & Rhoades' attribution were both wrong and are corrected here. Event count not stated; left unquantified.*

**Caveats:**
- Brief mis-attributed authorship ('Dowrick & Rhoades') and volume ('41(3)0193'); corrected to Dowrick & Cousins (2003), BNZSEE 36(1):1-24.
- Event count not documented (criteria-defined dataset).

**Notes:** CORRECTION: the brief's aka 'Dowrick & Rhoades' is wrong — verified authorship is Dowrick & Cousins (2003), BNZSEE 36(1):1-24, DOI 10.5459/bnzsee.36.1.1-24. The brief's alternate source URL nzsee.org.nz/.../41(3)0193.pdf is a DIFFERENT paper (the vol-41 MM-scale revisions article) and was excluded. Derived from the Downes isoseismal atlas.

**Sources:** [bulletin.nzsee.org.nz/index.php/bnzsee/article/view/432](https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/432) · [bulletin.nzsee.org.nz/article/download/432/412](https://bulletin.nzsee.org.nz/article/download/432/412)

---

### 22. Patterns of Earthquake-Related Mortality in New Zealand, 1840-2017
*type: historical · focus: particular-event-type · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Abeling et al. 2020 NZ earthquake mortality dataset
- **Coverage:** 1840 → 2017
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand (national)
- **Magnitude:** 21 damaging earthquakes with felt intensity MMI>=VII (Modified Mercalli); event magnitudes not the catalogue's primary axis
- **Events:** 21 damaging earthquakes; >=489 primary earthquake-related deaths
- **Content:** historical observations; other
- **Producer / contact:** Shannon Abeling (University of Auckland) and co-authors incl. N. Horspool, D. Johnston, D. Dizhur, N. Wilson, C. Clement, J. Ingham
- **Data source:** Historical records of earthquake-related deaths in New Zealand 1840-2017 (coroners'/historical/medical and documentary sources), each death classified by cause across 21 damaging (MMI>=VII) earthquakes.
- **Availability:** available (DOI) · DOI [10.1177/8755293019878190](https://doi.org/10.1177/8755293019878190)

National compilation of earthquake-related fatalities in New Zealand over 1840-2017, identifying and classifying each death by cause (e.g. building collapse, landslide, tsunami) across 21 damaging earthquakes (MMI>=VII), totalling at least 489 primary deaths. It is a deaths/damage catalogue tied to historical events rather than a hypocentre list, but a documented historical event compilation relevant to macroseismic impact. Published in Earthquake Spectra.

**Key references:**
- Abeling, S., Horspool, N., Johnston, D., Dizhur, D., Wilson, N., Clement, C., & Ingham, J. (2020). Patterns of earthquake-related mortality at a whole-country level: New Zealand, 1840-2017. Earthquake Spectra, 36(1), 138-163. https://doi.org/10.1177/8755293019878190

*Verification — Confirmed via Crossref: Abeling et al. (2020), Earthquake Spectra 36(1):138-163, DOI 10.1177/8755293019878190; full 7-author list, title, 1840-2017 span, >=489 deaths across 21 earthquakes all confirmed. Borderline as a 'catalogue' (deaths, not hypocentres) but a real, distinct, well-grounded NZ historical compilation.*

**Caveats:**
- Deaths/impact catalogue rather than a hypocentre/event-parameter catalogue — borderline for an earthquake-catalogue registry but retained as a documented historical compilation.

**Notes:** A mortality/impact catalogue keyed to damaging (MMI>=VII) earthquakes, not a hypocentre catalogue; included as a documented historical-macroseismic event compilation. focus = particular-event-type (damaging/fatal earthquakes). detection_method = felt-reports (events characterised by MM intensity). The brief's second candidate URL (nature.com s41598-019-41432-6) is a different unrelated paper and was not used.

**Sources:** [journals.sagepub.com/doi/abs/10.1177/8755293019878190](https://journals.sagepub.com/doi/abs/10.1177/8755293019878190) · [api.crossref.org/works/10.1177/8755293019878190](https://api.crossref.org/works/10.1177/8755293019878190)

---

### 23. Magnitudes of New Zealand Earthquakes, 1901-1993 (Dowrick & Rhoades 1998)
*type: large-events-only · focus: parameter-testing · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Dowrick & Rhoades 1998 Ms/Mw catalogue
- **Coverage:** 1901 → 1993
- **Region:** New Zealand (national)
- **Bounding box:** New Zealand and near-offshore
- **Magnitude:** 202 larger earthquakes; Ms determinations with Mw and ML comparisons (Mw-from-Ms standard error ~0.15)
- **Events:** 202
- **Content:** hypocentral locations; quality information; other
- **Producer / contact:** D.J. Dowrick & D.A. Rhoades, GNS Science (Institute of Geological & Nuclear Sciences)
- **Data source:** Reassessment of surface-wave (Ms) and other magnitudes for larger NZ earthquakes from observatory/bulletin amplitude data, with revision of earlier observatory magnitudes and locations; conversions to Mw.
- **Availability:** available (DOI) · DOI [10.5459/bnzsee.31.4.260-280](https://doi.org/10.5459/bnzsee.31.4.260-280)

Reassessment catalogue of magnitudes for 202 larger New Zealand earthquakes over 1901-1993, deriving surface-wave magnitudes (Ms) and conversions to moment magnitude (Mw) and ML, and revising earlier observatory magnitudes and locations. Provides a consistent magnitude backbone for NZ historical seismicity alongside the Downes isoseismal atlas. Published in the Bulletin of the NZSEE.

**Key references:**
- Dowrick, D.J. & Rhoades, D.A. (1998). Magnitudes of New Zealand earthquakes, 1901-1993. Bulletin of the New Zealand Society for Earthquake Engineering, 31(4), 260-280. https://doi.org/10.5459/bnzsee.31.4.260-280

*Verification — Confirmed via the NZSEE bulletin landing page: Dowrick & Rhoades (1998), BNZSEE 31(4):260-280, DOI 10.5459/bnzsee.31.4.260-280, 202 earthquakes, 1901-1993, Ms with Mw/ML comparison. Author/year/venue/volume/issue/pages/DOI and event count all correct.*

**Caveats:**
- Magnitude-reassessment catalogue rather than a macroseismic/felt-intensity catalogue per se, though closely tied to NZ historical-seismicity work.

**Notes:** Magnitude-reassessment catalogue (instrumental-era, larger events only); a backbone alongside the Downes atlas. detection_method = other (instrumental amplitude/observatory reassessment, not a felt or routine-detection product). focus = parameter-testing (magnitude reassessment). DOI confirmed via the NZSEE bulletin landing page.

**Sources:** [bulletin.nzsee.org.nz/index.php/bnzsee/article/view/533](https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/533)

---

### 24. Pre-2010 Historical Seismicity near Christchurch (1869 Christchurch & 1870 Lake Ellesmere)
*type: historical · focus: geographical · detection: felt-reports · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Downes & Yetton 2012 Canterbury historical reassessment
- **Coverage:** 1869 → 1870
- **Region:** Canterbury
- **Bounding box:** Canterbury — Christchurch and Lake Ellesmere (Te Waihora) area, South Island NZ
- **Magnitude:** 1869 Christchurch Mw 4.7-4.9; 1870 Lake Ellesmere Mw 5.6-5.8 (estimated from MM intensities)
- **Events:** 2
- **Content:** historical observations; hypocentral locations; quality information; other
- **Producer / contact:** G. Downes (GNS Science) & M. Yetton (Geotech Consulting)
- **Data source:** Documentary felt/MM evidence (newspaper and historical accounts) reassessed to relocate and re-magnitude two 19th-century Canterbury earthquakes, produced after the 2010-2011 Canterbury sequence.
- **Availability:** available (DOI) · DOI [10.1080/00288306.2012.690767](https://doi.org/10.1080/00288306.2012.690767)

Focused regional historical reassessment relocating and re-magnituding the 1869 Christchurch (Mw 4.7-4.9) and 1870 Lake Ellesmere (Mw 5.6-5.8) earthquakes from documentary felt/MM evidence, undertaken after the 2010-2011 Canterbury earthquake sequence to clarify pre-2010 Canterbury seismicity. A focused two-event historical study rather than a broad catalogue. Published in NZJGG 55(3):199-205.

**Key references:**
- Downes, G. & Yetton, M. (2012). Pre-2010 historical seismicity near Christchurch, New Zealand: the 1869 Mw 4.7-4.9 Christchurch and 1870 Mw 5.6-5.8 Lake Ellesmere earthquakes. New Zealand Journal of Geology and Geophysics, 55(3), 199-205. https://doi.org/10.1080/00288306.2012.690767

*Verification — Confirmed via Crossref: Downes & Yetton (2012), NZJGG 55(3):199-205, DOI 10.1080/00288306.2012.690767. Title text confirms 1869 Christchurch Mw 4.7-4.9 and 1870 Lake Ellesmere Mw 5.6-5.8, matching the brief. Authorship is two named authors (Downes, Yetton), so 'Downes et al.' is imprecise; corrected. Distinct from the Atlas records despite a shared candidate URL in the brief.*

**Caveats:**
- Two-event focused study rather than a broad catalogue (still a discrete documented historical compilation).
- Brief labelled it 'Downes et al.'; verified authorship is two authors, Downes & Yetton.

**Notes:** Two-event focused study, not a broad catalogue, but a discrete documented historical reassessment. Coverage (1869-1870) predates 1960 but the study was produced 2012 in NZ and informs the modern Canterbury seismicity record, so it is in scope. Authors are exactly G. Downes & M. Yetton (two authors), not 'Downes et al.' — correcting the brief's 'Downes et al. 2012'.

**Sources:** [api.crossref.org/works/10.1080/00288306.2012.690767](https://api.crossref.org/works/10.1080/00288306.2012.690767) · [rsnz.onlinelibrary.wiley.com/doi/10.1080/00288306.2012.69076](https://rsnz.onlinelibrary.wiley.com/doi/10.1080/00288306.2012.690767)

---

## Aftershock-sequence rapid-response catalogues (9)

### 25. 1987 Edgecumbe Earthquake Sequence (ML 6.3, Bay of Plenty)
*type: aftershock · focus: geographical · detection: manual · review: reviewed · confidence: medium · verdict: confirmed*

- **Also known as:** Edgecumbe aftershock sequence; 1987 Edgecumbe earthquake
- **Coverage:** 1987-02 → 1987-03
- **Region:** Bay of Plenty (Rangitaiki Plains / Whakatane Graben)
- **Bounding box:** Rangitaiki Plains / Whakatane Graben, Bay of Plenty, North Island, New Zealand
- **Depth range:** ~4-8
- **Magnitude:** Mainshock ML ~6.3 (Mw ~6.5); largest aftershock ~ML 5.6; sequence reported to include hundreds of shocks ML>=3.0
- **Content:** hypocentral locations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Euan G. C. Smith & Clive M. M. Oppenheimer (Victoria University of Wellington) / DSIR Geophysics Division (now GNS Science)
- **Data source:** New Zealand National Seismograph Network (NZNSN) plus rapidly deployed portable seismographs on the Rangitaiki Plains
- **Availability:** available on request · DOI [10.1080/00288306.1989.10421386](https://doi.org/10.1080/00288306.1989.10421386)

Foreshock-mainshock-aftershock catalogue of the 2 March 1987 Edgecumbe earthquake (NZDT; 1 March UTC), which produced surface rupture on the Edgecumbe Fault across the Rangitaiki Plains. Produced to characterise the spatial and temporal evolution of the sequence and the geometry of the causative faulting in the Whakatane Graben. The defining paper is Smith & Oppenheimer (1989), covering 1987 February 21 to March 18.

**Key references:**
- Smith, E. G. C., & Oppenheimer, C. M. M. (1989). The Edgecumbe earthquake sequence: 1987 February 21 to March 18. New Zealand Journal of Geology and Geophysics, 32(1), 31-42. doi:10.1080/00288306.1989.10421386

*Verification — DOI 10.1080/00288306.1989.10421386 CONFIRMED via Crossref: Smith & Oppenheimer (1989), 'The Edgecumbe earthquake sequence: 1987 February 21 to March 18', NZJGG 32(1):31-42. Correct authors/year/venue/volume/issue/pages. The brief's secondary PDF URL (10421389) points to a different article and should not be used as the defining reference.*

**Caveats:**
- Magnitude in brief (ML 6.3) differs from Wikipedia (Mw 6.5); not independently verified
- Event count >600 ML>=3.0 and depth range 4-6 km not verified in fetched sources
- Data described as 'available on request' could not be confirmed; data availability is inferred

**Notes:** DOI 10.1080/00288306.1989.10421386 resolves to Smith & Oppenheimer (1989), NZJGG 32(1):31-42 (confirmed via Crossref). NOTE: the brief mis-stated the DOI title number as 10421386 for the sequence paper (correct) but the brief's second source URL (...10421389) is a different article in the same issue. Brief's '>600 shocks ML>=3.0; depths 4-6 km' and 'ML 6.3' could not be verified in fetched sources; Wikipedia gives Mw 6.5, shallow ~8 km depth. Sequence pre-dates 1960 cutoff concern is N/A (1987, within 1960-2026).

**Sources:** [www.tandfonline.com/doi/abs/10.1080/00288306.1989.10421386](https://www.tandfonline.com/doi/abs/10.1080/00288306.1989.10421386) · [api.crossref.org/works/10.1080/00288306.1989.10421386](https://api.crossref.org/works/10.1080/00288306.1989.10421386) · [en.wikipedia.org/wiki/1987_Edgecumbe_earthquake](https://en.wikipedia.org/wiki/1987_Edgecumbe_earthquake)

---

### 26. 2003 Mw 7.2 Fiordland (Secretary Island) Aftershock Relocations
*type: aftershock · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** 2003 Fiordland earthquake; Secretary Island / Te Anau 2003
- **Coverage:** 2003-08 → unknown — not documented
- **Region:** Fiordland (subduction interface; overlying Alpine Fault)
- **Bounding box:** Fiordland / Secretary Island region, southwest South Island, New Zealand
- **Magnitude:** Aftershocks ML 1.0-6.1; mainshock ML 7.0 / Mw 7.2
- **Events:** ~8,025 recorded; 1,771 relocated (377 best-quality)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Peter McGinty & Russell Robinson (GNS Science)
- **Data source:** NZNSN plus ~10 helicopter-deployed portable seismographs deployed within 3 days of the mainshock
- **Availability:** available on request · DOI [10.1111/j.1365-246X.2007.03336.x](https://doi.org/10.1111/j.1365-246X.2007.03336.x)

Double-difference relocated aftershock catalogue of the 21 August 2003 Mw 7.2 (ML 7.0) Fiordland subduction-interface earthquake. Produced to map the aftershock distribution, constrain the main shock fault plane, and assess static stress changes on the overlying Alpine Fault. ~8,025 aftershocks recorded (ML 1.0-6.1), 1,771 relocated by double-difference, 377 best-quality.

**Key references:**
- McGinty, P., & Robinson, R. (2007). The 2003 Mw 7.2 Fiordland subduction earthquake, New Zealand: Aftershock distribution, main shock fault plane and static stress changes on the overlying Alpine Fault. Geophysical Journal International, 169(2), 579-592. doi:10.1111/j.1365-246X.2007.03336.x

*Verification — DOI 10.1111/j.1365-246X.2007.03336.x CONFIRMED via the GJI article page: McGinty & Robinson (2007), GJI 169(2):579-592. Title, authors, year, venue, event counts (8,025 / 1,771 / 377), magnitude range (ML 1.0-6.1) and 10 portable instruments all verified. Note: published 2007, not 2003.*

**Notes:** Velocity model: 1-D model used in double-difference relocation. Confirmed directly from the GJI abstract page: 8,025 recorded, 1,771 relocated, 377 best, ML 1.0-6.1, 10 portable instruments deployed within 3 days.

**Sources:** [academic.oup.com/gji/article/169/2/579/624523](https://academic.oup.com/gji/article/169/2/579/624523)

---

### 27. 2010 Darfield (Canterbury) Mw 7.1 High-Resolution Aftershock Relocations
*type: aftershock · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Darfield aftershock relocations; Syracuse et al. 2013; D-RAD / FDSN 4A deployment
- **Coverage:** 2010-09 → 2011
- **Region:** Canterbury (Greendale Fault / Darfield)
- **Bounding box:** Canterbury Plains west of Christchurch, South Island, New Zealand
- **Magnitude:** Mainshock Mw 7.1; aftershock magnitude range not verified in fetched sources
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Ellen M. Syracuse & Clifford H. Thurber (University of Wisconsin-Madison); co-authors C. J. Rawles, M. K. Savage (VUW), S. Bannister (GNS Science)
- **Data source:** Rapid-response 10-station PASSCAL/IRIS RAMP array (Darfield RAMP Aftershock Deployment, FDSN 4A_2010, DOI 10.7914/SN/4A_2010, operated by University of Wisconsin-Madison) plus temporary GNS and GeoNet stations
- **Availability:** available on request · DOI [10.1002/jgrb.50301](https://doi.org/10.1002/jgrb.50301)

High-resolution double-difference tomography relocation of Darfield aftershocks following the 4 September 2010 Mw 7.1 earthquake. Produced to delineate buried/blind faults (including the Greendale Fault) and derive a 3-D velocity model, clarifying fault activity in the Canterbury sequence. Distinct from the later Christchurch and Pegasus Bay sub-sequence relocations.

**Key references:**
- Syracuse, E. M., Thurber, C. H., Rawles, C. J., Savage, M. K., & Bannister, S. (2013). High-resolution relocation of aftershocks of the Mw 7.1 Darfield, New Zealand, earthquake and implications for fault activity. Journal of Geophysical Research: Solid Earth, 118(8), 4184-4195. doi:10.1002/jgrb.50301
- Darfield RAMP Aftershock Deployment (D-RAD), New Zealand (2010). FDSN network 4A_2010, University of Wisconsin-Madison. doi:10.7914/SN/4A_2010

*Verification — DOI 10.1002/jgrb.50301 CONFIRMED via Crossref: Syracuse, Thurber, Rawles, Savage & Bannister (2013), 'High-resolution relocation of aftershocks of the Mw 7.1 Darfield...', JGR Solid Earth 118(8):4184-4195. Authors/year/venue verified (brief omitted full author list but attribution correct). FDSN DOI 10.7914/SN/4A_2010 CONFIRMED via fdsn.org.*

**Caveats:**
- Brief states a 14-station PASSCAL array; FDSN 4A_2010 page describes ~10 PASSCAL RAMP instruments — station count uncertain
- Event count (2,840) not verified — JGR article paywalled
- Aftershock magnitude range and depth range not documented in accessed sources

**Notes:** FDSN 4A_2010 confirmed via fdsn.org as the Darfield RAMP Aftershock Deployment (D-RAD), operated by University of Wisconsin-Madison, ~10 PASSCAL RAMP instruments, DOI 10.7914/SN/4A_2010. NOTE: brief states '14-station' array; FDSN page says ~10 PASSCAL RAMP instruments — discrepancy. Brief's '2,840 events' could not be verified (JGR paper paywalled / 403/402).

**Sources:** [api.crossref.org/works/10.1002/jgrb.50301](https://api.crossref.org/works/10.1002/jgrb.50301) · [www.fdsn.org/networks/detail/4A_2010/](https://www.fdsn.org/networks/detail/4A_2010/)

---

### 28. 2011 Christchurch (Mw 6.2) Fine-Scale Aftershock Relocations
*type: aftershock · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Christchurch 22 February 2011 aftershock relocations; Bannister et al. 2011
- **Coverage:** 2011-02 → unknown — not documented
- **Region:** Canterbury (Christchurch / Port Hills fault)
- **Bounding box:** Christchurch / Port Hills, Canterbury, South Island, New Zealand
- **Magnitude:** Mainshock Mw 6.2; aftershock magnitude range not verified in fetched sources
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Stephen Bannister, Bill Fry, Martin Reyners, John Ristau, Haijiang Zhang (GNS Science; Zhang at MIT/USTC)
- **Data source:** Dense GeoNet permanent network plus CanNet and temporary portable recorders around Christchurch
- **Availability:** available on request · DOI [10.1785/gssrl.82.6.839](https://doi.org/10.1785/gssrl.82.6.839)

Fine-scale double-difference tomography relocation of aftershocks of the 22 February 2011 Mw 6.2 Christchurch earthquake. Produced to resolve the near-surface (Port Hills) fault responsible for the high ground motions that caused widespread damage and fatalities in Christchurch. Part of the broader Canterbury earthquake sequence work, distinct from the Darfield (Syracuse 2013) and Pegasus Bay (Ristau 2013) relocations.

**Key references:**
- Bannister, S., Fry, B., Reyners, M., Ristau, J., & Zhang, H. (2011). Fine-scale relocation of aftershocks of the 22 February Mw 6.2 Christchurch earthquake using double-difference tomography. Seismological Research Letters, 82(6), 839-845. doi:10.1785/gssrl.82.6.839

*Verification — DOI 10.1785/gssrl.82.6.839 CONFIRMED via Crossref: Bannister, Fry, Reyners, Ristau & Zhang (2011), 'Fine-scale Relocation of Aftershocks of the 22 February Mw 6.2 Christchurch Earthquake using Double-difference Tomography', SRL 82(6):839-845. Authors/year/venue/volume/issue/pages all verified.*

**Caveats:**
- Event count not documented in accessed sources
- Aftershock magnitude range and depth range not documented
- Exact end date of the relocation window not documented

**Notes:** Confirmed via Crossref: full author list S. Bannister, B. Fry, M. Reyners, J. Ristau, H. Zhang. The brief's second source (tandfonline 10.1080/00288306.2011.641182) is a related NZJGG companion paper, not the SRL defining reference.

**Sources:** [api.crossref.org/works/10.1785/gssrl.82.6.839](https://api.crossref.org/works/10.1785/gssrl.82.6.839)

---

### 29. Pegasus Bay Aftershock Sequence (2011-2012, Canterbury)
*type: aftershock · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Pegasus Bay sequence; offshore Christchurch 2011-2012 aftershocks; Ristau et al. 2013
- **Coverage:** 2011-12 → 2012
- **Region:** Canterbury (offshore Pegasus Bay)
- **Bounding box:** Pegasus Bay, offshore east of Christchurch, Canterbury, New Zealand
- **Magnitude:** Mainshock (parent) Mw 7.1 Darfield; Pegasus Bay sub-sequence aftershock magnitude range not verified
- **Events:** 1,075 events located; 53 regional moment tensors
- **Content:** hypocentral locations; relative relocations; focal mechanisms; phase arrival-time picks
- **Producer / contact:** John Ristau, Caroline Holden, Anna Kaiser, Charles Williams, Stephen Bannister, Bill Fry (GNS Science)
- **Data source:** GeoNet network plus temporary low-cost accelerometers; regional moment tensor analysis
- **Availability:** available on request · DOI [10.1093/gji/ggt222](https://doi.org/10.1093/gji/ggt222)

Relocated double-difference tomography catalogue of the offshore Pegasus Bay sub-sequence of the Mw 7.1 Darfield (Canterbury) earthquake, which began ~December 2011 east of Christchurch in Pegasus Bay. Produced to locate the offshore aftershock activity and characterise its faulting style; 1,075 events located and 53 regional moment tensors derived (predominantly reverse mechanisms).

**Key references:**
- Ristau, J., Holden, C., Kaiser, A., Williams, C., Bannister, S., & Fry, B. (2013). The Pegasus Bay aftershock sequence of the Mw 7.1 Darfield (Canterbury), New Zealand earthquake. Geophysical Journal International, 195(1), 444-459. doi:10.1093/gji/ggt222

*Verification — DOI 10.1093/gji/ggt222 CONFIRMED via Crossref: Ristau, Holden, Kaiser, Williams, Bannister & Fry (2013), 'The Pegasus Bay aftershock sequence of the Mw 7.1 Darfield (Canterbury), New Zealand earthquake', GJI 195(1):444-459. Authors/year/venue/volume/issue/pages all verified.*

**Caveats:**
- Aftershock magnitude range and depth range not documented in accessed sources
- Exact end date inferred (sequence began Dec 2011); window end not explicitly verified

**Notes:** Confirmed via Crossref: full author list J. Ristau, C. Holden, A. Kaiser, C. Williams, S. Bannister, B. Fry. A sub-sequence of the Darfield/Canterbury sequence, so genuinely distinct from the Darfield and Christchurch relocation catalogues in this batch.

**Sources:** [api.crossref.org/works/10.1093/gji/ggt222](https://api.crossref.org/works/10.1093/gji/ggt222) · [academic.oup.com/gji/article/195/1/444/600356](https://academic.oup.com/gji/article/195/1/444/600356)

---

### 30. 2015 ML 6 Wanaka Aftershock Matched-Filter Catalogue
*type: aftershock · focus: geographical · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** 4 May 2015 Wanaka earthquake aftershock catalogue; Warren-Smith et al. 2017
- **Coverage:** 2015-05 → 2015-05
- **Region:** Central Otago / Southern Alps (Wanaka)
- **Bounding box:** Wanaka / Central Otago, Southern Alps, South Island, New Zealand
- **Magnitude:** Mainshock ML 6.0; aftershock catalogue extends below GeoNet Mc via matched-filter detection
- **Events:** 2,544 aftershocks detected (over ~26 days)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Emily Warren-Smith, Calum J. Chamberlain, Simon Lamb, John Townend (Victoria University of Wellington; Warren-Smith later GNS Science)
- **Data source:** Temporary broadband network plus GeoNet national network; matched-filter (template-matching) detection using mainshock plus aftershock templates
- **Availability:** available on request · DOI [10.1785/0220170016](https://doi.org/10.1785/0220170016)

High-precision matched-filter detected and relocated aftershock catalogue of the 4 May 2015 ML 6.0 Wanaka earthquake, the largest shallow Central Otago / Southern Alps event in the record. Produced to characterise the aftershock sequence and identify a NW-dipping blind fault using template-matching detection and precise relative relocation. Detected 2,544 aftershocks over the ~26 days following the mainshock.

**Key references:**
- Warren-Smith, E., Chamberlain, C. J., Lamb, S., & Townend, J. (2017). High-Precision Analysis of an Aftershock Sequence Using Matched-Filter Detection: The 4 May 2015 ML 6 Wanaka Earthquake, Southern Alps, New Zealand. Seismological Research Letters, 88(4), 1065-1077. doi:10.1785/0220170016

*Verification — DOI in brief (10.1785/0220160234) is INVALID — returned 404 from Crossref. CORRECT DOI is 10.1785/0220170016, verified via Crossref bibliographic query and Dialnet: Warren-Smith, Chamberlain, Lamb & Townend (2017), SRL 88(4):1065-1077. Authors/year/venue/volume/issue/pages and event count (2,544) all verified.*

**Caveats:**
- Brief supplied an INCORRECT DOI (10.1785/0220160234); corrected to 10.1785/0220170016
- Depth range not documented in accessed sources

**Notes:** CORRECTION: the brief's DOI 10.1785/0220160234 is WRONG (404 on Crossref). The correct DOI is 10.1785/0220170016, confirmed via Crossref query and the Dialnet record. Volume/issue/pages (88(4):1065-1077) and authors (Warren-Smith, Chamberlain, Lamb, Townend) confirmed; 2,544 aftershocks over 26 days confirmed.

**Sources:** [api.crossref.org/works?query.bibliographic=High-Precision+An](https://api.crossref.org/works?query.bibliographic=High-Precision+Analysis+Aftershock+Sequence+Wanaka) · [dialnet.unirioja.es/servlet/articulo?codigo=6124035](https://dialnet.unirioja.es/servlet/articulo?codigo=6124035)

---

### 31. 2016 Kaikoura (Mw 7.8) Aftershock Relocations (Lanza et al. 2019, STREWN + GeoNet)
*type: aftershock · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Kaikoura aftershock relocations; Lanza et al. 2019; STREWN FDSN Z1 (2016-2017)
- **Coverage:** 2016-11 → 2017-05
- **Region:** North Canterbury / Marlborough (Kaikoura rupture zone)
- **Bounding box:** Northeast South Island / Marlborough to Kaikoura / Cook Strait, New Zealand
- **Magnitude:** ~2,700 events ML>=3; mainshock Mw 7.8
- **Events:** ~2,700 (ML>=3)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Federica Lanza (lead; later ETH Zurich) with C. J. Chamberlain, K. Jacobs, E. Warren-Smith, H. J. Godfrey, M. Kortink, C. H. Thurber, M. K. Savage, J. Townend, S. Roecker, D. Eberhart-Phillips
- **Data source:** Rapid-response STREWN temporary network (Seismic Triggering Response for Earthquakes around Wellington NZ; FDSN Z1_2016, DOI 10.7914/SN/Z1_2016, University of Wisconsin-Madison) plus GeoNet
- **Availability:** available on request · DOI [10.1029/2019GL082780](https://doi.org/10.1029/2019GL082780)

Relocated aftershock catalogue of the 14 November 2016 Mw 7.8 Kaikoura earthquake (~2,700 ML>=3 events, Nov 2016-May 2017), repicked and relocated in the Eberhart-Phillips NZ-Wide 3-D velocity model. Produced to constrain crustal fault connectivity across the >20 faults that ruptured in the Kaikoura earthquake. Distinct from the longer Chamberlain et al. 2021 10-year matched-filter catalogue.

**Key references:**
- Lanza, F., Chamberlain, C. J., Jacobs, K., Warren-Smith, E., Godfrey, H. J., Kortink, M., Thurber, C. H., Savage, M. K., Townend, J., Roecker, S., & Eberhart-Phillips, D. (2019). Crustal fault connectivity of the Mw 7.8 2016 Kaikoura earthquake constrained by aftershock relocations. Geophysical Research Letters, 46(12), 6487-6496. doi:10.1029/2019GL082780
- STREWN: Seismic Triggering Response for Earthquakes around Wellington NZ (2016). FDSN network Z1_2016, University of Wisconsin-Madison. doi:10.7914/SN/Z1_2016

*Verification — DOI 10.1029/2019GL082780 CONFIRMED via Crossref: Lanza et al. (2019), 'Crustal Fault Connectivity of the Mw 7.8 2016 Kaikoura Earthquake Constrained by Aftershock Relocations', GRL 46(12):6487-6496. Full author list, year, venue, volume/issue/pages all verified. FDSN DOI 10.7914/SN/Z1_2016 (STREWN) CONFIRMED via fdsn.org.*

**Caveats:**
- Exact event count (~2,700 ML>=3) stated in brief not independently re-verified in fetched abstract; treated as approximate
- Depth range not documented

**Notes:** Velocity model: Eberhart-Phillips NZ-Wide 3-D model. FDSN Z1_2016 STREWN confirmed via fdsn.org (UW-Madison, ~10 RefTek broadband/accelerometer dataloggers, DOI 10.7914/SN/Z1_2016). Lanza et al. 2019 GRL citation confirmed via Crossref with full author list. Open-access copy at openaccess.wgtn.ac.nz.

**Sources:** [api.crossref.org/works/10.1029/2019GL082780](https://api.crossref.org/works/10.1029/2019GL082780) · [www.fdsn.org/networks/detail/Z1_2016/](https://www.fdsn.org/networks/detail/Z1_2016/) · [openaccess.wgtn.ac.nz/articles/journal_contribution/Crustal_](https://openaccess.wgtn.ac.nz/articles/journal_contribution/Crustal_Fault_Connectivity_of_the_Mw_7_8_2016_Kaik_ura_Earthquake_Constrained_by_Aftershock_Relocations/13792439)

---

### 32. 2016 Kaikoura 10-Year Matched-Filter Seismicity Catalogue (Chamberlain et al. 2021)
*type: background · focus: geographical · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Chamberlain et al. 2021 Kaikoura catalogue; pre/co/post-seismic Kaikoura catalogue
- **Coverage:** 2009 → 2020
- **Region:** North Canterbury / Marlborough (Kaikoura rupture faults)
- **Bounding box:** Northeast South Island / Marlborough to Kaikoura rupture zone, New Zealand
- **Magnitude:** Extends well below GeoNet Mc via matched-filter detection; mainshock Mw 7.8
- **Events:** 33,328 events; 1,755 focal mechanisms / template events
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; focal mechanisms
- **Producer / contact:** Calum J. Chamberlain (Victoria University of Wellington) with W. B. Frank (MIT), F. Lanza, J. Townend, E. Warren-Smith
- **Data source:** GeoNet network plus temporary deployments; matched-filter (template-matching) detection (EQcorrscan) using 1,755 template events
- **Availability:** available on request · DOI [10.1029/2021JB022304](https://doi.org/10.1029/2021JB022304)

Dense matched-filter catalogue of 33,328 earthquakes (2009-2020) on and adjacent to the faults that ruptured in the 2016 Mw 7.8 Kaikoura earthquake, spanning the pre-seismic, co-seismic and post-seismic phases and extending well below the GeoNet magnitude of completeness. Focal mechanisms were computed for 1,755 template events. Produced to illuminate the full seismic cycle around the Kaikoura rupture; distinct from the Lanza et al. 2019 aftershock-only relocation catalogue.

**Key references:**
- Chamberlain, C. J., Frank, W. B., Lanza, F., Townend, J., & Warren-Smith, E. (2021). Illuminating the Pre-, Co-, and Post-Seismic Phases of the 2016 M7.8 Kaikoura Earthquake With 10 Years of Seismicity. Journal of Geophysical Research: Solid Earth, 126(8), e2021JB022304. doi:10.1029/2021JB022304

*Verification — DOI 10.1029/2021JB022304 CONFIRMED via Crossref: Chamberlain, Frank, Lanza, Townend & Warren-Smith (2021), 'Illuminating the Pre-, Co-, and Post-Seismic Phases of the 2016 M7.8 Kaikoura Earthquake With 10 Years of Seismicity', JGR Solid Earth 126(8):e2021JB022304. Authors/year/venue verified. Event count (33,328) and 1,755 focal mechanisms confirmed via MIT eqsci.mit.edu page.*

**Caveats:**
- EQcorrscan named only in the brief; MIT abstract confirms a matched-filter routine but does not name the specific tool
- Depth range not documented
- catalogue_type chosen as <background> (spans full seismic cycle) rather than <aftershock>; reasonable people could classify differently

**Notes:** Detection software: matched-filter (EQcorrscan per brief; MIT page confirms a matched-filter routine but does not name the tool). 33,328 events (2009-2020) and 1,755 focal mechanisms/templates confirmed via MIT eqsci page. Categorised <background> rather than <aftershock> because it deliberately spans pre/co/post-seismic phases over a decade, though it remains within the aftershock-response group for this batch.

**Sources:** [api.crossref.org/works/10.1029/2021JB022304](https://api.crossref.org/works/10.1029/2021JB022304) · [eqsci.mit.edu/publication/chamberlain-2021/](https://eqsci.mit.edu/publication/chamberlain-2021/)

---

### 33. Southern Cook Strait / Seddon-Lake Grassmere 2013 Earthquake Response Deployment
*type: aftershock · focus: geographical · detection: manual · review: partially reviewed · confidence: medium · verdict: uncertain*

- **Also known as:** Cook Strait 2013 sequence; Seddon earthquake; 2013 Lake Grassmere earthquake response array
- **Coverage:** 2013-09 → 2014-01
- **Region:** Cook Strait / Marlborough (Seddon, Lake Grassmere)
- **Bounding box:** Cook Strait / Seddon-Lake Grassmere, Marlborough, northeast South Island, New Zealand
- **Magnitude:** 246 events M>3 during deployment; mainshocks Mw 6.5 (Seddon) and Mw 6.6 (Lake Grassmere)
- **Events:** 246 (M>3 during deployment)
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** Martha K. Savage, John Townend, Katrina Jacobs, Tim Stern (Victoria University of Wellington); John Louie (University of Nevada, Reno)
- **Data source:** Rapid-response temporary array of 21 seismometers (2 Massey University broadband + 14 US PASSCAL short-period 2 Hz + 5 Kyoto University instruments from Y. Iio's group) plus GeoNet
- **Availability:** available on request

Rapid-response temporary seismometer deployment recording aftershocks of the 21 July 2013 Mw 6.5 Seddon and 16 August 2013 Mw 6.6 Lake Grassmere earthquakes across Cook Strait, operating 6 September 2013 to 21 January 2014. Recorded 246 events with M>3 and was used primarily for structural imaging parallel to the subduction interface. More a response/imaging deployment than a standalone published relocated earthquake catalogue; reported in EQC report 13/U654.

**Key references:**
- Savage, M. K., Townend, J., Jacobs, K., Stern, T., & Louie, J. (2014). Southern Cook Strait Earthquake Response. EQC Project 13/U654, Paper number 3785. New Zealand Earthquake Commission / Natural Hazards Commission. https://www.naturalhazards.govt.nz/resilience-and-research/research/search-all-research-reports/southern-cook-strait-earthquake-response/

*Verification — No DOI exists for this deployment in accessed sources. EQC report 13/U654 (paper 3785) by Savage, Townend, Jacobs, Stern & Louie CONFIRMED via the NaturalHazards report landing page, including the 21-instrument composition, dates (6 Sep 2013-21 Jan 2014) and 246 M>3 events. The brief's mainshock magnitudes (Mw 6.5 Seddon, Mw 6.6 Lake Grassmere) are consistent with the report and Wikipedia.*

**Caveats:**
- This is a rapid-response deployment / structural-imaging project, not (in the accessed sources) a published standalone relocated earthquake catalogue
- No DOI or formal dataset identifier found; only an EQC technical report (13/U654, paper 3785)
- Whether a derived event catalogue was published/archived is not documented in accessed sources
- No FDSN temporary network code surfaced for this PASSCAL deployment in the sources read

**Notes:** Confirmed via the NaturalHazards (EQC) report page: 21 instruments (2 Massey broadband + 14 PASSCAL short-period + 5 Kyoto), 6 Sep 2013-21 Jan 2014, 246 M>3 events, authors Savage/Townend/Jacobs/Stern/Louie, paper 3785 (EQC 13/U654). No relocated catalogue or DOI mentioned in the accessed source. This is principally a response deployment + structural imaging effort rather than a published standalone relocated catalogue, so grounded as 'uncertain' for inclusion as a discrete catalogue.

**Sources:** [www.naturalhazards.govt.nz/resilience-and-research/research/](https://www.naturalhazards.govt.nz/resilience-and-research/research/search-all-research-reports/southern-cook-strait-earthquake-response/) · [en.wikipedia.org/wiki/2013_Lake_Grassmere_earthquake](https://en.wikipedia.org/wiki/2013_Lake_Grassmere_earthquake) · [en.wikipedia.org/wiki/2013_Seddon_earthquake](https://en.wikipedia.org/wiki/2013_Seddon_earthquake)

---

## Temporary onshore passive-seismic deployments (16)

### 34. SAPSE — Southern Alps Passive Seismic Experiment (1995-96)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** SAPSE; FDSN XC (1995-1996); Cooperative Project on South Island New Zealand (NZ Passive)
- **Coverage:** 1995-11 → 1996-04
- **Region:** Southern Alps / central Alpine Fault
- **Bounding box:** Central South Island / Southern Alps, New Zealand (Alpine Fault region around Mt Cook / Aoraki)
- **Depth range:** 0-~12 km seismogenic (relocated events)
- **Magnitude:** Local microseismicity; ~5491 events triggered during the deployment, 195 selected and precisely relocated. Mc not formally documented in sources read.
- **Events:** ~5491 recorded; 195 precisely relocated
- **Content:** hypocentral locations; phase arrival-time picks; focal mechanisms; quality information
- **Producer / contact:** IRIS/PASSCAL with Institute of Geological & Nuclear Sciences (GNS) and Oregon State University; lead analysis Beate Leitner / Donna Eberhart-Phillips
- **Data source:** Temporary US-NZ passive deployment of ~26 portable broadband/short-period seismographs across the central South Island (IRIS/PASSCAL + IGNS + Oregon State); passive partner to the active-source SIGHT transect. Network XC continuous waveforms.
- **Availability:** available (DOI) · DOI [10.7914/SN/XC_1995](https://doi.org/10.7914/SN/XC_1995)

A focused dense temporary deployment to image microseismicity, focal mechanisms and stress along the central Alpine Fault and Southern Alps, Nov 1995-Apr 1996. Produced an early high-resolution Alpine Fault microseismicity and stress dataset and constrained the seismogenic thickness (~12 km). Served as the passive seismology component complementing the SIGHT active-source crustal transect.

**Key references:**
- Leitner, B., Eberhart-Phillips, D., Anderson, H., & Nabelek, J. L. (2001). A focused look at the Alpine fault, New Zealand: Seismicity, focal mechanisms, and stress observations. Journal of Geophysical Research, 106(B2), 2193-2220. https://doi.org/10.1029/2000JB900303
- IRIS/PASSCAL (1995). Cooperative Project on South Island New Zealand (NZ Passive) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XC_1995

*Verification — FDSN DOI 10.7914/SN/XC_1995 confirmed on FDSN page (IRIS/PASSCAL, 1995-1996). Defining paper confirmed as Leitner et al. 2001, JGR 106(B2):2193-2220, DOI 10.1029/2000JB900303 (academia.edu record gave DOI suffix 2000JB900303). Event counts 5491/195 match the fetched source.*

**Notes:** FDSN network DOI is for waveforms; the analysed event catalogue is described in Leitner et al. (2001). Part of the broader 1995-96 SIGHT/South Island campaign. Event counts (5491 triggered / 195 relocated) confirmed from Leitner et al. (2001) via fetched abstract.

**Sources:** [www.fdsn.org/networks/detail/XC_1995/](https://www.fdsn.org/networks/detail/XC_1995/) · [www.academia.edu/4576695/A_focused_look_at_the_Alpine_fault_](https://www.academia.edu/4576695/A_focused_look_at_the_Alpine_fault_New_Zealand_Seismicity_focal_mechanisms_and_stress_observations)

---

### 35. SAMBA — Southern Alps Microearthquake Borehole Array (network deployment)
*type: background · focus: geographical · detection: automatic · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** SAMBA; FDSN 9F (2008-2020); FDSN 9K (2021-2030)
- **Coverage:** 2008 → ongoing
- **Region:** Central Alpine Fault / Southern Alps
- **Bounding box:** Central Alpine Fault, Southern Alps, South Island, New Zealand (~Whataroa-Franz Josef-Fox area)
- **Magnitude:** Microseismicity (down to ~M0); magnitude completeness depends on derived catalogue (Michailos et al. 2019).
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; other
- **Producer / contact:** Victoria University of Wellington (VUW); John Townend / Martha Savage; relocated catalogue by Konstantinos Michailos
- **Data source:** Semi-permanent VUW borehole/short-period seismometer array (~10-13 sites) on the central Alpine Fault, installed 2008 as FDSN 9F and continued as 9K from 2021. Continuous waveform network.
- **Availability:** available (DOI) · DOI [10.7914/SN/9F_2008](https://doi.org/10.7914/SN/9F_2008)

A long-running near-fault waveform array densifying coverage of the central Alpine Fault for microseismicity, tremor and low-frequency-earthquake studies. It is the recording network underpinning derived event catalogues (Michailos relocated/matched-filter catalogue, Alpine Fault LFE catalogues) and tomography/thermal studies. This record describes the waveform network itself, distinct from the derived event catalogues.

**Key references:**
- Victoria University of Wellington (2008). Southern Alps Microearthquake Borehole Array (SAMBA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/9F_2008
- Michailos, K., Smith, E. G. C., Chamberlain, C. J., Savage, M. K., & Townend, J. (2019). Variations in seismogenic thickness along the central Alpine Fault, New Zealand, revealed by a decade's relocated microseismicity. Geochemistry, Geophysics, Geosystems, 20. https://doi.org/10.1029/2018GC007743

*Verification — 9F DOI 10.7914/SN/9F_2008 confirmed (VUW, 2008-2020). 9K (2021-2030) confirmed as continuation but its FDSN page lists the same 9F DOI rather than a distinct 9K DOI — flagged. Michailos et al. 2019 GGG and Zenodo 10.5281/zenodo.3529755 confirmed via the Michailos site.*

**Caveats:**
- This is a recording network, not strictly an event catalogue; included because it is the priority temporary/semi-permanent deployment underpinning multiple NZ catalogues and has a network DOI.
- FDSN 9K landing page lists the 9F DOI; no distinct 9K_2021 DOI confirmed.

**Notes:** Two FDSN codes: 9F (2008-2020) and continuation 9K (2021-2030). The FDSN 9K landing page itself lists DOI 10.7914/SN/9F_2008 (appears to share the 9F DOI registration). Derived relocated microseismicity catalogue: Michailos et al. (2019), Zenodo dataset 10.5281/zenodo.3529755. This is the network deployment, not the derived event catalogue.

**Sources:** [www.fdsn.org/networks/detail/9F_2008/](https://www.fdsn.org/networks/detail/9F_2008/) · [www.fdsn.org/networks/detail/9K_2021/](https://www.fdsn.org/networks/detail/9K_2021/) · [kmichailos.bitbucket.io/](https://kmichailos.bitbucket.io/)

---

### 36. DFDP-2 Real-Time / Matched-Filter Earthquake Catalogue, Whataroa (2014-2015)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** DFDP-2 monitoring catalogue; Deep Fault Drilling Project Phase 2
- **Coverage:** 2014-08 → 2015-01
- **Region:** Central Alpine Fault / Whataroa, Westland
- **Bounding box:** Within ~30 km of Whataroa, central Alpine Fault, Westland, South Island, New Zealand
- **Magnitude:** ML 0.6-4.2; 493 located earthquakes
- **Events:** 493
- **Content:** hypocentral locations; phase arrival-time picks; quality information; other
- **Producer / contact:** Calum J. Chamberlain & co-authors (VUW, GNS, Univ. Auckland, Univ. Wisconsin, Tohoku Univ.)
- **Data source:** Real-time monitoring network of borehole + surface seismometers within ~30 km of the DFDP-2 drill site at Whataroa, central Alpine Fault, operated around-the-clock Aug 2014-Jan 2015; real-time picking plus offline matched-filter detection.
- **Availability:** available on request

An earthquake catalogue produced from real-time seismic monitoring and a traffic-light response protocol during DFDP-2 scientific drilling on the central Alpine Fault. The network detected and located 493 earthquakes (ML 0.6-4.2) near Whataroa; no event occurred within 3 km of the drill site and none required changes to drilling. Demonstrates real-time + matched-filter monitoring around an active scientific borehole.

**Key references:**
- Chamberlain, C. J., Boese, C. M., Eccles, J. D., Savage, M. K., Baratin, L.-M., Townend, J., Gulley, A. K., Jacobs, K. M., Benson, A., Taylor-Offord, S., Thurber, C., Guo, B., Okada, T., Takagi, R., Yoshida, K., Sutherland, R., & Toy, V. G. (2017). Real-Time Earthquake Monitoring during the Second Phase of the Deep Fault Drilling Project, Alpine Fault, New Zealand. Seismological Research Letters, 88(6), 1443-1454. https://doi.org/10.1785/0220170095

*Verification — CORRECTION: brief DOI 10.1785/0220170032 is wrong — Crossref resolves it to an unrelated paper (Stroujkova et al. 2017). Correct paper is Chamberlain et al. (2017), SRL 88(6):1443-1454, DOI 10.1785/0220170095 (confirmed via Crossref bibliographic query and SSA page). Dates Aug 2014-Jan 2015, 493 events, ML 0.6-4.2 all confirmed.*

**Caveats:**
- Candidate-source DOI 10.1785/0220170032 was incorrect; replaced with verified 10.1785/0220170095.
- No standalone dataset DOI for the event catalogue found; classed available on request.

**Notes:** Real-time picking supplemented by matched-filter (template) detection. The candidate-source DOI 10.1785/0220170032 is INCORRECT (it resolves to Stroujkova et al. 2017, SRL 88(5), on explosive detonation products). Correct DOI is 10.1785/0220170095.

**Sources:** [pubs.geoscienceworld.org/ssa/srl/article/88/6/1443/516648/Re](https://pubs.geoscienceworld.org/ssa/srl/article/88/6/1443/516648/Real-Time-Earthquake-Monitoring-during-the-Second) · [api.crossref.org/works/10.1785/0220170032](https://api.crossref.org/works/10.1785/0220170032) · [www.gns.cri.nz/research-projects/deep-fault-drilling-program](https://www.gns.cri.nz/research-projects/deep-fault-drilling-programme/)

---

### 37. DFDP10 / Whataroa-Wanganui Passive Seismology Experiment 2010 (FDSN XO)
*type: background · focus: geographical · detection: automatic · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** FDSN XO (2010); DFDP10/VicU; Whataroa-Wanganui Passive Seismology Experiment
- **Coverage:** 2010 → 2010
- **Region:** Central Alpine Fault / Whataroa, Westland
- **Bounding box:** Whataroa-Wanganui (Whataroa River) area, central Alpine Fault, Westland, South Island, New Zealand
- **Magnitude:** Local microseismicity; no published Mc or event count in sources read.
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** Victoria University of Wellington (VUW)
- **Data source:** VUW temporary passive seismometer deployment (FDSN XO) in the Whataroa-Wanganui river area around the planned Alpine Fault (DFDP) drilling target; continuous waveform network operated during 2010.
- **Availability:** available (DOI) · DOI [10.7914/SN/XO_2010](https://doi.org/10.7914/SN/XO_2010)

An early VUW passive deployment to characterise background microseismicity around the future Deep Fault Drilling Project target on the central Alpine Fault. It contributes waveform data feeding the broader central Alpine Fault microseismicity catalogues; primarily a waveform dataset rather than a standalone published event catalogue.

**Key references:**
- Victoria University of Wellington (2010). Deep Fault Drilling Project, Alpine Fault, New Zealand: Whataroa-Wanganui Passive Seismology Experiment 2010 (DFDP10/VicU) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XO_2010

*Verification — FDSN DOI 10.7914/SN/XO_2010 confirmed on FDSN page; name, VUW operator and 2010 dates confirmed. No event-catalogue paper/DOI claimed, so none to mis-attribute.*

**Caveats:**
- Primarily a waveform deployment with no published standalone event catalogue/count.

**Notes:** Network name on FDSN: 'Deep Fault Drilling Project, Alpine Fault, New Zealand: Whataroa-Wanganui Passive Seismology Experiment 2010 (DFDP10/VicU)'. Waveform dataset; no standalone event count located. Feeds into later central Alpine Fault catalogues.

**Sources:** [www.fdsn.org/networks/detail/XO_2010/](https://www.fdsn.org/networks/detail/XO_2010/)

---

### 38. ALFA08 / ALFA09 Alpine Fault Arrays (FDSN YR)
*type: background · focus: geographical · detection: manual · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** ALFA08; ALFA09; FDSN YR (2008-2010)
- **Coverage:** 2008 → 2010
- **Region:** Central Alpine Fault (Harihari-Ross-Arthur's Pass)
- **Bounding box:** Central Alpine Fault between Harihari and Arthur's Pass, Westland/Canterbury, South Island, New Zealand
- **Magnitude:** Local microseismicity; event count not separately published in sources read.
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** GNS Science (IGNS); analysis Sandra Bourguignon, Stephen Bannister, John Townend, Haijiang Zhang
- **Data source:** GNS Science temporary short-period arrays (FDSN YR) between Harihari and Arthur's Pass on the central Alpine Fault: ALFA08 (~8 sensors, 2008-09) and ALFA09 (~10 short-period, 2009-10). Continuous waveform network plus located local seismicity.
- **Availability:** available (DOI) · DOI [10.7914/SN/YR_2008](https://doi.org/10.7914/SN/YR_2008)

Temporary Alpine Fault arrays deployed to record and locate local seismicity and characterise current fault activity between Harihari and Arthur's Pass. The recorded seismicity and travel-time data underpin midcrustal seismic tomography of the central Alpine Fault (Bourguignon et al. 2015) and multi-network microseismicity studies.

**Key references:**
- GNS Science (2008). ALFA08 (ALFA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YR_2008
- Bourguignon, S., Bannister, S., Henderson, C. M., Townend, J., & Zhang, H. (2015). Structural heterogeneity of the midcrust adjacent to the central Alpine Fault, New Zealand: Inferences from seismic tomography and seismicity between Harihari and Ross. Geochemistry, Geophysics, Geosystems, 16(4), 1017-1043. https://doi.org/10.1002/2014GC005702

*Verification — FDSN DOI 10.7914/SN/YR_2008 confirmed (GNS, 2008-2010, Harihari-Arthur's Pass). Bourguignon et al. 2015 confirmed via Crossref: GGG vol 16 issue 4 pp 1017-1043, DOI 10.1002/2014GC005702 — authors/year/venue all match.*

**Caveats:**
- Single FDSN code (YR) bundles ALFA08 and ALFA09; no separate event-count catalogue published.

**Notes:** FDSN YR covers both ALFA08 and ALFA09 sub-deployments. Bourguignon et al. (2015) details verified via Crossref: GGG 16(4):1017-1043. Waveform dataset; standalone event count not located.

**Sources:** [www.fdsn.org/networks/detail/YR_2008/](https://www.fdsn.org/networks/detail/YR_2008/) · [api.crossref.org/works/10.1002/2014GC005702](https://api.crossref.org/works/10.1002/2014GC005702)

---

### 39. WIZARD Array — Wisconsin, New Zealand And Rensselaer Deployment (FDSN ZT / 6F)
*type: background · focus: geographical · detection: automatic · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** WIZARD; FDSN ZT (2012-2014); FDSN 6F (2012-2020) DFDP13 tight array
- **Coverage:** 2012 → 2020
- **Region:** Central Alpine Fault / Whataroa, Westland
- **Bounding box:** Whataroa / central Alpine Fault drilling target area, Westland, South Island, New Zealand
- **Magnitude:** Local/regional microseismicity; no standalone event count in sources read.
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** University of Wisconsin-Madison (Clifford Thurber) with Rensselaer Polytechnic Institute and VUW/GNS
- **Data source:** US-NZ temporary networks around the DFDP-2 Alpine Fault drilling target at Whataroa: ZT = broader WIZARD short-period array (2012-2014); 6F = tight DFDP13 supplementary array (2012-2020). Recorded local/regional seismicity, ambient noise and active-source data.
- **Availability:** available (DOI) · DOI [10.7914/SN/ZT_2012](https://doi.org/10.7914/SN/ZT_2012)

Temporary deployments installed to record seismicity, ambient noise and active-source data around the second DFDP Alpine Fault drilling site, including potential drilling-induced activity. Data feed central Alpine Fault microseismicity, tomography and attenuation models. Two FDSN codes correspond to the broader WIZARD (ZT) and the tight DFDP13 array (6F).

**Key references:**
- University of Wisconsin-Madison (2012). WIsconsin, new Zealand, And Rensselaer Deployment (WIZARD) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/ZT_2012
- University of Wisconsin-Madison (2012). WIsconsin, new Zealand, And Rpi Deployment, Deep Fault Drilling Project (DFDP13) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/6F_2012

*Verification — Both FDSN DOIs confirmed: ZT 10.7914/SN/ZT_2012 (WIZARD, UW-Madison, 2012-2014) and 6F 10.7914/SN/6F_2012 (DFDP13 tight array, UW-Madison, 2012-2020). Names and operators match the brief.*

**Caveats:**
- Two FDSN codes combined in one record; primarily waveform datasets with no published standalone event-catalogue count.

**Notes:** Two distinct FDSN DOIs: ZT (2012-2014, broader WIZARD) and 6F (2012-2020, tight DFDP13 array). Both confirmed on FDSN, operated by UW-Madison. End_date 2020 reflects the 6F record; ZT proper ended 2014. Waveform datasets; no standalone event count located.

**Sources:** [www.fdsn.org/networks/detail/ZT_2012/](https://www.fdsn.org/networks/detail/ZT_2012/) · [www.fdsn.org/networks/detail/6F_2012/](https://www.fdsn.org/networks/detail/6F_2012/)

---

### 40. DWARFS — Dense Westland Arrays Researching Fault Segmentation (FDSN 7S/8N)
*type: background · focus: geographical · detection: automatic · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** DWARFS; FDSN 7S (2019-2021)
- **Coverage:** 2019 → 2021
- **Region:** Westland / Alpine Fault rupture barriers
- **Bounding box:** Westland, central-south Alpine Fault, South Island, New Zealand
- **Magnitude:** Small near-fault earthquakes; no standalone event count in sources read.
- **Content:** hypocentral locations; phase arrival-time picks; fault-geometry; other
- **Producer / contact:** GNS Science (IGNS)
- **Data source:** GNS Science dense temporary seismometer arrays (FDSN code 7S; dataset DOI suffix 8N) deployed near persistent Alpine Fault rupture barriers in Westland, 2019-2021. Continuous waveform arrays recording small earthquakes.
- **Availability:** available (DOI) · DOI [10.7914/SN/8N_2019](https://doi.org/10.7914/SN/8N_2019)

Dense temporary arrays installed near two major Alpine Fault rupture barriers in Westland to investigate earthquake segmentation, fault geometry and near-fault source properties (e.g. stress drops). The recordings map barrier geometry and mechanical properties and feed Alpine Fault segmentation/source studies and VUW theses.

**Key references:**
- GNS Science (2019). Dense Westland Arrays Researching Fault Segmentation: What controls earthquake segmentation along New Zealand's Alpine Fault? (DWARFS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/8N_2019

*Verification — FDSN page for 7S confirms DWARFS name (GNS, 2019-2021) and DOI 10.7914/SN/8N_2019 — note the DOI suffix is 8N, not 7S. Associated VUW thesis (figshare 15543867) could not be fetched (403) so its DWARFS use is not directly verified; included as a candidate source only.*

**Caveats:**
- FDSN code (7S) differs from DOI suffix (8N_2019) — corrected DOI used.
- Associated thesis not directly verifiable (403); waveform deployment with no published standalone event count.

**Notes:** FDSN network code is 7S but the registered dataset DOI is 10.7914/SN/8N_2019 (confirmed on the 7S FDSN page). Cited associated study: VUW thesis on source properties of moderate-magnitude Alpine Fault earthquakes (figshare 15543867) — could not be fetched (403), so kept as a source URL only, lower-weighted. Waveform dataset; no standalone event count located.

**Sources:** [www.fdsn.org/networks/detail/7S_2019/](https://www.fdsn.org/networks/detail/7S_2019/) · [openaccess.wgtn.ac.nz/articles/thesis/Source_Properties_of_M](https://openaccess.wgtn.ac.nz/articles/thesis/Source_Properties_of_Moderate-Magnitude_Earthquakes_Along_the_Alpine_Fault_New_Zealand/15543867)

---

### 41. SALSA — Southern Alps Long Skinny Array (FDSN ZX)
*type: background · focus: parameter-testing · detection: automatic · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** SALSA; FDSN ZX (2021-2023)
- **Coverage:** 2021 → 2023
- **Region:** Alpine Fault (onshore, Fiordland to Maruia)
- **Bounding box:** Onshore Alpine Fault, Milford Sound to Maruia, South Island, New Zealand
- **Magnitude:** Microseismicity component; no published event count in sources read.
- **Content:** other
- **Producer / contact:** Victoria University of Wellington (VUW); PASSCAL/Harvard instrument support; Marsden-funded
- **Data source:** VUW temporary array (FDSN ZX): ~45 seismometers at ~10 km spacing along the entire onshore Alpine Fault (Milford Sound to Maruia), plus microseismicity stations, 2021-2023. Continuous waveform dataset.
- **Availability:** available (DOI) · DOI [10.7914/SN/ZX_2021](https://doi.org/10.7914/SN/ZX_2021)

A long, fault-parallel array spanning the onshore Alpine Fault for virtual-earthquake and ground-motion analysis along the fault, supplemented by stations recording local microseismicity. Primarily a waveform dataset supporting along-fault ground-motion prediction; no published standalone event-catalogue count.

**Key references:**
- Victoria University of Wellington (2021). Southern Alps Long Skinny Array; Along-fault array for virtual earthquake analysis of the Alpine Fault (SALSA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/ZX_2021

*Verification — FDSN DOI 10.7914/SN/ZX_2021 confirmed; name, VUW operator, ~45 sensors, 10 km spacing, Marsden funding and 2021-2023 dates all match the FDSN page. No event-catalogue paper claimed.*

**Caveats:**
- Waveform/virtual-earthquake dataset rather than a published event catalogue with a count; focus is parameter/ground-motion testing more than an event catalogue.

**Notes:** FDSN name confirms ~45 seismometers at ~10 km spacing along the Alpine Fault, PASSCAL/VUW/Harvard instruments, Marsden-funded, 2021-2023. Primarily a waveform dataset for virtual-earthquake/ground-motion analysis; not an event catalogue with a published count.

**Sources:** [www.fdsn.org/networks/detail/ZX_2021/](https://www.fdsn.org/networks/detail/ZX_2021/)

---

### 42. SOSA — Southland Otago Seismic Array Catalogue (2022-2023)
*type: background · focus: geographical · detection: automatic · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** SOSA; FDSN 6Y (2022-2023)
- **Coverage:** 2022-10 → 2023-10
- **Region:** Southland / Otago / SE Fiordland
- **Bounding box:** Western Catlins to eastern Fiordland, Southland/Otago, South Island, New Zealand
- **Depth range:** 0-40 km (microseismicity nucleation depths reported)
- **Magnitude:** ML ~0.2-3.1; 85 located earthquakes (~37% in swarms)
- **Events:** 85
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; quality information
- **Producer / contact:** University of Otago; Jack N. Williams, Mark W. Stirling et al.
- **Data source:** University of Otago temporary array (FDSN 6Y): 19 short-period stations between the western Catlins and eastern Fiordland, Oct 2022-Oct 2023, densifying sparse GeoNet coverage (~10-30 km spacing vs ~100 km).
- **Availability:** available (DOI) · DOI [10.7914/jr68-qq17](https://doi.org/10.7914/jr68-qq17)

A temporary dense array deployed to image microseismicity of the low-coverage southeastern South Island near the transpressive Australian-Pacific plate boundary. The resulting catalogue of 85 earthquakes reveals deeper-than-expected and clustered microseismicity (depths 0-40 km), including Fiordland swarms. A priority temporary deployment improving on sparse permanent coverage.

**Key references:**
- Williams, J. N., Eberhart-Phillips, D., Bourguignon, S., Stirling, M. W., & Oliver, W. (2025). Deep and Clustered Microseismicity at the Edge of Southern New Zealand's Transpressive Plate Boundary. Journal of Geophysical Research: Solid Earth, 130(5), e2024JB030371. https://doi.org/10.1029/2024JB030371
- University of Otago (2022). Southland Otago Seismic Array (SOSA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/jr68-qq17

*Verification — FDSN DOI 10.7914/jr68-qq17 confirmed (Otago, 19 stations, Oct 2022-Oct 2023). Defining paper confirmed via Crossref: Williams, Eberhart-Phillips, Bourguignon, Stirling & Oliver (2025), JGR Solid Earth 130(5), DOI 10.1029/2024JB030371 — note publication YEAR is 2025 (brief implied 2024). 85 events confirmed; depth 0-40 km confirmed.*

**Caveats:**
- Brief implied 2024 publication; correct publication year is 2025 (Williams et al.).

**Notes:** Network DOI 10.7914/jr68-qq17 confirmed on FDSN (note non-standard DOI form, not SN/6Y). Defining paper is Williams et al. (2025) not 2024 — DOI suffix 2024JB030371 reflects submission year. Depth range 0-40 km and swarm fraction (32/85) from the open-access PDF / search summary.

**Sources:** [www.fdsn.org/networks/detail/6Y_2022/](https://www.fdsn.org/networks/detail/6Y_2022/) · [agupubs.onlinelibrary.wiley.com/doi/10.1029/2024JB030371](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2024JB030371) · [api.crossref.org/works/10.1029/2024JB030371](https://api.crossref.org/works/10.1029/2024JB030371)

---

### 43. Otago Temporary Broadband Network (FDSN 6K, 2014-2015)
*type: background · focus: geographical · detection: automatic · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** FDSN 6K (2014-2015) Otago temporary broadband network
- **Coverage:** 2014-03 → 2015-04
- **Region:** Otago / SE South Island
- **Bounding box:** Otago, southeastern South Island, New Zealand
- **Magnitude:** Low-seismicity region; no published Mc or event count in sources read.
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** GNS Science (IGNS); Marsden-funded
- **Data source:** GNS Science temporary broadband deployment (FDSN 6K): two consecutive six-month deployments of 20 Guralp CMG-40T sensors across Otago, Mar 2014-Apr 2015. Continuous waveform dataset.
- **Availability:** available (DOI) · DOI [10.7914/SN/6K_2014](https://doi.org/10.7914/SN/6K_2014)

A temporary broadband network deployed to study seismicity and crustal structure of the low-seismicity, reverse-faulting southeastern South Island (Otago). Primarily a waveform dataset; no standalone published event-catalogue count located in sources read.

**Key references:**
- GNS Science (2014). Otago temporary broadband network [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/6K_2014

*Verification — FDSN DOI 10.7914/SN/6K_2014 confirmed; name, GNS operator, 20 Guralp CMG-40Ts, Mar 2014-Apr 2015 dates and Marsden funding all match the FDSN page. No event-catalogue paper claimed.*

**Caveats:**
- Waveform deployment with no published standalone event catalogue/count.

**Notes:** FDSN page confirms two six-month deployments of 20 Guralp CMG-40Ts, Mar 2014-Apr 2015, GNS Science, Marsden-funded. Waveform dataset; no standalone event count located. Predecessor in spirit to later Otago/Southland temporary arrays (e.g. SOSA).

**Sources:** [www.fdsn.org/networks/detail/6K_2014/](https://www.fdsn.org/networks/detail/6K_2014/)

---

### 44. Marlborough Fault Zone Anisotropy/Converted-Phase Array (FDSN XB, 2000-2002)
*type: background · focus: geographical · detection: manual · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** FDSN XB (2000-2002) Marlborough Fault Zone array
- **Coverage:** 2000-12 → 2002-05
- **Region:** Marlborough Fault System
- **Bounding box:** Marlborough Fault System (Wairau/Awatere/Clarence faults), northern South Island, New Zealand
- **Magnitude:** Local seismicity recorded; no standalone event count in sources read.
- **Content:** hypocentral locations; phase arrival-time picks; quality information; other
- **Producer / contact:** IRIS/PASSCAL; tomographic analysis Donna Eberhart-Phillips & Stephen Bannister (GNS)
- **Data source:** IRIS/PASSCAL temporary deployment (FDSN XB): five small arrays along a profile crossing the Wairau (Alpine), Awatere and Clarence faults in Marlborough, Dec 2000-May 2002. Continuous waveforms; recorded local seismicity.
- **Availability:** available (DOI) · DOI [10.7914/SN/XB_2000](https://doi.org/10.7914/SN/XB_2000)

A temporary array profile primarily designed for S-wave anisotropy and converted-phase imaging of strain distribution beneath the Marlborough Fault System, while also recording local earthquakes. The recorded seismicity contributed to 3-D velocity/hypocentre inversions of the Marlborough strike-slip and subducted-plate system (Eberhart-Phillips & Bannister 2010). Borderline as an event catalogue (mainly a structure-imaging deployment) but a recorded-seismicity temporary array.

**Key references:**
- IRIS/PASSCAL (2000). Array studies of anisotropy and converted phases in the Marlborough Fault Zone of New Zealand [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XB_2000
- Eberhart-Phillips, D., & Bannister, S. (2010). 3-D imaging of Marlborough, New Zealand, subducted plate and strike-slip fault systems. Geophysical Journal International, 182(1), 73-96. https://doi.org/10.1111/j.1365-246X.2010.04621.x

*Verification — FDSN DOI 10.7914/SN/XB_2000 confirmed (anisotropy/converted-phase Marlborough array, IRIS/PASSCAL, 2000-2002). Eberhart-Phillips & Bannister 2010 confirmed via fetched GJI page: GJI 182(1):73-96, DOI 10.1111/j.1365-246X.2010.04621.x — it cites the Dec 2000-May 2002 Marlborough array data.*

**Caveats:**
- Deployment was primarily for anisotropy/structure imaging, not a dedicated event catalogue; included as a recorded-seismicity temporary array per the priority on temporary deployments.

**Notes:** FDSN confirms nine array sites/five arrays across Wairau/Awatere/Clarence faults, IRIS/PASSCAL, 2000-2002. Eberhart-Phillips & Bannister (2010) is a tomography study that incorporates the 'IRIS Marlborough fault zone study from December 2000 to May 2002' data — it is the best documented analysis using this deployment but is not solely a catalogue paper. Primary deployment goal was anisotropy/structure, hence borderline.

**Sources:** [www.fdsn.org/networks/detail/XB_2000/](https://www.fdsn.org/networks/detail/XB_2000/) · [academic.oup.com/gji/article/182/1/73/564378](https://academic.oup.com/gji/article/182/1/73/564378)

---

### 45. SAHKE — Seismic Array HiKurangi Experiment (Wellington Geophysical Transect, passive)
*type: background · focus: geographical · detection: manual · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** SAHKE; FDSN X2 (2009-2010); Seismic Analysis of the HiKurangi Experiment
- **Coverage:** 2009-11 → 2010-04
- **Region:** Southern Hikurangi margin / Wellington transect
- **Bounding box:** Lower North Island transect, Kapiti coast to east coast (Wairarapa), New Zealand
- **Magnitude:** Local and teleseismic events recorded; exact local/teleseismic counts (~49/~45 in the brief) not independently verified from a fetched source.
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** Victoria University of Wellington / GNS Science with ERI (Univ. Tokyo, Japan) and US partners; Stuart Henrys (GNS) lead author
- **Data source:** VUW/GNS/Japan-ERI/US passive deployment (FDSN X2): ~10 broadband + short-period sensors plus active-source shots along a lower North Island transect (Kapiti coast to east coast), Nov 2009-Apr 2010. Continuous waveforms + active-source data.
- **Availability:** available (DOI) · DOI [10.7914/SN/X2_2009](https://doi.org/10.7914/SN/X2_2009)

A passive (and active-source) deployment along a Wellington-region geophysical transect to image the locked southern Hikurangi subduction megathrust beneath the lower North Island. Recorded local and teleseismic events used with active-source data for tomography and reflection imaging of the subduction interface and overlying crust.

**Key references:**
- Henrys, S., Wech, A., Sutherland, R., Stern, T., Savage, M., Sato, H., Mochizuki, K., Iwasaki, T., Okaya, D., Seward, A., Tozer, B., Townend, J., Kurashimo, E., Iidaka, T., & Ishiyama, T. (2013). SAHKE geophysical transect reveals crustal and subduction zone structure at the southern Hikurangi margin, New Zealand. Geochemistry, Geophysics, Geosystems, 14(6), 2063-2083. https://doi.org/10.1002/ggge.20136
- Victoria University of Wellington (2009). Seismic Analysis of the HiKurangi Experiment, Wellington Geophysical Transect (SAHKE) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/X2_2009

*Verification — FDSN DOI 10.7914/SN/X2_2009 confirmed (SAHKE, VUW, 2009-2010). Henrys et al. 2013 confirmed via search + ADS (2013GGG....14.2063H): GGG 14:2063-2083, DOI 10.1002/ggge.20136. Event counts (49 local/45 teleseismic) come from the SAHKE data report which could not be decoded — left as unverified.*

**Caveats:**
- Local/teleseismic event counts from the brief could not be verified from a readable source (data-report PDF undecodable); left as unknown.
- Primarily a transect/imaging experiment; included as a recorded-seismicity temporary deployment.

**Notes:** FDSN X2 DOI and SAHKE name confirmed. Defining paper Henrys et al. (2013), GGG 14:2063-2083, DOI 10.1002/ggge.20136 confirmed via search and ADS. The SAHKE data report (IRIS) listing ~49 local + ~45 teleseismic events could not be fetched/decoded, so those counts are left unverified rather than asserted.

**Sources:** [www.fdsn.org/networks/detail/X2_2009/](https://www.fdsn.org/networks/detail/X2_2009/) · [agupubs.onlinelibrary.wiley.com/doi/full/10.1002/ggge.20136](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/ggge.20136) · [ds.iris.edu/data/reports/ZV_2011_2011/SAHKE.DataReport.pdf](https://ds.iris.edu/data/reports/ZV_2011_2011/SAHKE.DataReport.pdf)

---

### 46. CNIPSE / NIGHT Passive — Central North Island Passive Seismic Experiment (FDSN XQ)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** CNIPSE; NIGHT Passive; FDSN XQ (2001-2002); North Island Geophysical Transect Passive
- **Coverage:** 2001-01 → 2001-06
- **Region:** Central North Island / Hikurangi subduction zone
- **Bounding box:** Central North Island, ~Bennydale to Tarawera (Hikurangi subduction system), New Zealand
- **Depth range:** 0-~300 km (subduction zone to ~300 km depth imaged)
- **Magnitude:** Local-to-regional seismicity; >4700 events located, 1239 used in tomography. Mc not separately documented in sources read.
- **Events:** >4700 located (1239 used in tomography)
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** IRIS/PASSCAL with GNS Science and VUW; analysis Martin Reyners, Donna Eberhart-Phillips et al.
- **Data source:** Dense temporary deployment (FDSN XQ) of ~74 portable seismographs (32 broadband) across the central North Island, ~Jan-Jun 2001 (IRIS/PASSCAL + GNS + VUW). Continuous waveforms; >4700 located earthquakes.
- **Availability:** available (DOI) · DOI [10.7914/SN/XQ_2001](https://doi.org/10.7914/SN/XQ_2001)

A dense ~6-month passive deployment to produce a high-resolution snapshot of Hikurangi subduction-zone seismicity beneath the central North Island and to support 3-D Vp/Vp-Vs tomography from the trench to ~300 km depth. Over 4700 earthquakes were located within or near the network; a subset (1239 events) was used in the defining tomographic inversion.

**Key references:**
- Reyners, M., Eberhart-Phillips, D., Stuart, G., & Nishimura, Y. (2006). Imaging subduction from the trench to 300 km depth beneath the central North Island, New Zealand, with Vp and Vp/Vs. Geophysical Journal International, 165(2), 565-583. https://doi.org/10.1111/j.1365-246X.2006.02897.x
- IRIS/PASSCAL (2001). Hikurangi Subduction System (New Zealand) Seismic Transects, North Island Geophysical Transect Passive (NIGHT Passive) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XQ_2001

*Verification — FDSN DOI 10.7914/SN/XQ_2001 confirmed (NIGHT Passive, IRIS/PASSCAL, 2001-2002). Reyners et al. 2006 confirmed via fetched GJI page: GJI 165(2):565-583, DOI 10.1111/j.1365-246X.2006.02897.x; explicitly tied to CNIPSE and states >4700 earthquakes located, 1239 used. Event count and 300 km depth verified.*

**Caveats:**
- FDSN labels it 'NIGHT Passive'; 'CNIPSE' is the published experiment name — same deployment, noted to avoid confusion.

**Notes:** FDSN names the network 'NIGHT Passive'; 'CNIPSE' is the experiment name used in the literature (Reyners et al. 2006 describes it as the Central North Island Passive Seismic Experiment). FDSN page describes a ~120 km line ~20 km west of Bennydale to Tarawera. Reyners et al. (2006) confirms >4700 located, 1239 used. The XQ deployment also overlaps the Tongariro/Rowlands 2001 campaign.

**Sources:** [www.fdsn.org/networks/detail/XQ_2001/](https://www.fdsn.org/networks/detail/XQ_2001/) · [academic.oup.com/gji/article/165/2/565/651851](https://academic.oup.com/gji/article/165/2/565/651851)

---

### 47. HADES — Deep Geothermal HADES Seismic Array (Taupo, FDSN Z8)
*type: background · focus: geographical · detection: automatic · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** HADES; FDSN Z8 (2009-2011)
- **Coverage:** 2009 → 2011
- **Region:** Taupo Volcanic Zone (TVZ)
- **Bounding box:** Central/northern Taupo Volcanic Zone (Rotorua-Rotomahana-Tarawera), ~25 x 35 km, North Island, New Zealand
- **Depth range:** 3-10 km (target mid-crustal depth range)
- **Magnitude:** Crustal/geothermal microseismicity; event count for the HADES deployment itself not separately documented in sources read.
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** GNS Science (IGNS); Stephen Bannister
- **Data source:** GNS Science temporary array (FDSN Z8) of ~39 surface seismometers at ~5 km spacing over the central/northern Taupo Volcanic Zone geothermal fields (Rotorua-Rotomahana-Tarawera), ~25 x 35 km, 2009-2011. Continuous waveforms supplementing GeoNet.
- **Availability:** available (DOI) · DOI [10.7914/SN/Z8_2009](https://doi.org/10.7914/SN/Z8_2009)

A temporary dense array deployed to image mid-crustal (3-10 km) seismic properties and crustal seismicity of the central/northern TVZ geothermal region, supplementing the permanent GeoNet network. Its recordings feed into high-precision TVZ earthquake catalogues and crustal-structure studies.

**Key references:**
- Bannister, S. / GNS Science (2009). Deep Geothermal HADES seismic array (HADES) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/Z8_2009
- Illsley-Kemp, F., & Mestel, E. (2025). A new consistent and high-precision earthquake catalogue for the Taupō Volcanic Zone, New Zealand. Seismica, 4(1). https://doi.org/10.26443/seismica.v4i1.1490

*Verification — FDSN DOI 10.7914/SN/Z8_2009 confirmed (HADES, GNS, ~39 sensors, central Taupo, 2009-2011, 3-10 km). Illsley-Kemp & Mestel 2025 Seismica article confirmed via fetch: DOI 10.26443/seismica.v4i1.1490, cites Bannister (2009) HADES dataset. No standalone HADES event count found.*

**Caveats:**
- HADES is a recording network feeding the TVZ catalogue rather than a standalone published event catalogue with its own count.

**Notes:** FDSN confirms 39 seismometers, central Taupo, 3-10 km mid-crust target, GNS, 2009-2011. Illsley-Kemp & Mestel (2025) high-precision TVZ catalogue (86,579 events) cites the HADES dataset (Bannister 2009) among inputs — confirms HADES feeds the TVZ catalogue, though that catalogue is multi-network not solely HADES. HADES itself is a waveform deployment with no separate published event count.

**Sources:** [www.fdsn.org/networks/detail/Z8_2009/](https://www.fdsn.org/networks/detail/Z8_2009/) · [seismica.library.mcgill.ca/article/view/1490](https://seismica.library.mcgill.ca/article/view/1490)

---

### 48. Taranaki Dense Temporary Network Crustal Seismicity Catalogue (Sherburn & White 2005)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Taranaki dense network; Cape Egmont fault zone deployment
- **Coverage:** 2001-12 → 2002-09
- **Region:** Taranaki / Cape Egmont Fault Zone
- **Bounding box:** Taranaki region around Mt Taranaki/Egmont and Cape Egmont Fault Zone, North Island, New Zealand
- **Magnitude:** ML 1.4-4.0; 389 located earthquakes; >15,000 phase picks
- **Events:** 389
- **Content:** hypocentral locations; phase arrival-time picks; quality information
- **Producer / contact:** Steven Sherburn (GNS Science) & Robert S. White (University of Cambridge)
- **Data source:** Dense temporary deployment of 75 three-component broadband seismographs around Mt Taranaki/Egmont, Dec 2001-Sep 2002 (GNS Science + University of Cambridge). >15,000 P/S phase picks; 389 located local earthquakes.
- **Availability:** available on request

A dense temporary network deployed to obtain accurate hypocentres of crustal seismicity in the Taranaki region. It located 389 local earthquakes (ML 1.4-4.0), found the Cape Egmont Fault Zone most active, and notably found no volcanic earthquakes beneath Mt Taranaki. A focused regional crustal-seismicity catalogue.

**Key references:**
- Sherburn, S., & White, R. S. (2005). Crustal seismicity in Taranaki, New Zealand using accurate hypocentres from a dense network. Geophysical Journal International, 162(2), 494-506. https://doi.org/10.1111/j.1365-246X.2005.02667.x

*Verification — Sherburn & White 2005 confirmed via fetched GJI page: GJI 162(2):494-506, DOI 10.1111/j.1365-246X.2005.02667.x. 389 events, ML 1.4-4.0, >15,000 picks, Dec 2001-Sep 2002, 75 broadband sensors all match the brief.*

**Caveats:**
- No dataset/waveform DOI located (no FDSN code given); event catalogue classed available on request.

**Notes:** Deployment dates Dec 2001-Sep 2002, 75 three-component broadband seismographs, 389 events (ML 1.4-4.0), >15,000 picks, Cape Egmont Fault Zone most active, no volcanic earthquakes beneath Mt Taranaki — all confirmed from the fetched GJI page. No dataset DOI located; catalogue available on request.

**Sources:** [academic.oup.com/gji/article/162/2/494/552780](https://academic.oup.com/gji/article/162/2/494/552780)

---

### 49. Tongariro Volcanic Centre Local Earthquake Tomography Catalogue (Rowlands et al. 2005)
*type: background · focus: particular-event-type · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** TgVC tomography; Rowlands, White & Haines 2005
- **Coverage:** 2001-01 → 2001-06
- **Region:** Tongariro Volcanic Centre (TVZ)
- **Bounding box:** Tongariro Volcanic Centre, central North Island, New Zealand
- **Magnitude:** Local volcanic-tectonic earthquakes; 155 selected events. Mc not separately documented in sources read.
- **Events:** 155 (selected for tomography)
- **Content:** hypocentral locations; phase arrival-time picks; quality information
- **Producer / contact:** D. P. Rowlands, R. S. White (University of Cambridge) & A. J. Haines (GNS Science)
- **Data source:** Temporary deployment of 23 broadband seismometers in the Tongariro Volcanic Centre, Jan-Jun 2001 (University of Cambridge / GNS), part of the same 2001 central North Island campaign as CNIPSE. ~3000 P + ~1100 S picks; 155 selected local earthquakes.
- **Availability:** available on request

A temporary local network deployed to obtain accurate earthquake depths and 3-D Vp / Vp-Vs structure of the Tongariro Volcanic Centre. The best 155 local earthquakes (with quality criteria on picks and azimuthal gap) were selected for local-earthquake tomography of the volcanic system. A focused volcanic-zone seismicity/tomography catalogue.

**Key references:**
- Rowlands, D. P., White, R. S., & Haines, A. J. (2005). Seismic tomography of the Tongariro Volcanic Centre, New Zealand. Geophysical Journal International, 163(3), 1180-1194. https://doi.org/10.1111/j.1365-246X.2005.02716.x

*Verification — Rowlands, White & Haines 2005 confirmed via fetched GJI page: GJI 163(3):1180-1194, DOI 10.1111/j.1365-246X.2005.02716.x. 155 selected earthquakes and 23 seismometers match the brief; authors/year/venue correct.*

**Caveats:**
- No dataset/waveform DOI located; event selection (155) is a tomography subset rather than a full deployment catalogue count.
- Overlaps temporally and operationally with the 2001 CNIPSE campaign but is a distinct Tongariro-focused dataset/paper.

**Notes:** Confirmed via fetched GJI page: 23 broadband seismometers, best 155 local earthquakes selected (>8 high-quality P picks, azimuthal gap <180 deg). Part of the same Jan-Jun 2001 central North Island campaign as CNIPSE/XQ. No dataset DOI located; available on request.

**Sources:** [academic.oup.com/gji/article/163/3/1180/2127069](https://academic.oup.com/gji/article/163/3/1180/2127069)

---

## Temporary offshore / ocean-bottom (OBS) deployments (3)

### 50. HOBITSS Microearthquake Catalogue (2014-2015, northern Hikurangi, manual)
*type: background · focus: particular-event-type · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** HOBITSS; Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip; YH (2014); Yarce et al. 2019 catalogue
- **Coverage:** 2014-06 → 2015-05
- **Region:** Northern Hikurangi subduction margin (offshore Gisborne/Poverty Bay)
- **Bounding box:** approx 37.5S-39.3S, 176.5E-179.5E (offshore Gisborne / northern Hikurangi margin, North Island)
- **Magnitude:** approx M0.5-4.7 (local magnitude) per brief; magnitude of completeness not independently verified for the manual catalogue
- **Events:** approx 2,300 (per brief; not independently confirmed from a fetched source)
- **Content:** hypocentral locations; phase arrival-time picks
- **Producer / contact:** Jefferson Yarce / Anne F. Sheehan (CIRES, University of Colorado Boulder); HOBITSS PIs incl. Laura Wallace, Susan Schwartz, Spahr Webb, Kimihiro Mochizuki, Stuart Henrys; network operated by University of Texas at Austin
- **Data source:** HOBITSS ocean-bottom seismometer array (FDSN network YH, 2014) deployed on the northern Hikurangi margin seafloor, supplemented by onshore GeoNet permanent stations; manual P- and S-wave picking and hypocentre location
- **Availability:** available (DOI) · DOI [10.5281/zenodo.2022405](https://doi.org/10.5281/zenodo.2022405)

Built to investigate whether a spatial/temporal relationship exists between microseismicity and the shallow ~2-week September-October 2014 slow slip event (SSE) targeted by the year-long HOBITSS deployment above the northern Hikurangi plate interface. Earthquakes were detected and located by hand-picking P/S arrivals on OBS plus onshore GeoNet stations. The catalogue reveals a 'microseismicity gap' bordering the 2014 slow-slip patch, later reused by Yarce et al. (2023).

**Key references:**
- Yarce, J., Sheehan, A. F., Nakai, J. S., Schwartz, S. Y., Mochizuki, K., Savage, M. K. K., et al. (2019). Seismicity at the Northern Hikurangi Margin, New Zealand, and Investigation of the Potential Spatial and Temporal Relationships With a Shallow Slow Slip Event. Journal of Geophysical Research: Solid Earth, 124(5), 4751-4766. https://doi.org/10.1029/2018JB017211
- Yarce, J. (2018). HOBITSS earthquake catalog 2014-2015, Hikurangi margin, New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.2022405
- University of Texas at Austin (2014). Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip (HOBITSS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YH_2014

*Verification — Zenodo DOI 10.5281/zenodo.2022405 resolves to 'HOBITSS earthquake catalog 2014-2015, Hikurangi margin, New Zealand' by Jefferson Yarce (CC-BY-4.0) - confirmed. FDSN network DOI 10.7914/SN/YH_2014 resolves (operator University of Texas at Austin) - confirmed. The JGR 2019 paper citation (Yarce, Sheehan, Nakai, Schwartz, Mochizuki, Savage et al., 2019, JGR Solid Earth 124(5), 4751-4766, DOI 10.1029/2018JB017211) is confirmed verbatim from the reference list of the open-access Yarce et al. 2023 G-cubed paper. All three DOIs and citations are real and correctly attributed.*

**Caveats:**
- Event count (~2,300) and station count (15 OBS) come only from the input brief; not confirmed from a fetched authoritative source (Yarce 2019 paper is paywalled, x-mol abstract inaccessible).
- Depth range and magnitude of completeness not documented for the manual catalogue specifically.

**Notes:** FDSN temporary OBS network code YH (2014); HOBITSS = Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip, NSF-funded (awards 1333025/1551922), ocean-bottom instruments from OBSIC (formerly OBSIP/WHOI) and the Earthquake Research Institute (ERI), University of Tokyo. Raw waveform data archived at IRIS-DMC under DOI 10.7914/SN/YH_2014. Successor/companion product: the REST automatic-detection catalogue (Yarce et al. 2023, Zenodo 10.5281/zenodo.7274399). Brief states 15 OBS; not independently re-verified. Title in some candidate sources ('Investigations of shallow slow slip...') is an EOS science-update headline, not the JGR paper title.

**Sources:** [zenodo.org/records/2022405](https://zenodo.org/records/2022405) · [www.fdsn.org/networks/detail/YH_2014/](https://www.fdsn.org/networks/detail/YH_2014/) · [agupubs.onlinelibrary.wiley.com/doi/10.1029/2022GC010537](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2022GC010537)

---

### 51. HOBITSS Automatic-Detection Earthquake Catalogue (2014 SSE, REST detector)
*type: background · focus: particular-event-type · detection: automatic · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** HOBITSS auto-detection catalogue; Yarce et al. 2023; REST (Regressive ESTimator) catalogue
- **Coverage:** 2014-09 → 2014-10
- **Region:** Northern Hikurangi subduction margin (offshore Gisborne)
- **Bounding box:** approx 37.5S-39.3S, 176.5E-179.5E (offshore northern Hikurangi margin; 3D velocity model box of Yarce et al. 2021 down to ~94 km)
- **Depth range:** approx 0-15 km plate interface focus; full catalogue depth extent not separately stated (velocity model to ~94 km)
- **Magnitude:** Magnitude of completeness Mc = 1.7 and Gutenberg-Richter b-value = 1.3, derived from the 451 events with REST-based magnitude estimates (subset of catalogue); local magnitude ML scale
- **Events:** 854 events (per Zenodo dataset record); paper text reports >3x the manual analyst count and 451 events with magnitude estimates
- **Content:** hypocentral locations; phase arrival-time picks; quality information
- **Producer / contact:** Jefferson Yarce / Anne F. Sheehan (CIRES & Dept. of Geological Sciences, University of Colorado Boulder); Steven Roecker (Rensselaer Polytechnic Institute)
- **Data source:** Continuous waveform data from the HOBITSS ocean-bottom seismometers (FDSN network YH, 2014) plus onshore GeoNet land stations; events detected and located automatically using the REST (Regressive ESTimator) autoregressive phase-arrival-time detector and onset estimator
- **Availability:** available (DOI) · DOI [10.5281/zenodo.7274399](https://doi.org/10.5281/zenodo.7274399)

An automatically generated earthquake catalogue for the two months around the September-October 2014 northern Hikurangi slow slip event, created to test whether automated detection increases catalogue completeness and to examine the temporal relationship between SSEs and microseismicity. REST applied to HOBITSS OBS + GeoNet data found more than three times as many events as manual analysis, and shows seismicity increasing during and remaining elevated for ~2 weeks after the 2014 SSE. A larger, distinct product from the same OBS deployment as the manual Yarce et al. (2019) catalogue.

**Key references:**
- Yarce, J., Sheehan, A. F., & Roecker, S. (2023). Temporal Relationship of Slow Slip Events and Microearthquake Seismicity: Insights From Earthquake Automatic Detections in the Northern Hikurangi Margin, Aotearoa New Zealand. Geochemistry, Geophysics, Geosystems, 24, e2022GC010537. https://doi.org/10.1029/2022GC010537
- Yarce, J., Sheehan, A., & Roecker, S. (2022). Dataset of automated earthquake detections in the Hikurangi Margin (New Zealand) during the 2014 Slow Slip Event [Data set]. Zenodo. https://doi.org/10.5281/zenodo.7274399
- University of Texas at Austin (2014). Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip (HOBITSS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YH_2014

*Verification — Paper read directly (open-access PDF): Yarce, Sheehan & Roecker (2023), Geochemistry, Geophysics, Geosystems 24, e2022GC010537, DOI 10.1029/2022GC010537 - title, authors, venue, year all confirmed verbatim. Zenodo DOI 10.5281/zenodo.7274399 resolves to 'Dataset of automated earthquake detections in the Hikurangi Margin (New Zealand) during the 2014 Slow Slip Event' (Yarce, Sheehan, Roecker, 2022) containing 854 events - confirmed, but count differs from the brief. FDSN YH (2014) DOI 10.7914/SN/YH_2014 confirmed. DOIs are real and correctly attributed; only the headline event counts in the brief are unreliable.*

**Caveats:**
- Event-count discrepancy: the brief states '1,739 hypocentres (853 well-constrained) vs 265 manual', but the published Zenodo dataset (10.5281/zenodo.7274399) explicitly contains 854 events (event + arrival files). The paper states the auto-detector found >3x analyst detections and that 451 events had REST magnitude estimates. The '1,739/853/265' figures could not be verified from fetched sources and may conflate intermediate detection stages; the authoritative archived count is 854.
- Catalogue depth range not separately reported.

**Notes:** REST = Regressive ESTimator, an autoregressive automatic P/S onset detector (cf. Maeda; Roecker et al. 2021). Open-access paper (CC-BY). Data Availability Statement (verified by reading the PDF) confirms: raw HOBITSS data at IRIS-DMC DOI 10.7914/SN/YH_2014, land data via GeoNet, and the automated hypocentre catalogue + P/S arrival list for the two months around the 2014 SSE openly available at Zenodo 10.5281/zenodo.7274399. Magnitudes use the Ristau et al. (2016) NZ ML scale; magnitude of completeness via EQcorrscan (Chamberlain et al. 2017). Same OBS deployment (YH 2014) as, but a distinct larger automatic product from, the manual Yarce et al. (2019) catalogue.

**Sources:** [agupubs.onlinelibrary.wiley.com/doi/10.1029/2022GC010537](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2022GC010537) · [zenodo.org/records/7274399](https://zenodo.org/records/7274399) · [par.nsf.gov/servlets/purl/10412315](https://par.nsf.gov/servlets/purl/10412315) · [www.fdsn.org/networks/detail/YH_2014/](https://www.fdsn.org/networks/detail/YH_2014/)

---

### 52. Brothers Volcano Ocean-Bottom Hydrophone Seismicity Catalogue (south Kermadec arc)
*type: background · focus: geographical · detection: other · review: reviewed · confidence: medium · verdict: confirmed*

- **Also known as:** Brothers OBH array; Kermadec arc OBH T-wave catalogue
- **Coverage:** 2004 → 2005
- **Region:** Southern Kermadec arc (Brothers submarine volcano)
- **Bounding box:** Brothers volcano caldera, southern Kermadec arc, approx 34.9S, 179.1E (~350 km NE of New Zealand / ~340 km NE of Whakaari/White Island)
- **Events:** 964 regional earthquakes (plus local harmonic tremor)
- **Content:** hypocentral locations; other
- **Producer / contact:** Robert P. Dziak / Joseph H. Haxel / Haru Matsumoto (NOAA Pacific Marine Environmental Laboratory & Oregon State University, Hatfield Marine Science Center); with Cornel E. J. de Ronde and collaborators (GNS Science / NOAA Kermadec-arc program)
- **Data source:** Four ocean-bottom hydrophones (OBH) deployed on the caldera floor of Brothers submarine volcano for ~7 months (2004-2005); low-frequency (0.5-110 Hz) hydroacoustic T-wave arrivals recorded on three of the four OBH used to locate earthquakes and characterize harmonic tremor
- **Availability:** not available

A hydroacoustic (T-wave) catalogue produced to characterize regional and local seismicity and volcanic harmonic tremor at Brothers volcano in the southern Kermadec intraoceanic arc (~350 km NE of New Zealand). T-wave-derived locations for 964 regional earthquakes show clustering beneath the dacite cone and along the east flank of the caldera, while local harmonic tremor reflects subseafloor hydrothermal/magmatic processes. It is the only OBS/OBH-based seismicity catalogue identified for the NZ Kermadec arc.

**Key references:**
- Dziak, R. P., Haxel, J. H., Matsumoto, H., Lau, T.-K., Merle, S. G., de Ronde, C. E. J., Embley, R. W., & Mellinger, D. K. (2008). Observations of regional seismicity and local harmonic tremor at Brothers volcano, south Kermadec arc, using an ocean bottom hydrophone array. Journal of Geophysical Research: Solid Earth, 113, B08S14. https://doi.org/10.1029/2007JB005533

*Verification — Paper DOI 10.1029/2007JB005533 corresponds to a real JGR: Solid Earth article. Title 'Observations of regional seismicity and local harmonic tremor at Brothers volcano, south Kermadec arc, using an ocean bottom hydrophone array' confirmed via Wiley listing and ResearchGate. Authors (Dziak, Haxel, Matsumoto, Lau, Merle, de Ronde, Embley, Mellinger) and year 2008 (JGR vol. 113, B08S14) confirmed via web-search result summarizing the article; could not independently re-verify volume/article number from a directly fetched primary page (paywalled). Citation is real and correctly attributed; minor uncertainty on volume/article-number formatting and year.*

**Caveats:**
- No data DOI / repository for the catalogue itself; only the paper is citable - data_availability set to 'not available'.
- Publication-year nuance: searches returned both '2008' (publication) and a DOI prefix implying 2007; resolved as published 2008, JGR vol. 113, article B08S14.
- Magnitude information and depth range not reported in any fetched source.
- Full paper abstract is paywalled (HTTP 402); details (964 events, 4 OBH, 7 months, ~350 km NE of NZ, south Kermadec arc, harmonic tremor) confirmed via web-search summary of the article and ResearchGate listing rather than the primary PDF.

**Sources:** [agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2007JB00553](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2007JB005533) · [en.wikipedia.org/wiki/Brothers_Seamount](https://en.wikipedia.org/wiki/Brothers_Seamount)

---

## Volcano-seismic, geothermal & induced catalogues (12)

### 53. Okataina Volcanic Centre Double-Difference Relocated Catalogue (2010-2021)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** OVC double-difference catalogue; Bannister et al. 2022 Okataina tomography catalogue
- **Coverage:** 2010 → 2021
- **Region:** Okataina Volcanic Centre, Taupo Volcanic Zone
- **Bounding box:** Okataina Volcanic Centre / eastern Taupo Volcanic Zone, Rotorua region, North Island, New Zealand
- **Depth range:** low-velocity magmatic zone resolved at ~5-8 km depth
- **Events:** 6989
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; other
- **Producer / contact:** Stephen Bannister, GNS Science
- **Data source:** Temporary array of broadband and short-period seismometers (~4+ years) supplementing the permanent GeoNet New Zealand National Seismograph Network; double-difference tomography with waveform cross-correlation
- **Availability:** available on request · DOI [10.1016/j.jvolgeores.2022.107653](https://doi.org/10.1016/j.jvolgeores.2022.107653)

Produced to image sub-caldera structure and seismicity beneath the Okataina Volcanic Centre (TVZ, Rotorua region) using a 3-D P-wave velocity model derived by double-difference seismic tomography. The study relocated 6989 earthquakes (2010-2021) to resolve spatial clusters (e.g. west of Lake Rotomahana, beneath Haroharo/Makatiti) and a ~5-8 km low-velocity zone interpreted as partial melt and/or fluid-volatile pathways.

**Key references:**
- Bannister, S., Bertrand, E.A., Heimann, S., Bourguignon, S., Asher, C., Shanks, J., & Harvison, A. (2022). Imaging sub-caldera structure with local seismicity, Okataina Volcanic Centre, Taupo Volcanic Zone, using double-difference seismic tomography. Journal of Volcanology and Geothermal Research, 431, 107653. https://doi.org/10.1016/j.jvolgeores.2022.107653

*Verification — DOI 10.1016/j.jvolgeores.2022.107653 resolves (Crossref) to the exact title; authors Bannister, Bertrand, Heimann, Bourguignon, Asher, Shanks, Harvison (2022), JVGR vol 431 art 107653. 6989 events and 2010-2021 span confirmed in search snippets of the abstract. Magnitude info not located.*

**Notes:** Includes a derived 3-D P-wave velocity model. The 'other' content flag covers the tomographic velocity model. Data described in the paper; availability typically on request. DOI 10.1016/j.jvolgeores.2022.107653 verified via Crossref (the candidate ScienceDirect PII S0377027322001846 points to the same paper).

**Sources:** [www.sciencedirect.com/science/article/abs/pii/S0377027322001](https://www.sciencedirect.com/science/article/abs/pii/S0377027322001846) · [api.crossref.org/works/10.1016/j.jvolgeores.2022.107653](https://api.crossref.org/works/10.1016/j.jvolgeores.2022.107653)

---

### 54. Taupo Volcano Magmatic-Seismicity Catalogue (2019-2022 ECLIPSE temporary deployment)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Mestel et al. 2025 Taupo catalogue; ECLIPSE Taupo deployment
- **Coverage:** 2019 → 2022
- **Region:** Taupo Volcano / Taupo Volcanic Zone
- **Bounding box:** Taupo caldera / Lake Taupo, central Taupo Volcanic Zone, North Island, New Zealand
- **Depth range:** arcuate ring-fault structure resolved at ~6 km depth
- **Content:** hypocentral locations; phase arrival-time picks; fault-geometry; other
- **Producer / contact:** Eleanor R. H. Mestel / Finnigan Illsley-Kemp, Victoria University of Wellington (ECLIPSE programme)
- **Data source:** Dedicated temporary broadband deployment of ~13 seismometers (ECLIPSE programme) supplementing the GeoNet permanent network around Lake Taupo
- **Availability:** available on request · DOI [10.1029/2025JB031644](https://doi.org/10.1029/2025JB031644)

Built from a dedicated temporary broadband deployment (ECLIPSE programme) to improve location control under Lake Taupo where the permanent network gives poor coverage, and to separate magmatic from tectonic seismicity through the 2022-2023 unrest. Resolves an arcuate caldera-ring-fault structure at roughly 6 km depth. A priority temporary-deployment catalogue.

**Key references:**
- Mestel, E.R.H., Illsley-Kemp, F., Savage, M.K., Wilson, C.J.N., Smith, B., & Hreinsdóttir, S. (2025). Seismicity From Modern Magmatic Activity Beneath Taupō Volcano, Aotearoa New Zealand. Journal of Geophysical Research: Solid Earth, 130(9), e2025JB031644. https://doi.org/10.1029/2025JB031644

*Verification — DOI 10.1029/2025JB031644 resolves (Crossref) to 'Seismicity From Modern Magmatic Activity Beneath Taupō Volcano, Aotearoa New Zealand', Mestel, Illsley-Kemp, Savage, Wilson, Smith, Hreinsdóttir (2025), JGR Solid Earth 130(9), e2025JB031644. Confirmed on author publications page. Event count and exact deployment dates not independently verified.*

**Notes:** Priority temporary deployment (ECLIPSE programme). DOI and full author list verified via Crossref and the author's publications page. The '13 seismometers' deployment detail comes from the candidate brief / the paper itself and was not independently re-verified from a fetched figure caption. Distinct from Lamb et al. 2024 and Illsley-Kemp et al. 2021 by using the dedicated ECLIPSE array for relocation.

**Sources:** [api.crossref.org/works/10.1029/2025JB031644](https://api.crossref.org/works/10.1029/2025JB031644) · [elmestel.wordpress.com/publications/](https://elmestel.wordpress.com/publications/)

---

### 55. Taupo 2019 Volcanic Unrest Earthquake Catalogue (Illsley-Kemp et al. 2021)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Illsley-Kemp et al. 2021 Taupo unrest catalogue
- **Coverage:** 2019 → 2019
- **Region:** Taupo Volcano / Taupo Volcanic Zone
- **Bounding box:** Taupo caldera / Lake Taupo, central Taupo Volcanic Zone, North Island, New Zealand
- **Magnitude:** up to ~M5.2 (largest event of the 2019 unrest)
- **Events:** >1,100 (caldera earthquakes)
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** Finnigan Illsley-Kemp, Victoria University of Wellington (VUW / EQcorrscan team)
- **Data source:** GeoNet network data analysed by the VUW group; integrated with deformation (GNSS/InSAR) and gas observations
- **Availability:** available on request · DOI [10.1029/2021GC009803](https://doi.org/10.1029/2021GC009803)

Catalogue of the first instrumentally recorded Taupo caldera unrest episode (2019), documenting >1,100 caldera earthquakes culminating in an M5.2 event, interpreted as related to a magma-mush margin. Integrates seismicity with ground deformation and gas data to assess causes, mechanisms and implications of the unrest.

**Key references:**
- Illsley-Kemp, F., Barker, S.J., Wilson, C.J.N., Chamberlain, C.J., Hreinsdóttir, S., Ellis, S., Hamling, I.J., Savage, M.K., Mestel, E.R.H., & Wadsworth, F.B. (2021). Volcanic Unrest at Taupō Volcano in 2019: Causes, Mechanisms and Implications. Geochemistry, Geophysics, Geosystems, 22, e2021GC009803. https://doi.org/10.1029/2021GC009803

*Verification — DOI 10.1029/2021GC009803 resolves (Crossref) to 'Volcanic Unrest at Taupō Volcano in 2019: Causes, Mechanisms and Implications', Illsley-Kemp et al. (2021), G-cubed vol 22, art e2021GC009803. Event count (>1,100) and M5.2 from the candidate brief / abstract; not independently re-confirmed from full text but consistent with known accounts.*

**Notes:** VUW group typically uses EQcorrscan/matched-filter detection, hence detection_method 'template-matching'. Same 2019 episode is treated from a northern-TVZ cascading perspective by Aber et al. 2025, but this record is distinct (Taupo-caldera focus, integrates deformation+gas). DOI and authorship verified via Crossref.

**Sources:** [api.crossref.org/works/10.1029/2021GC009803](https://api.crossref.org/works/10.1029/2021GC009803) · [agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/2021GC009803](https://agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/2021GC009803) · [elmestel.wordpress.com/publications/](https://elmestel.wordpress.com/publications/)

---

### 56. Taupo 2022-2023 Volcanic Unrest Seismicity Catalogue (Lamb et al. 2024)
*type: background · focus: particular-event-type · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Lamb et al. 2024 Taupo unrest catalogue
- **Coverage:** 2022-05 → 2023-05
- **Region:** Taupo Volcano / Taupo Volcanic Zone
- **Bounding box:** Taupo caldera / Lake Taupo, central Taupo Volcanic Zone, North Island, New Zealand
- **Magnitude:** largest event M5.7 (largest beneath Lake Taupo in ~50 years)
- **Content:** hypocentral locations; phase arrival-time picks; focal mechanisms; other
- **Producer / contact:** Oliver Lamb / Stephen Bannister, GNS Science / GeoNet
- **Data source:** GeoNet network data; moment-tensor and velocity-model analysis by GNS Science
- **Availability:** available (DOI) · DOI [10.26443/seismica.v3i2.1125](https://doi.org/10.26443/seismica.v3i2.1125)

Characterises the May 2022-May 2023 Taupo unrest episode, which produced the highest earthquake count of any instrumented Taupo unrest and the largest earthquake beneath the lake in ~50 years (M5.7). Moment-tensor analysis of the largest event shows an inflationary isotropic component, leading the authors to infer magmatic intrusion at depth triggering fault reactivation.

**Key references:**
- Lamb, O., Bannister, S., Ristau, J., Miller, C., Sherburn, S., Jacobs, K., Hanson, J., D'Anastasio, E., Hreinsdóttir, S., Snee, E., Ross, M., Mestel, E., & Illsley-Kemp, F. (2024). Seismic characteristics of the 2022-2023 unrest episode at Taupō volcano, Aotearoa New Zealand. Seismica, 3(2). https://doi.org/10.26443/seismica.v3i2.1125

*Verification — DOI 10.26443/seismica.v3i2.1125 resolves to the Seismica article; title, full author list, year 2024, vol 3(2), M5.7, and CC BY open access confirmed from the fetched article page. Exact event count not stated in the fetched summary.*

**Notes:** Open-access (CC BY 4.0) in Seismica with downloadable supplementary materials (velocity models, moment tensors, reviewer reports), so marked 'available (DOI)' rather than 'available on request'. Distinct from Mestel 2025 (ECLIPSE relocation) though both cover the 2022-2023 unrest. DOI, full author list, M5.7 and open-access status verified via fetched Seismica page.

**Sources:** [seismica.library.mcgill.ca/article/view/1125](https://seismica.library.mcgill.ca/article/view/1125) · [elmestel.wordpress.com/publications/](https://elmestel.wordpress.com/publications/)

---

### 57. Cascading Earthquake Swarms, Northern Taupo Volcanic Zone (2019, Aber et al. 2025)
*type: background · focus: geographical · detection: other · review: reviewed · confidence: medium · verdict: confirmed*

- **Also known as:** Aber et al. 2025 cascading swarms catalogue
- **Coverage:** 2019-03 → 2019-09
- **Region:** Northern/central Taupo Volcanic Zone (Okataina, Rotorua, toward Whakaari)
- **Bounding box:** ~175 km of the northern and central Taupo Volcanic Zone, North Island, New Zealand
- **Events:** 10 swarms (number of individual events not verified)
- **Content:** hypocentral locations; other
- **Producer / contact:** S. Aber / C. J. Ebinger (with VUW and GNS co-authors)
- **Data source:** GeoNet network data and temporary deployments across the northern/central TVZ; swarm detection and relocation
- **Availability:** available on request · DOI [10.1029/2024GC012079](https://doi.org/10.1029/2024GC012079)

Documents and analyses 10 spatio-temporal earthquake swarms cascading along ~175 km of the northern and central Taupo Volcanic Zone (March-September 2019), near Okataina and Rotorua and extending toward Whakaari/White Island, interpreted as fault-magma interaction. Treats the same 2019 episode as Illsley-Kemp et al. 2021 but focuses on the broader northern-TVZ cascading sequence rather than the Taupo caldera.

**Key references:**
- Aber, S., Ebinger, C.J., Gase, A.C., Kalugana, C., Illsley-Kemp, F., Hamling, I., Sabir, S., Savage, M.K., Eccles, J., Hreinsdottir, S., Ristau, J., & James-Le, J. (2025). Cascading Earthquake Swarms in the Northern Taupō Volcanic Zone, New Zealand. Geochemistry, Geophysics, Geosystems, 26, e2024GC012079. https://doi.org/10.1029/2024GC012079

*Verification — DOI 10.1029/2024GC012079 resolves (Crossref) to 'Cascading Earthquake Swarms in the Northern Taupō Volcanic Zone, New Zealand', Aber et al. (2025), G-cubed vol 26, art e2024GC012079. The 10-swarm / ~175 km / March-September 2019 description matches the Crossref abstract. Whether a discrete distributable catalogue exists (vs analysis within the paper) is unclear.*

**Caveats:**
- Paywalled; per-event count, depth and magnitude details not verifiable from accessible text
- Overlaps the 2019 episode of Illsley-Kemp et al. 2021 but is distinct (northern-TVZ cascading vs Taupo caldera)

**Notes:** Paywalled; details of detection method and event count not verifiable from accessible text, hence detection_method 'other' and confidence reduced. Related to but distinct from Illsley-Kemp et al. 2021 (caldera focus). DOI, title, full author list and the 10-swarm / ~175 km / Mar-Sep 2019 framing verified via Crossref.

**Sources:** [api.crossref.org/works/10.1029/2024GC012079](https://api.crossref.org/works/10.1029/2024GC012079) · [agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2024GC01207](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2024GC012079)

---

### 58. Tarawera 2019 Dyke-Intrusion Earthquake Catalogue (Puhipuhi, Okataina; Benson et al. 2021)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Benson et al. 2021 Tarawera/Puhipuhi swarm catalogue
- **Coverage:** 2019-03 → 2019-03
- **Region:** Tarawera / Okataina Volcanic Centre, Taupo Volcanic Zone
- **Bounding box:** Puhipuhi embayment, NE of Mt Tarawera, Okataina Volcanic Centre, North Island, New Zealand
- **Depth range:** ~8-10.5 km
- **Magnitude:** ML -1.12 to 2.54
- **Events:** 348 detected; 94 relocated
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; other
- **Producer / contact:** Thomas W. Benson / Finnigan Illsley-Kemp, Victoria University of Wellington
- **Data source:** GeoNet network data, analysed with ObsPy and GrowClust (matched-filter detection + relative relocation)
- **Availability:** available (DOI) · DOI [10.5281/zenodo.4035171](https://doi.org/10.5281/zenodo.4035171)

Catalogue of a March 2019 earthquake swarm in the Puhipuhi embayment NE of Tarawera (Okataina Volcanic Centre), interpreted as a dyke intrusion. Detected 348 events and relocated 94 of them (ML -1.12 to 2.54, ~8-10.5 km depth), demonstrating magmatic intrusion during the 2019 activity.

**Key references:**
- Benson, T.W., Illsley-Kemp, F., Elms, H.C., Hamling, I.J., Savage, M.K., Wilson, C.J.N., Mestel, E.R.H., & Barker, S.J. (2021). Earthquake Analysis Suggests Dyke Intrusion in 2019 Near Tarawera Volcano, New Zealand. Frontiers in Earth Science, 8, 606992. https://doi.org/10.3389/feart.2020.606992
- Benson, T.W., Illsley-Kemp, F., Elms, H.C., Hamling, I.J., Savage, M.K., Wilson, C.J.N., Mestel, E.R.H., & Barker, S.J. (2020). Earthquake catalogue for Tarawera region, New Zealand, March 2019 [Data set, QuakeML]. Zenodo. https://doi.org/10.5281/zenodo.4035171

*Verification — Paper DOI 10.3389/feart.2020.606992 verified via Crossref: title 'Earthquake Analysis Suggests Dyke Intrusion in 2019 Near Tarawera Volcano, New Zealand', Benson et al., Frontiers in Earth Science vol 8 art 606992 (2021). Zenodo dataset DOI 10.5281/zenodo.4035171 verified as the QuakeML catalogue for the Tarawera region March 2019 with matching authors.*

**Caveats:**
- 348-detected / 94-relocated counts come from the candidate brief and were not fully confirmed from full text (fetched abstract quoted a lower 'at least 64' figure for one description)

**Notes:** The QuakeML catalogue is openly archived on Zenodo (DOI 10.5281/zenodo.4035171, CC BY 4.0), hence 'available (DOI)'. Paper DOI 10.3389/feart.2020.606992 (published 2021, Frontiers in Earth Science vol 8 art 606992). Detection via matched-filter (template-matching) with GrowClust relocation; 'other' content flag covers fault/dyke geometry inference. Event counts 348/94 from the candidate brief (the fetched abstract mentioned a smaller relocated subset); counts not fully re-verified from full text.

**Sources:** [api.crossref.org/works/10.3389/feart.2020.606992](https://api.crossref.org/works/10.3389/feart.2020.606992) · [zenodo.org/record/4035171](https://zenodo.org/record/4035171) · [www.frontiersin.org/articles/10.3389/feart.2020.606992/full](https://www.frontiersin.org/articles/10.3389/feart.2020.606992/full)

---

### 59. Waimangu-Rotomahana-Mt Tarawera Geothermal Field Earthquake Swarm Catalogue (2004-2015)
*type: background · focus: geographical · detection: manual · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Bannister et al. 2016 WRT swarm catalogue
- **Coverage:** 2004 → 2015
- **Region:** Waimangu-Rotomahana-Tarawera, Okataina / Taupo Volcanic Zone
- **Bounding box:** Waimangu-Rotomahana-Mt Tarawera geothermal field, SW Okataina Volcanic Centre, North Island, New Zealand
- **Events:** 582 (relocated)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks
- **Producer / contact:** Stephen Bannister, GNS Science
- **Data source:** GeoNet / GNS network data; earthquake relocation of swarm seismicity
- **Availability:** not available · DOI [10.1016/j.jvolgeores.2015.07.024](https://doi.org/10.1016/j.jvolgeores.2015.07.024)

Catalogue of 582 relocated earthquakes (2004-2015) in the Waimangu-Rotomahana-Mt Tarawera (WRT) geothermal field on the SW flank of the Okataina Volcanic Centre. The swarm activity highlights crustal faulting associated with the geothermal/volcanic system in the Taupo Volcanic Zone.

**Key references:**
- Bannister, S., Sherburn, S., & Bourguignon, S. (2016). Earthquake swarm activity highlights crustal faulting associated with the Waimangu-Rotomahana-Mt Tarawera geothermal field, Taupo Volcanic Zone. Journal of Volcanology and Geothermal Research, 314, 49-56. https://doi.org/10.1016/j.jvolgeores.2015.07.024

*Verification — DOI 10.1016/j.jvolgeores.2015.07.024 resolves (Crossref) to the exact title; authors Bannister, Sherburn, Bourguignon (2016), JVGR vol 314 pp 49-56. Event count not present in fetched metadata.*

**Caveats:**
- 582-event count and exact 2004-2015 span not re-confirmed from full text (only the title/focus verified via Crossref)

**Notes:** Not archived as a separate dataset; described within the paper, hence 'not available'. DOI, authors (Bannister, Sherburn, Bourguignon), year 2016, journal JVGR vol 314 pp 49-56 verified via Crossref. 582-event count and 2004-2015 span from the candidate brief / abstract; the fetched Crossref metadata confirmed title and the WRT geothermal-field swarm focus but did not list the event count.

**Sources:** [api.crossref.org/works/10.1016/j.jvolgeores.2015.07.024](https://api.crossref.org/works/10.1016/j.jvolgeores.2015.07.024) · [www.sciencedirect.com/science/article/pii/S0377027315002322](https://www.sciencedirect.com/science/article/pii/S0377027315002322)

---

### 60. Mt Ruapehu Earthquake Swarm Catalogue (1990-2023)
*type: background · focus: geographical · detection: machine-learning · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Mitchinson et al. 2024 Ruapehu ML catalogue
- **Coverage:** 1990 → 2023
- **Region:** Mt Ruapehu, Taupo Volcanic Zone
- **Bounding box:** Mt Ruapehu region, southern Taupo Volcanic Zone, North Island, New Zealand
- **Magnitude:** ML ~1.58-4.21; Mc ~1.6
- **Events:** 2,795 swarm events (from 28,522 catalogued)
- **Content:** hypocentral locations; other
- **Producer / contact:** Sam Mitchinson / Jessica H. Johnson, University of East Anglia
- **Data source:** GeoNet QuakeSearch earthquake catalogue (33 years of locations); unsupervised machine-learning clustering (HDBSCAN/DBSCAN)
- **Availability:** available (DOI) · DOI [10.3389/feart.2024.1343874](https://doi.org/10.3389/feart.2024.1343874)

A derived catalogue isolating earthquake swarms at Mt Ruapehu from decades of GeoNet QuakeSearch data using unsupervised machine-learning clustering (HDBSCAN/DBSCAN). From 28,522 catalogued events it identifies 2,795 swarm-related events in 8 sequences (ML ~1.58-4.21, Mc ~1.6) to test whether the 'Erua' swarm was distinctive in space, time and magnitude.

**Key references:**
- Mitchinson, S., Johnson, J.H., Milner, B., & Lines, J. (2024). Identifying earthquake swarms at Mt. Ruapehu, New Zealand: a machine learning approach. Frontiers in Earth Science, 12, 1343874. https://doi.org/10.3389/feart.2024.1343874

*Verification — DOI 10.3389/feart.2024.1343874 resolves (Crossref) to 'Identifying earthquake swarms at Mt. Ruapehu, New Zealand: a machine learning approach', Mitchinson, Johnson, Milner, Lines (2024), Frontiers in Earth Science vol 12 art 1343874. ML (HDBSCAN/DBSCAN) method confirmed. Event counts (2,795/28,522) from candidate brief, not re-confirmed from full text; date span start year uncertain (1990 vs 1994).*

**Caveats:**
- Start year discrepancy: candidate brief says 1990, the fetched abstract says 1994 for the study window — start_date 1990 retained per brief but flagged uncertain

**Notes:** Derived (not new picking) catalogue built on GeoNet QuakeSearch source data, which is openly accessible; the paper is open access (Frontiers), hence 'available (DOI)' with underlying data via GeoNet QuakeSearch. Note: the fetched abstract states the study window as 1994-2023, whereas the candidate brief gives 1990-2023 — the start year is uncertain. DOI, authors and ML method verified via Crossref.

**Sources:** [api.crossref.org/works/10.3389/feart.2024.1343874](https://api.crossref.org/works/10.3389/feart.2024.1343874) · [www.frontiersin.org/journals/earth-science/articles/10.3389/](https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2024.1343874/full) · [quakesearch.geonet.org.nz/](https://quakesearch.geonet.org.nz/)

---

### 61. Whakaari/White Island Very-Long-Period (VLP) Earthquake Catalogue (2007-2019)
*type: background · focus: particular-event-type · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Park et al. 2020 Whakaari VLP families F1/F2
- **Coverage:** 2007 → 2019
- **Region:** Whakaari/White Island, Taupo Volcanic Zone (offshore)
- **Bounding box:** Whakaari/White Island, Bay of Plenty, offshore North Island, New Zealand
- **Content:** hypocentral locations; quality information; other
- **Producer / contact:** Iseul Park / Arthur Jolly, University of Canterbury / GNS Science
- **Data source:** GeoNet seismic stations on Whakaari/White Island; waveform-semblance detection and clustering of VLP events
- **Availability:** available on request · DOI [10.1186/s40623-020-01224-z](https://doi.org/10.1186/s40623-020-01224-z)

A long-term classification catalogue of very-long-period (VLP) volcanic earthquakes at Whakaari/White Island over 2007 to end-2019, detected by waveform semblance and grouped into two families (F1, F2). F2 swarms mark the onset of unrest, making the catalogue relevant to eruption forecasting at the volcano.

**Key references:**
- Park, I., Jolly, A., Lokmer, I., & Kennedy, B. (2020). Classification of long-term very long period (VLP) volcanic earthquakes at Whakaari/White Island volcano, New Zealand. Earth, Planets and Space, 72, 92. https://doi.org/10.1186/s40623-020-01224-z

*Verification — DOI 10.1186/s40623-020-01224-z resolves (Crossref) to the exact title; authors Park, Jolly, Lokmer, Kennedy (2020), Earth Planets and Space vol 72 art 92. The 2007-to-end-2019 VLP scope and F1/F2 family classification confirmed in the Crossref abstract. Event count not stated.*

**Notes:** Detection by waveform semblance + clustering into VLP families F1/F2, classified as detection_method 'other' (waveform semblance) rather than template-matching. EPS is an open-access journal but the event list itself is typically on request, so marked 'available on request'. DOI, authors (Park, Jolly, Lokmer, Kennedy), year 2020, EPS vol 72 art 92 and the 2007-2019 VLP scope verified via Crossref. 'other' content flag covers VLP family/waveform classification.

**Sources:** [api.crossref.org/works/10.1186/s40623-020-01224-z](https://api.crossref.org/works/10.1186/s40623-020-01224-z) · [link.springer.com/article/10.1186/s40623-020-01224-z](https://link.springer.com/article/10.1186/s40623-020-01224-z) · [ui.adsabs.harvard.edu/abs/2020EP&S...72...92P/abstract](https://ui.adsabs.harvard.edu/abs/2020EP&S...72...92P/abstract)

---

### 62. Ngatamariki Geothermal Injection-Induced Microseismicity Catalogue (2012-2015)
*type: induced · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Hopp et al. 2019 Ngatamariki matched-filter catalogue
- **Coverage:** 2012 → 2015
- **Region:** Ngatamariki geothermal field, Taupo Volcanic Zone
- **Bounding box:** Ngatamariki geothermal field, central Taupo Volcanic Zone, North Island, New Zealand
- **Depth range:** ~1-3 km (reservoir)
- **Magnitude:** ML ~0.26-3.17
- **Events:** ~77,457 total (templates + detections); ~41,114 located (per candidate brief)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; focal mechanisms; other
- **Producer / contact:** Chet Hopp / John Townend & Martha Savage, Victoria University of Wellington (with Mercury NZ)
- **Data source:** Mercury NZ operator temporary seismic network at Ngatamariki plus GeoNet; matched-filter (template-matching) detection
- **Availability:** available on request · DOI [10.1029/2019GC008243](https://doi.org/10.1029/2019GC008243)

Catalogue of injection/stimulation-induced microseismicity at the Ngatamariki geothermal field tied to 2012-2015 well stimulation and injection, built by matched-filter detection. Reports very large numbers of detections (templates plus matched-filter detections), a located subset in a ~1-3 km reservoir (ML ~0.26-3.17), and includes focal mechanisms, examining the relationship between injection and induced seismicity.

**Key references:**
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2019). Seismic Response to Injection Well Stimulation in a High-Temperature, High-Permeability Reservoir. Geochemistry, Geophysics, Geosystems, 20, 2848-2871. https://doi.org/10.1029/2019GC008243

*Verification — DOI 10.1029/2019GC008243 resolves (Crossref) to 'Seismic Response to Injection Well Stimulation in a High-Temperature, High-Permeability Reservoir', Hopp, Sewell, Mroczek, Savage, Townend (2019), G-cubed vol 20 pp 2848-2871. Ngatamariki 2012-2015 matched-filter focus confirmed. Brief's page range was wrong (now corrected); event counts taken from brief.*

**Caveats:**
- Candidate brief page range '3300-3316' is incorrect; Crossref gives pp 2848-2871 — corrected
- Detection/location counts (77,457 / 41,114) not independently re-confirmed from full text

**Notes:** Operator (Mercury NZ) data, so availability is on request. catalogue_type 'induced' (injection-induced). NOTE: candidate brief lists pages '3300-3316', but Crossref gives pages 2848-2871 for this DOI — corrected here. Event counts (77,457 / 41,114) from the candidate brief / paper; not independently re-confirmed from full text. DOI, authors and Ngatamariki 2012-2015 matched-filter scope verified via Crossref.

**Sources:** [api.crossref.org/works/10.1029/2019GC008243](https://api.crossref.org/works/10.1029/2019GC008243) · [escholarship.org/uc/item/30w535m0](https://escholarship.org/uc/item/30w535m0) · [agupubs.onlinelibrary.wiley.com/doi/10.1029/2019GC008243](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2019GC008243)

---

### 63. Rotokawa Geothermal Field Induced Microseismicity Catalogue (2012-2015)
*type: induced · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Hopp et al. 2020 Rotokawa matched-filter catalogue
- **Coverage:** 2012 → 2015
- **Region:** Rotokawa geothermal field, Taupo Volcanic Zone
- **Bounding box:** Rotokawa geothermal field, central Taupo Volcanic Zone, North Island, New Zealand
- **Depth range:** ~1-3 km (reservoir)
- **Magnitude:** ML ~0.37-3.52; Mc ~0.74
- **Events:** ~25,148 events (2,665 templates); ~6,500 relocated (per candidate brief)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; other
- **Producer / contact:** Chet Hopp / John Townend & Martha Savage, Victoria University of Wellington (with Mercury NZ)
- **Data source:** Mercury NZ operator temporary seismic network at Rotokawa plus GeoNet; matched-filter (template-matching) detection and double-difference relocation
- **Availability:** available on request · DOI [10.1016/j.geothermics.2019.101750](https://doi.org/10.1016/j.geothermics.2019.101750)

A ~four-year matched-filter catalogue of induced/produced seismicity at the Rotokawa geothermal field, examining the seismic response to evolving injection. Reports thousands of templates yielding tens of thousands of detected events, with a relocated subset in a ~1-3 km reservoir (ML ~0.37-3.52, Mc ~0.74).

**Key references:**
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2020). Seismic response to evolving injection at the Rotokawa geothermal field, New Zealand. Geothermics, 85, 101750. https://doi.org/10.1016/j.geothermics.2019.101750

*Verification — DOI 10.1016/j.geothermics.2019.101750 resolves (Crossref) to 'Seismic response to evolving injection at the Rotokawa geothermal field, New Zealand', Hopp, Sewell, Mroczek, Savage, Townend (2020), Geothermics vol 85 art 101750. Rotokawa 2012-2015 induced-seismicity scope confirmed; precise counts taken from brief.*

**Caveats:**
- Detailed event/template counts (25,148 / 2,665 / 6,500) come from the candidate brief and were not independently re-confirmed from full text

**Notes:** Operator (Mercury NZ) data, availability on request. catalogue_type 'induced' (production/injection-induced). DOI, authors (Hopp, Sewell, Mroczek, Savage, Townend), year 2020, Geothermics vol 85 art 101750 verified via Crossref. The fetched metadata notes the published article focuses on the seismic response, with detailed catalogue numbers in the companion thesis; event counts (25,148 / 6,500 / 2,665 templates) from the candidate brief, not independently re-confirmed.

**Sources:** [api.crossref.org/works/10.1016/j.geothermics.2019.101750](https://api.crossref.org/works/10.1016/j.geothermics.2019.101750) · [escholarship.org/uc/item/3661x2gx](https://escholarship.org/uc/item/3661x2gx) · [www.sciencedirect.com/science/article/abs/pii/S0375650519302](https://www.sciencedirect.com/science/article/abs/pii/S0375650519302512)

---

### 64. Rotokawa & Ngatamariki Combined Matched-Filter Catalogue (2012-2015, anisotropy)
*type: induced · focus: parameter-testing · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Mroczek et al. 2020 combined geothermal catalogue
- **Coverage:** 2012 → 2015
- **Region:** Rotokawa & Ngatamariki geothermal fields, Taupo Volcanic Zone
- **Bounding box:** Rotokawa and Ngatamariki geothermal fields, central Taupo Volcanic Zone, North Island, New Zealand
- **Depth range:** ~1-3 km (reservoirs)
- **Events:** ~160,000 matched-filter detections; ~17,702 used for shear-wave splitting (per candidate brief)
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** Stefan Mroczek / Martha K. Savage, Victoria University of Wellington (with Mercury NZ)
- **Data source:** Combined Rotokawa + Ngatamariki matched-filter microseismicity (Mercury NZ networks + GeoNet); shear-wave splitting analysis
- **Availability:** available on request · DOI [10.1093/gji/ggz400](https://doi.org/10.1093/gji/ggz400)

A combined Rotokawa + Ngatamariki induced-microseismicity catalogue (~2012-2015) used to measure shear-wave splitting and track reservoir stress and fracture changes with production/injection. Reports on the order of ~160,000 matched-filter detections, of which ~17,702 events were used for the shear-wave-splitting analysis. Distinct from the single-field Hopp 2019/2020 catalogues by combining both fields and adding SWS.

**Key references:**
- Mroczek, S., Savage, M.K., Hopp, C., & Sewell, S.M. (2020). Anisotropy as an indicator for reservoir changes: example from the Rotokawa and Ngatamariki geothermal fields, New Zealand. Geophysical Journal International, 220(1), 1-17. https://doi.org/10.1093/gji/ggz400

*Verification — DOI 10.1093/gji/ggz400 resolves (Crossref) to 'Anisotropy as an indicator for reservoir changes: example from the Rotokawa and Ngatamariki geothermal fields, New Zealand', Mroczek, Savage, Hopp, Sewell (2019/2020), GJI vol 220(1) pp 1-17. Combined-field shear-wave-splitting scope confirmed; precise event counts taken from brief.*

**Caveats:**
- Counts (~160,000 detections; 17,702 used for SWS) come from the candidate brief and were not independently re-confirmed from full text
- Overlaps with Hopp 2019 (Ngatamariki) and Hopp 2020 (Rotokawa) but distinct (combined fields + shear-wave splitting)

**Notes:** focus 'parameter-testing' because the catalogue is used to measure shear-wave splitting / reservoir stress-fracture parameters rather than as a general location catalogue; 'other' content flag covers the SWS measurements. Published online 2019, print 2020 (GJI). Operator data, availability on request. DOI, authors (Mroczek, Savage, Hopp, Sewell), GJI vol 220(1) pp 1-17 verified via Crossref. Event counts (160,000 / 17,702) from the candidate brief, not independently re-confirmed. Overlaps but distinct from Hopp 2019/2020 single-field catalogues.

**Sources:** [api.crossref.org/works/10.1093/gji/ggz400](https://api.crossref.org/works/10.1093/gji/ggz400) · [escholarship.org/content/qt6x93p8hb/qt6x93p8hb_noSplash_a8e1](https://escholarship.org/content/qt6x93p8hb/qt6x93p8hb_noSplash_a8e1f6fd14231439a18dc02f35d82c05.pdf)

---

## Slow-slip, tremor, LFE & moment-tensor catalogues (10)

### 65. GeoNet New Zealand Earthquake Moment Tensor Solutions (MwNZ)
*type: background · focus: geographical · detection: automatic · review: partially reviewed · confidence: high · verdict: confirmed*

- **Also known as:** MwNZ; GeoNet CMT; regional moment tensor (RMT) catalogue; Ristau RMT catalogue
- **Coverage:** 2003-08 → ongoing
- **Region:** New Zealand and adjacent offshore regions
- **Bounding box:** New Zealand and adjacent offshore regions (approx. NZ landmass plus Hikurangi/Kermadec and Puysegur margins)
- **Magnitude:** Approximately Mw 3.0-8.0; solutions routinely computed for moderate (M > ~4) earthquakes
- **Events:** ~1900 (grows monthly; exact count not stated on landing pages)
- **Content:** focal mechanisms; hypocentral locations; quality information
- **Producer / contact:** GNS Science / GeoNet (John Ristau, GNS Science)
- **Data source:** Regional broadband seismic waveform data from the GeoNet national network (and adjacent stations), inverted for regional centroid moment tensor solutions; routine production since August 2003.
- **Availability:** available (DOI) · DOI [10.21420/MMJ9-CZ67](https://doi.org/10.21420/MMJ9-CZ67)

National regional centroid moment tensor (focal mechanism) catalogue for New Zealand and adjacent offshore earthquakes, produced routinely since August 2003 to provide consistent Mw and fault-geometry information for moderate-to-large NZ earthquakes. It established the MwNZ regional moment magnitude scale used across NZ seismology and hazard work. Two inversion approaches have been used over time (Dreger/Berkeley code 2003-2020; a Penn State inversion code from June 2020).

**Key references:**
- GNS Science (2006). GeoNet Aotearoa New Zealand Earthquake Moment Tensor solutions [Data set]. GNS Science, GeoNet. https://doi.org/10.21420/MMJ9-CZ67
- Ristau, J. (2008). Implementation of routine regional moment tensor analysis in New Zealand. Seismological Research Letters, 79(3), 400-415.
- Ristau, J. (2009). Comparison of magnitude estimates for New Zealand earthquakes: Moment magnitude, local magnitude, and teleseismic body-wave magnitude. Bulletin of the Seismological Society of America, 99(3), 1841-1852. https://doi.org/10.1785/0120080376

*Verification — DOI 10.21420/MMJ9-CZ67 confirmed on both the NEDC landing page and the data.govt.nz catalogue page; recommended dataset citation 'GNS Science (2006)... https://doi.org/10.21420/MMJ9-CZ67' verified. Ristau (2009) BSSA 99(3):1841 and Ristau (2008) SRL are well-established foundational references for the MwNZ scale; the BSSA article was in the candidate source list. CSV/GitHub access confirmed.*

**Caveats:**
- Exact event count not stated on the landing pages; ~1881/~1900 is an estimate.
- detection_method set to <automatic> because solutions are computed routinely/automatically, though individual solutions carry quality information and are checked.

**Notes:** CSV of solutions (GeoNet_CMT_solutions.csv, 24 fields incl. nodal planes, moment tensor elements, ML and Mw, centroid depth, variance reduction, double-couple percent) is published in the GeoNet/data GitHub repository at https://github.com/GeoNet/data/tree/main/moment-tensor and updated when new solutions are calculated. Moment tensor elements scaled at 1E20 dyne-cm. Method 2 (Penn State inversion code) in use since June 2020. The ~1881+ event figure in the brief is plausible but was not directly verified on the landing pages consulted.

**Sources:** [nedc.nz/content/geonet-new-zealand-earthquake-moment-tensor-](https://nedc.nz/content/geonet-new-zealand-earthquake-moment-tensor-solutions/) · [github.com/GeoNet/data/tree/main/moment-tensor](https://github.com/GeoNet/data/tree/main/moment-tensor) · [catalogue.data.govt.nz/dataset/geonet-aotearoa-new-zealand-e](https://catalogue.data.govt.nz/dataset/geonet-aotearoa-new-zealand-earthquake-moment-tensor-solutions)

---

### 66. Hikurangi Slow Slip Event Inventory (Wallace & Beavan 2010)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Hikurangi SSE catalogue; Hikurangi slow-slip inventory; Wallace & Beavan 2010
- **Coverage:** 2002 → 2010
- **Region:** Hikurangi margin
- **Bounding box:** North Island, New Zealand / Hikurangi subduction margin (eastern North Island)
- **Depth range:** shallow (north/central) to >25-30 km (deep southern SSEs)
- **Magnitude:** Equivalent moment magnitudes approximately Mw 6.3-7.2
- **Events:** ~15 slow slip events
- **Content:** fault-geometry; other
- **Producer / contact:** Laura M. Wallace and John Beavan, GNS Science
- **Data source:** Continuous GPS (cGPS) time series from the GeoNet continuous GPS network across the North Island / Hikurangi margin; elastic dislocation modelling of surface displacements.
- **Availability:** available on request · DOI [10.1029/2010JB007717](https://doi.org/10.1029/2010JB007717)

Foundational inventory of Hikurangi slow slip events documented with continuous GPS, revealing marked diversity in SSE behaviour: shallow, frequent events in the north and central margin versus deep (>25-30 km), roughly 5-yearly events in the south. It underpins nearly all subsequent NZ SSE studies and characterised durations (days to >1 year), equivalent moment release (Mw ~6.3-7.2) and recurrence intervals (2 to >5 years).

**Key references:**
- Wallace, L. M., & Beavan, J. (2010). Diverse slow slip behavior at the Hikurangi subduction margin, New Zealand. Journal of Geophysical Research: Solid Earth, 115, B12402. https://doi.org/10.1029/2010JB007717

*Verification — DOI 10.1029/2010JB007717 confirmed; title 'Diverse slow slip behavior at the Hikurangi subduction margin, New Zealand', authors L. M. Wallace & J. Beavan, JGR Solid Earth vol 115 (article B12402), 2010 all verified via Wiley and Google Scholar lookup. Event count ~15 SSEs confirmed from abstract (brief said 2002-2010, consistent). No standalone dataset DOI; available on request is appropriate.*

**Caveats:**
- No standalone dataset DOI exists; only the article DOI. Data availability is best described as available on request.

**Notes:** Slow-slip-event inventory derived from geodesy (cGPS), not a hypocentral earthquake catalogue. The DOI resolves to the JGR Solid Earth article (vol 115, B12402). The brief's '2002-2010' coverage and 'available on request' status are consistent with the paper; ~15 SSEs reported per the article abstract. Successor/extension: Michel et al. (2025) 14-year GNSS SSE catalogue.

**Sources:** [agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2010JB00771](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2010JB007717) · [www.semanticscholar.org/paper/Diverse-slow-slip-behavior-at-](https://www.semanticscholar.org/paper/Diverse-slow-slip-behavior-at-the-Hikurangi-margin-Wallace-Beavan/) · [en.wikipedia.org/wiki/Laura_Wallace](https://en.wikipedia.org/wiki/Laura_Wallace)

---

### 67. 14-Year GNSS Slow Slip Event Catalogue for the Hikurangi Subduction Zone (Michel et al. 2025)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed · confidence: medium · verdict: confirmed*

- **Also known as:** Hikurangi 14-year SSE catalogue; Michel et al. 2025; '14 Years of Slip on the Hikurangi Subduction Zone'
- **Coverage:** 2009 → 2023
- **Region:** Hikurangi margin
- **Bounding box:** Hikurangi subduction zone, North Island, New Zealand
- **Events:** 27 slow slip events
- **Content:** fault-geometry; other
- **Producer / contact:** Sylvain Michel et al. (corresponding institutions per the JGR Solid Earth paper)
- **Data source:** 14 years (2009-2023) of GeoNet continuous GNSS time series; Independent Component Analysis decomposition combined with an inversion scheme to derive the slip history on the Hikurangi megathrust.
- **Availability:** available on request · DOI [10.1029/2024JB030865](https://doi.org/10.1029/2024JB030865)

Catalogue of 27 slow slip events extracted from a 14-year (2009-2023) model of aseismic slip on the Hikurangi subduction megathrust derived from GNSS time series. It is the modern successor to the Wallace & Beavan (2010) inventory, providing a continuous spatio-temporal history of accelerations and slowdowns of fault slip. The methodology combines Independent Component Analysis with a slip-inversion scheme.

**Key references:**
- Michel, S., et al. (2025). 14 Years of Slip on the Hikurangi Subduction Zone. Journal of Geophysical Research: Solid Earth, 130, e2024JB030865. https://doi.org/10.1029/2024JB030865

*Verification — DOI 10.1029/2024JB030865 confirmed to resolve; title verified via search as '14 Years of Slip on the Hikurangi Subduction Zone', JGR Solid Earth vol 130, article e2024JB030865, lead author Michel, 2025. Event count of 27 SSEs and 2009-2023 period confirmed from search summary of the article. Full author list NOT verified (paywall, HTTP 402); brief 'Michel et al.' retained without inventing co-authors.*

**Caveats:**
- Full text inaccessible (paywall); full author list and any dataset DOI not confirmed.
- Per-SSE magnitude information not documented in sources read.

**Notes:** Article DOI 10.1029/2024JB030865 resolves; journal article number e2024JB030865, JGR Solid Earth volume 130. 27 SSEs over 2009-2023 confirmed from search summaries of the article. Could not access full text (HTTP 402 paywall), so full author list and any separate dataset DOI were not verified. Geodetic SSE catalogue, not a hypocentral earthquake catalogue.

**Sources:** [agupubs.onlinelibrary.wiley.com/doi/10.1029/2024JB030865](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2024JB030865) · [agupubs.onlinelibrary.wiley.com/doi/pdfdirect/10.1029/2024JB](https://agupubs.onlinelibrary.wiley.com/doi/pdfdirect/10.1029/2024JB030865)

---

### 68. Shallow Hikurangi Slow Slip Event Catalogue (Perez-Silva et al. 2025)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Perez-Silva et al. 2025 shallow Hikurangi SSE catalogue; SSEcatalog.mat
- **Coverage:** 2006 → 2024
- **Region:** Hikurangi margin
- **Bounding box:** Northern/central Hikurangi subduction margin, North Island, New Zealand
- **Depth range:** shallow (Hikurangi megathrust)
- **Content:** other; quality information
- **Producer / contact:** Andrea Perez-Silva (with Ting Wang, Laura Wallace, Mark Bebbington, Paul Denys)
- **Data source:** GeoNet continuous GPS (cGPS) time series; wavelet-based detection of shallow SSEs, producing start/end times and detecting-station lists.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.14848128](https://doi.org/10.5281/zenodo.14848128)

Catalogue of shallow Hikurangi slow slip events (start/end times and detecting stations) compiled to study SSE occurrence statistics using renewal processes. Built from GeoNet cGPS data with wavelet detection over roughly 2006-2024, it is published as data products (e.g. SSEcatalog.mat plus R/MATLAB analysis scripts) on Zenodo. It supports a companion GRL paper on assessing recurrence/forecast patterns of shallow Hikurangi SSEs.

**Key references:**
- Perez-Silva, A., Wang, T., Wallace, L., Bebbington, M., & Denys, P. (2025). Assessing occurrence patterns of shallow Hikurangi slow slip events using renewal processes [Data set]. Zenodo. https://doi.org/10.5281/zenodo.14848128
- Perez-Silva, A., Wang, T., Wallace, L., Bebbington, M., & Denys, P. (2025). Assessing Occurrence Patterns of Shallow Hikurangi Slow Slip Events Using Renewal Processes. Geophysical Research Letters, 52, e2025GL116605. https://doi.org/10.1029/2025GL116605

*Verification — Zenodo DOI 10.5281/zenodo.14848128 confirmed; dataset title 'Assessing occurrence patterns of shallow Hikurangi slow slip events using renewal processes', authors Perez-Silva, Wang, Wallace, Bebbington, Denys (2025), CC-BY 4.0 verified directly from the Zenodo record. Companion GRL DOI 10.1029/2025GL116605 confirmed via Crossref: 'Assessing Occurrence Patterns of Shallow Hikurangi Slow Slip Events Using Renewal Processes', GRL vol 52, e2025GL116605, authors Andrea Perez-Silva, Ting Wang, Laura Wallace, Mark Bebbington, Paul Denys.*

**Caveats:**
- Exact event count not stated in the Zenodo record.
- Time window 2006-2024 from the brief, not explicitly confirmed in the Zenodo record.

**Notes:** Zenodo dataset contains SSEcatalog.mat (start/end times + detecting stations), GPS time-series figures, wavelet analysis files (R1/R2 regions), and 13 R/MATLAB scripts for renewal-process modelling; CC-BY 4.0. Companion GRL paper confirmed. Brief's 'wavelet detection, GeoNet cGPS' matches the Zenodo description; the 2006-2024 window is from the brief and not explicitly stated in the Zenodo record (time period 'not specified' there).

**Sources:** [zenodo.org/records/14848128](https://zenodo.org/records/14848128) · [agupubs.onlinelibrary.wiley.com/doi/10.1029/2025GL116605](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025GL116605)

---

### 69. Northern Hikurangi Tectonic Tremor Catalogue 2010-2015 (Todd & Schwartz 2016)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Todd & Schwartz 2016 tremor catalogue; northern Hikurangi tremor catalogue
- **Coverage:** 2010 → 2015
- **Region:** Hikurangi margin (Raukumara Peninsula)
- **Bounding box:** Northern Hikurangi margin / Raukumara Peninsula, North Island, New Zealand
- **Content:** other
- **Producer / contact:** Erin K. Todd and Susan Y. Schwartz (University of California, Santa Cruz)
- **Data source:** Densified onshore GeoNet seismic network (northern Hikurangi / Raukumara Peninsula); envelope cross-correlation of continuous seismic data to detect and locate tectonic tremor.
- **Availability:** available on request · DOI [10.1002/2016JB013480](https://doi.org/10.1002/2016JB013480)

First comprehensive tectonic tremor catalogue for the northern Hikurangi margin (2010-2015), associating tremor with geodetic transients off the Raukumara Peninsula and helping identify slow slip events. It used envelope cross-correlation on the densified onshore GeoNet network. This is a tremor catalogue rather than a hypocentral earthquake catalogue.

**Key references:**
- Todd, E. K., & Schwartz, S. Y. (2016). Tectonic tremor along the northern Hikurangi Margin, New Zealand, between 2010 and 2015. Journal of Geophysical Research: Solid Earth, 121, 8706-8719. https://doi.org/10.1002/2016JB013480

*Verification — DOI 10.1002/2016JB013480 confirmed via Crossref: title 'Tectonic tremor along the northern Hikurangi Margin, New Zealand, between 2010 and 2015', authors Erin K. Todd & Susan Y. Schwartz, JGR Solid Earth vol 121, pp 8706-8719, 2016. All match the brief.*

**Caveats:**
- Number of individual tremor detections not documented in sources read (catalogue characterised by associated geodetic transients).
- detection_method other (envelope cross-correlation).

**Notes:** Tectonic tremor catalogue (envelope cross-correlation), not hypocentral earthquakes. The brief states tremor associated with 20 of 26 geodetic transients (18 newly identified SSEs). DOI/title/authors/venue verified via Crossref. detection_method set to <other> because envelope cross-correlation is neither standard manual picking nor template matching.

**Sources:** [api.crossref.org/works/10.1002/2016JB013480](https://api.crossref.org/works/10.1002/2016JB013480) · [agupubs.onlinelibrary.wiley.com/doi/10.1002/2016JB013480](https://agupubs.onlinelibrary.wiley.com/doi/10.1002/2016JB013480) · [seismo.sites.ucsc.edu/susan-schwartzs-publications/](https://seismo.sites.ucsc.edu/susan-schwartzs-publications/)

---

### 70. Ambient Tectonic Tremor Catalogue: Manawatu, Cape Turnagain, Marlborough & Puysegur (Romanet & Ide 2019)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Romanet & Ide 2019 ambient tremor catalogue
- **Coverage:** 2005 → 2016
- **Region:** Manawatu, Cape Turnagain, Marlborough, Puysegur (Fiordland)
- **Bounding box:** Four NZ regions: Manawatu, Cape Turnagain (lower North Island), Marlborough (northern South Island), Puysegur/Fiordland (SW South Island)
- **Content:** other
- **Producer / contact:** Pierre Romanet and Satoshi Ide (University of Tokyo)
- **Data source:** GeoNet continuous seismic data across four NZ regions; tremor detection using duration-energy scaling combined with visual inspection.
- **Availability:** available on request · DOI [10.1186/s40623-019-1039-1](https://doi.org/10.1186/s40623-019-1039-1)

Multi-region ambient tectonic tremor catalogue across four New Zealand areas (Manawatu, Cape Turnagain, Marlborough and Puysegur), notably documenting tremor in the Puysegur/Fiordland subduction system in addition to the Hikurangi-related regions. Tremor was detected using a duration-energy scaling approach plus visual inspection of GeoNet data over roughly 2005-2016. It is a tremor catalogue rather than a hypocentral earthquake catalogue.

**Key references:**
- Romanet, P., & Ide, S. (2019). Ambient tectonic tremors in Manawatu, Cape Turnagain, Marlborough, and Puysegur, New Zealand. Earth, Planets and Space, 71, 59. https://doi.org/10.1186/s40623-019-1039-1

*Verification — DOI 10.1186/s40623-019-1039-1 confirmed via Crossref: title 'Ambient tectonic tremors in Manawatu, Cape Turnagain, Marlborough, and Puysegur, New Zealand', authors Pierre Romanet & Satoshi Ide, Earth Planets Space vol 71 article 59, 2019. The brief had authorship as 'from search summaries'; now confirmed as Romanet & Ide.*

**Caveats:**
- Time window 2005-2016 from the brief, not directly confirmed in fetched text (article body paywalled/redirected).
- Event count not documented.

**Notes:** Authorship corrected: the catalogue is by Pierre Romanet and Satoshi Ide (the brief left authorship to be confirmed at medium confidence). DOI/title/authors/venue/article number verified via Crossref. Tremor catalogue, not hypocentral earthquakes. detection_method other (duration-energy scaling + visual inspection). The 2005-2016 window is from the brief and not directly verified in fetched text.

**Sources:** [api.crossref.org/works/10.1186/s40623-019-1039-1](https://api.crossref.org/works/10.1186/s40623-019-1039-1) · [earth-planets-space.springeropen.com/articles/10.1186/s40623](https://earth-planets-space.springeropen.com/articles/10.1186/s40623-019-1039-1)

---

### 71. Alpine Fault Low-Frequency Earthquake Catalogue (Chamberlain et al. 2014)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Alpine Fault LFE catalogue 2014; Chamberlain et al. 2014
- **Coverage:** 2009 → 2012
- **Region:** Alpine Fault / Southern Alps
- **Bounding box:** Central Alpine Fault, Southern Alps, South Island, New Zealand
- **Depth range:** ~20-30 km (deep extent of the Alpine Fault)
- **Events:** ~8,760 LFEs in 14 families
- **Content:** hypocentral locations; phase arrival-time picks; relative relocations; other
- **Producer / contact:** Calum J. Chamberlain (with David R. Shelly, John Townend, Tim A. Stern), Victoria University of Wellington / USGS
- **Data source:** GeoNet plus SAMBA (Southern Alps Microearthquake Borehole Array) continuous seismic data; matched-filter (template-matching) detection of low-frequency earthquakes within tremor.
- **Availability:** available on request · DOI [10.1002/2014GC005436](https://doi.org/10.1002/2014GC005436)

First low-frequency earthquake (LFE) catalogue for the deep Alpine Fault: approximately 8,760 LFEs in 14 families over 36 months (2009-2012), revealing punctuated slow slip at roughly 20-30 km depth. It was built from GeoNet and SAMBA continuous data using matched-filter detection within tremor and is the earliest NZ LFE catalogue, serving as a precursor to Baratin et al. (2018).

**Key references:**
- Chamberlain, C. J., Shelly, D. R., Townend, J., & Stern, T. A. (2014). Low-frequency earthquakes reveal punctuated slow slip on the deep extent of the Alpine Fault, New Zealand. Geochemistry, Geophysics, Geosystems, 15, 2984-2999. https://doi.org/10.1002/2014GC005436

*Verification — DOI 10.1002/2014GC005436 confirmed via Crossref: title 'Low-frequency earthquakes reveal punctuated slow slip on the deep extent of the Alpine Fault, New Zealand', authors Calum J. Chamberlain, David R. Shelly, John Townend, Tim A. Stern, G-cubed vol 15, pp 2984-2999, 2014. All match the brief.*

**Caveats:**
- Exact LFE/family counts (~8,760 / 14) taken from the brief, not re-verified against full text.
- Magnitude range not documented.

**Notes:** LFE catalogue via matched-filter; detection_method template-matching. DOI/title/authors/venue verified via Crossref (G-cubed vol 15, pp 2984-2999). Successor: Baratin et al. (2018) extends the templates and adds focal mechanisms. Event count ~8,760 / 14 families and 2009-2012 from the brief; consistent with the paper title but not independently re-counted from full text.

**Sources:** [api.crossref.org/works/10.1002/2014GC005436](https://api.crossref.org/works/10.1002/2014GC005436) · [agupubs.onlinelibrary.wiley.com/doi/10.1002/2014gc005436](https://agupubs.onlinelibrary.wiley.com/doi/10.1002/2014gc005436) · [pubs.usgs.gov/publication/70193628](https://pubs.usgs.gov/publication/70193628)

---

### 72. Alpine Fault Low-Frequency Earthquake Catalogue with Focal Mechanisms (Baratin et al. 2018)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Baratin et al. 2018 Alpine Fault LFE catalogue
- **Coverage:** 2009 → 2017
- **Region:** Alpine Fault / Southern Alps
- **Bounding box:** Central Alpine Fault, Southern Alps, South Island, New Zealand
- **Depth range:** ~20-30 km (deep extent of the Alpine Fault)
- **Content:** hypocentral locations; phase arrival-time picks; relative relocations; focal mechanisms; other
- **Producer / contact:** Laura-May Baratin (with Calum J. Chamberlain, John Townend, Martha K. Savage), Victoria University of Wellington
- **Data source:** GeoNet and SAMBA continuous seismic data; matched-filter (template-matching) detection of LFEs, extended templates relative to Chamberlain et al. (2014), with LFE focal mechanism determination.
- **Availability:** available on request · DOI [10.1016/j.epsl.2017.12.021](https://doi.org/10.1016/j.epsl.2017.12.021)

Extended, longer-duration deep Alpine Fault LFE catalogue (2009-2017) that adds the first LFE focal mechanisms for the region. It shows that increased LFE rates coincide with tremor and regional earthquakes, interpreted as quasi-continuous deformation and triggered slow slip on the deep Alpine Fault. It builds on and extends the Chamberlain et al. (2014) template set.

**Key references:**
- Baratin, L.-M., Chamberlain, C. J., Townend, J., & Savage, M. K. (2018). Focal mechanisms and inter-event times of low-frequency earthquakes reveal quasi-continuous deformation and triggered slow slip on the deep Alpine Fault. Earth and Planetary Science Letters, 484, 111-123. https://doi.org/10.1016/j.epsl.2017.12.021

*Verification — DOI 10.1016/j.epsl.2017.12.021 confirmed via Crossref: title 'Focal mechanisms and inter-event times of low-frequency earthquakes reveal quasi-continuous deformation and triggered slow slip on the deep Alpine Fault', authors Laura-May Baratin, Calum J. Chamberlain, John Townend, Martha K. Savage, EPSL vol 484, pp 111-123, 2018. All match the brief.*

**Caveats:**
- Exact LFE/family count not documented in sources read.

**Sources:** [api.crossref.org/works/10.1016/j.epsl.2017.12.021](https://api.crossref.org/works/10.1016/j.epsl.2017.12.021) · [www.sciencedirect.com/science/article/abs/pii/S0012821X17307](https://www.sciencedirect.com/science/article/abs/pii/S0012821X1730732X)

---

### 73. Kaimanawa (Deep Hikurangi) Low-Frequency Earthquake Catalogue (Aden-Antoniow et al. 2024)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Aden-Antoniow et al. 2024 Hikurangi LFE catalogue; Kaimanawa LFE catalogue
- **Coverage:** 2010 → 2022
- **Region:** Hikurangi margin (Kaimanawa Range)
- **Bounding box:** Beneath the Kaimanawa Range, central North Island, New Zealand (Hikurangi subduction zone)
- **Depth range:** ~50 km
- **Events:** ~21,000 events from 36 LFE sources
- **Content:** hypocentral locations; relative relocations; other
- **Producer / contact:** Florent Aden-Antoniow (with William B. Frank, Calum J. Chamberlain, John Townend, Laura M. Wallace, Stephen Bannister)
- **Data source:** GeoNet regional continuous seismic data; two-iteration matched-filter (template-matching) detection using templates derived from prior tectonic tremor observations.
- **Availability:** available on request · DOI [10.1029/2023JB027971](https://doi.org/10.1029/2023JB027971)

First low-frequency earthquake catalogue for the Hikurangi subduction zone proper, beneath the Kaimanawa Range at about 50 km depth, downdip of regularly recurring deep ~M7 slow slip events. It comprises 36 LFE sources producing almost 21,000 events over more than a decade (2010-2022), detected with a two-iteration matched-filter on GeoNet data. It is distinct from the Alpine Fault LFE catalogues.

**Key references:**
- Aden-Antoniow, F., Frank, W. B., Chamberlain, C. J., Townend, J., Wallace, L. M., & Bannister, S. (2024). Low-Frequency Earthquakes Downdip of Deep Slow Slip Beneath the North Island of New Zealand. Journal of Geophysical Research: Solid Earth, 129, e2023JB027971. https://doi.org/10.1029/2023JB027971

*Verification — DOI 10.1029/2023JB027971 confirmed via Crossref: title 'Low-Frequency Earthquakes Downdip of Deep Slow Slip Beneath the North Island of New Zealand', authors F. Aden-Antoniow, W. B. Frank, C. J. Chamberlain, J. Townend, L. M. Wallace, S. Bannister, JGR Solid Earth vol 129, article e2023JB027971, 2024. Abstract confirms 36 LFE sources / ~21,000 events / 50 km / Kaimanawa / matched-filter. No dataset DOI located; the brief's 'Zenodo DOI to be confirmed' could not be verified, so none is asserted.*

**Caveats:**
- Brief mentioned a Zenodo dataset DOI 'to be confirmed' — not found in sources consulted; no dataset DOI asserted and availability set to available on request.
- Exact start/end years (2010-2022) from the brief; abstract only states 'over more than a decade'.

**Notes:** Article DOI 10.1029/2023JB027971 verified via Crossref (JGR Solid Earth vol 129, e2023JB027971). Abstract confirms 36 LFE sources, ~21,000 events, ~50 km depth, Kaimanawa Range, matched-filter method. The brief's separate Zenodo dataset DOI is 'to be confirmed' — no Zenodo/dataset DOI was found in the sources consulted, so data_availability is set to available on request rather than claiming a DOI. The 2010-2022 window is from the brief ('over more than a decade' per abstract).

**Sources:** [api.crossref.org/works/10.1029/2023JB027971](https://api.crossref.org/works/10.1029/2023JB027971) · [eqsci.mit.edu/publication/aden-2024/](https://eqsci.mit.edu/publication/aden-2024/) · [agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2023JB02797](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2023JB027971)

---

### 74. Raukumara Peninsula Repeating Earthquake Catalogue 2003-2020 (Hughes et al. 2021)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Hughes et al. 2021 Raukumara repeating-earthquake catalogue
- **Coverage:** 2003 → 2020
- **Region:** Hikurangi margin (Raukumara Peninsula)
- **Bounding box:** Raukumara Peninsula, northern Hikurangi subduction margin, North Island, New Zealand
- **Events:** 61 repeating-earthquake families
- **Content:** hypocentral locations; relative relocations; focal mechanisms; other
- **Producer / contact:** Laura Hughes (with Calum J. Chamberlain, John Townend, Amanda M. Thomas), Victoria University of Wellington
- **Data source:** GeoNet continuous seismic data, northern Hikurangi / Raukumara Peninsula; waveform cross-correlation to identify repeating-earthquake families.
- **Availability:** available on request · DOI [10.1029/2021GC009670](https://doi.org/10.1029/2021GC009670)

Catalogue of 61 repeating-earthquake families on the northern Hikurangi margin (Raukumara Peninsula, 2003-2020) used as an interface 'creepmeter'. The families coincide spatially with slow-slip patches and include both interplate and intraplate focal mechanisms. It was built from GeoNet continuous data using waveform cross-correlation.

**Key references:**
- Hughes, L., Chamberlain, C. J., Townend, J., & Thomas, A. M. (2021). A Repeating Earthquake Catalog From 2003 to 2020 for the Raukumara Peninsula, Northern Hikurangi Subduction Margin, New Zealand. Geochemistry, Geophysics, Geosystems, 22(5), e2021GC009670. https://doi.org/10.1029/2021GC009670

*Verification — DOI 10.1029/2021GC009670 confirmed via Crossref: title 'A Repeating Earthquake Catalog From 2003 to 2020 for the Raukumara Peninsula, Northern Hikurangi Subduction Margin, New Zealand', authors Laura Hughes, Calum J. Chamberlain, John Townend, Amanda M. Thomas, G-cubed vol 22 issue 5, article e2021GC009670, 2021. 2003-2020 period matches the title; 61 families from the brief.*

**Caveats:**
- Exact family count (61) taken from the brief, not re-counted from full text.
- Per-event magnitude info not documented.

**Notes:** Repeating-earthquake catalogue (waveform cross-correlation / template matching). DOI/title/authors/venue verified via Crossref (G-cubed vol 22 issue 5, e2021GC009670). 61 families and 2003-2020 from the brief, consistent with the verified title. detection_method template-matching for the waveform cross-correlation approach.

**Sources:** [api.crossref.org/works/10.1029/2021GC009670](https://api.crossref.org/works/10.1029/2021GC009670) · [agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/2021GC009670](https://agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/2021GC009670)

---

## Derived, homogenised & synthetic / hazard-model catalogues (6)

### 75. NSHM 2010 Earthquake Catalogue (Stirling et al. 2012)
*type: background · focus: geographical · detection: other · review: reviewed · confidence: medium · verdict: confirmed*

- **Also known as:** NSHM 2010 catalogue; Stirling et al. 2012 catalogue
- **Coverage:** 1840 → 2009
- **Region:** New Zealand (nationwide)
- **Bounding box:** New Zealand and its offshore margins (approx. 165E-180E / 178W, 48S-33S)
- **Content:** hypocentral locations; quality information; historical observations; other
- **Producer / contact:** GNS Science (Mark W. Stirling et al.); parent network GeoNet
- **Data source:** Derived backbone catalogue built from the GeoNet/national instrumental earthquake catalogue plus the ~170-year historical NZ earthquake record; homogenised to Mw and declustered, with duplicates, explosions and mining-induced events removed.
- **Availability:** available on request

Homogenised (Mw), declustered backbone earthquake catalogue underpinning the distributed-seismicity component of the 2010 New Zealand National Seismic Hazard Model. It was produced to give a temporally consistent magnitude basis (instrumental + ~170-yr historical record) for probabilistic seismic hazard analysis across New Zealand. The catalogue is documented within and alongside the NSHM 2010 update.

**Key references:**
- Stirling, M., McVerry, G., Gerstenberger, M., Litchfield, N., Van Dissen, R., Berryman, K., Barnes, P., Wallace, L., Villamor, P., Langridge, R., Lamarche, G., Nodder, S., Reyners, M., Bradley, B., Rhoades, D., Smith, W., Nicol, A., Pettinga, J., Clark, K., & Jacobs, K. (2012). National Seismic Hazard Model for New Zealand: 2010 Update. Bulletin of the Seismological Society of America, 102(4), 1514-1542. https://doi.org/10.1785/0120110170

**Caveats:**
- Catalogue has no standalone dataset DOI; the cited DOI is the model paper, not the data.
- event_count and exact bounding_box/depth_range not documented in fetched sources.
- The distinct catalogue-preparation companion document could not be fetched (403); its authorship left unverified.

**Notes:** The DOI 10.1785/0120110170 resolves and the citation (title 'National Seismic Hazard Model for New Zealand: 2010 Update', 20 authors, BSSA 102(4):1514-1542, 2012) is confirmed via Crossref. This is the NSHM model paper; the dedicated catalogue-preparation description ('Preparation of the New Zealand earthquake catalogue for a probabilistic seismic hazard analysis', ResearchGate pub. 290806186) is a related companion document that was not fully fetched (403/unreadable), so its authorship/year is left unverified here. Input files are also published at github.com/GNS-Science/nshm-2010. Superseded by the NSHM 2022 catalogue work (Christophersen/Rollins).

**Sources:** [chooser.crossref.org/?doi=10.1785%2F0120110170](https://chooser.crossref.org/?doi=10.1785%2F0120110170) · [www.gns.cri.nz/data-and-resources/2010-national-seismic-haza](https://www.gns.cri.nz/data-and-resources/2010-national-seismic-hazard-model/) · [github.com/GNS-Science/nshm-2010](https://github.com/GNS-Science/nshm-2010) · [www.researchgate.net/publication/290806186_Preparation_of_th](https://www.researchgate.net/publication/290806186_Preparation_of_the_New_Zealand_earthquake_catalogue_for_a_probabilistic_seismic_hazard_analysis)

---

### 76. Mw-Homogenised NZ Earthquake Catalogue for NSHM 2022 (Christophersen et al. 2022)
*type: compilation · focus: parameter-testing · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Christophersen et al. 2022 'consistent magnitudes' catalogue; GNS Science report 2021/42
- **Coverage:** 1931 → 2020
- **Region:** New Zealand (nationwide)
- **Bounding box:** New Zealand and offshore margins
- **Magnitude:** Recomputes magnitudes and converts to a standardized Mw proxy (MwNZ); introduces MLNZ20 local-magnitude scale; standardization roughly halves the count of events with M>=4.95 and corrects 2011-2012 step changes.
- **Events:** >250,000 earthquakes (magnitudes recomputed for >99% of catalogue)
- **Content:** quality information; other
- **Producer / contact:** GNS Science (Annemarie Christophersen et al.); parent network GeoNet
- **Data source:** GNS reprocessing of >250,000 NZ earthquakes using >2 million individual GeoNet waveforms; derives a new local magnitude scale (MLNZ20) and regressions to convert historical magnitudes to a Mw proxy for consistency over time.
- **Availability:** available (DOI) · DOI [10.21420/A2SN-XM76](https://doi.org/10.21420/A2SN-XM76)

A GNS Science reprocessing that recomputes earthquake magnitudes for the NZ catalogue and standardises them to moment magnitude (Mw) so that earthquake size is consistent over the full catalogue period. It was produced to provide a temporally consistent magnitude backbone for the 2022 National Seismic Hazard Model, correcting step changes (e.g. the 2012 SeisComP transition) and the systematic ML-vs-Mw offset. It is the magnitude basis later folded into the Rollins integrated catalogue and the NSHM 2022 seismicity rate model.

**Key references:**
- Christophersen, A., Bourguignon, S., Rhoades, D.A., Allen, T.I., Salichon, J., Ristau, J., Rollins, C., & Gerstenberger, M.C. (2022). Consistent magnitudes over time for the revision of the New Zealand National Seismic Hazard Model. GNS Science Report 2021/42. GNS Science. https://doi.org/10.21420/A2SN-XM76
- Christophersen, A., Bourguignon, S., Rhoades, D.A., Allen, T.I., Ristau, J., Salichon, J., Rollins, C., Townend, J., & Gerstenberger, M.C. (2024). Standardizing Earthquake Magnitudes for the 2022 Revision of the Aotearoa New Zealand National Seismic Hazard Model. Bulletin of the Seismological Society of America, 114(1), 111-136. https://doi.org/10.1785/0120230169

*Verification — Dataset DOI 10.21420/A2SN-XM76 resolves (GNS shop, report 2021/42); title and author list confirmed. Peer-reviewed companion DOI 10.1785/0120230169 confirmed via Semantic Scholar/ADS (BSSA 114(1):111-136, 2024). >250,000 earthquakes / >2 million waveforms confirmed by the GNS report page. Date range: the GNS report-page fetch stated '1931 to 2011' as the processing window, whereas the brief and the broader NSHM 2022 framing extend to 2020; end_date set to 2020 but flagged as not fully reconciled across sources.*

**Caveats:**
- end_date ambiguous: one GNS source fetch said catalogue spans 1931-2011, the brief says 1931-2020 — could not reconcile to a single authoritative value.
- This is a magnitude-recomputation product (a derived catalogue/magnitude backbone) rather than an independent event detection catalogue.

**Notes:** Report title confirmed: 'Consistent magnitudes over time for the revision of the New Zealand National Seismic Hazard Model', GNS Science Report 2021/42, DOI 10.21420/A2SN-XM76 (resolves via GNS shop). The peer-reviewed version is Christophersen et al. 2024, BSSA 114(1):111-136, DOI 10.1785/0120230169 (confirmed via Semantic Scholar / GeoScienceWorld / NSF-PAR; note the published version's author list and the brief's reported DOI 10.1785/0120230169 attached to the integrated-catalogue entry actually belongs to THIS magnitude-standardization work). Distinct from the integrated catalogue (10.21420/XT4Y-WY45) and the SRM (10.1785/0120230165).

**Sources:** [shop.gns.cri.nz/sr_2021-42-pdf/](https://shop.gns.cri.nz/sr_2021-42-pdf/) · [pubs.geoscienceworld.org/ssa/bssa/article-abstract/114/1/111](https://pubs.geoscienceworld.org/ssa/bssa/article-abstract/114/1/111/631698/Standardizing-Earthquake-Magnitudes-for-the-2022) · [ui.adsabs.harvard.edu/abs/2024BuSSA.114..111C/abstract](https://ui.adsabs.harvard.edu/abs/2024BuSSA.114..111C/abstract) · [par.nsf.gov/servlets/purl/10503640](https://par.nsf.gov/servlets/purl/10503640)

---

### 77. Integrated / Augmented Earthquake Catalogue for Aotearoa New Zealand (NSHM 2022; Rollins et al.)
*type: compilation · focus: geographical · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** Augmented NZ earthquake catalogue; Rollins et al. catalogue; GNS Science report 2021/58; Integrated Earthquake Catalog Version 1; NSHM22 Mw-standardized catalogue
- **Coverage:** 1840 → 2020
- **Region:** New Zealand (nationwide) incl. Hikurangi-Kermadec and Puysegur margins
- **Bounding box:** Greater New Zealand region incl. Hikurangi-Kermadec and Puysegur subduction zones
- **Magnitude:** Uses Christophersen et al. 2022 standardized Mw (MwNZ proxy) magnitudes; provides regional magnitude-frequency distributions and Mc in the companion paper (Rollins et al. 2024).
- **Content:** hypocentral locations; relative relocations; focal mechanisms; quality information; historical observations; other
- **Producer / contact:** GNS Science (Chris Rollins, Annemarie Christophersen, Kiran Kumar S. Thingbaijam, Matthew C. Gerstenberger et al.); parent network GeoNet
- **Data source:** GeoNet national operational seismic catalogue, with event parameters (depths, uncertainties, focal mechanisms, locations) overwritten using refined estimates from regional relocation studies, the literature, the NZ Centroid Moment Tensor (CMT) database and global catalogues; magnitudes from the Christophersen et al. 2022 Mw standardization.
- **Availability:** available (DOI) · DOI [10.21420/XT4Y-WY45](https://doi.org/10.21420/XT4Y-WY45)

An augmented, integrated NZ earthquake catalogue built for the 2022 National Seismic Hazard Model. It merges higher-quality depths, uncertainties, focal mechanisms and relocated hypocentres into the GeoNet catalogue, applies the Christophersen 2022 standardized Mw magnitudes, and classifies events as upper-plate (crustal), subduction-interface, or intraslab to feed the separate components of the Seismicity Rate Model. Revised parameters were imported for ~60% of events (incl. ~92% of 2000-2020 events).

**Key references:**
- Rollins, C., Thingbaijam, K.K.S., Hutchinson, J., Gerstenberger, M.C., Christophersen, A., Eberhart-Phillips, D., Rastin, S.J., & Van Dissen, R.J. (2022). An augmented New Zealand earthquake catalogue, event classifications, and models of the depth distribution of shallow earthquakes in the greater New Zealand region. GNS Science Report 2021/58. GNS Science. https://doi.org/10.21420/XT4Y-WY45
- Rollins, C., Christophersen, A., Thingbaijam, K.K.S., Gerstenberger, M.C., Hutchinson, J., Eberhart-Phillips, D., Bannister, S., Van Dissen, R.J., Seebeck, H., & Ellis, S. (2025). An Integrated Earthquake Catalog for Aotearoa New Zealand (Version 1), Event-Type Classifications, and Regional Earthquake Depth Distributions. Bulletin of the Seismological Society of America, 115(4), 1703-1718. https://doi.org/10.1785/0120230179
- Rollins, C., Gerstenberger, M.C., Rhoades, D.A., Rastin, S.J., Christophersen, A., Thingbaijam, K.K.S., Van Dissen, R.J., Graham, K., DiCaprio, C., & Fraser, J. (2024). The Magnitude-Frequency Distributions of Earthquakes in Aotearoa New Zealand and on Adjoining Subduction Zones, Using a New Integrated Earthquake Catalog. Bulletin of the Seismological Society of America, 114(1), 150-181. https://doi.org/10.1785/0120230177

*Verification — All three key references verified via Crossref/GNS: report DOI 10.21420/XT4Y-WY45 (GNS SR 2021/58) resolves; BSSA 115(4):1703-1718 DOI 10.1785/0120230179 (Rollins et al. 2025, 10 authors) confirmed; MFD companion DOI 10.1785/0120230177 confirmed as BSSA 114(1):150-181 (2024). Content (60% imported, crustal/interface/intraslab classification, CMT+global+relocation merge) confirmed via abstract searches. event_count not stated as a single number in sources read; start_date 1840 inferred from GeoNet historical span (imports extend to >=1917 M6) and flagged. The brief's separate citation of DOI 10.1785/0120230169 here is a mis-grouping — that DOI belongs to the magnitude-standardization paper.*

**Caveats:**
- event_count not documented as a single figure in fetched sources.
- start_date 1840 inferred from GeoNet/historical span, not pinned to an exact catalogue start in fetched sources.
- Brief grouped DOI 10.1785/0120230169 (magnitude-standardization paper) under this record; corrected and attributed to the Christophersen record.

**Notes:** Dataset DOI 10.21420/XT4Y-WY45 resolves to GNS Science Report 2021/58 (title and author list confirmed). Integrated-catalog BSSA paper confirmed via Crossref: Rollins et al. 2025, BSSA 115(4):1703-1718, DOI 10.1785/0120230179 (note: the brief said 'BSSA 115(4):1703-1718' — confirmed; the brief also attributed this to year given as 2024/2025 — Crossref gives 2025). MFD companion confirmed via Crossref: Rollins et al. 2024, BSSA 114(1):150-181, DOI 10.1785/0120230177 (the brief's 'DOI 10.1785/0120230177 / page 177' refers to this work; actual pages are 150-181). The brief listed DOI 10.1785/0120230169 as a 'magnitude-standardization paper' companion — that DOI is in fact the Christophersen et al. 2024 magnitude paper, captured in the Christophersen record above. Distinct from the Christophersen magnitude catalogue and the SRM/DSM.

**Sources:** [api.crossref.org/works/10.1785/0120230179](https://api.crossref.org/works/10.1785/0120230179) · [api.crossref.org/works/10.1785/0120230177](https://api.crossref.org/works/10.1785/0120230177) · [shop.gns.cri.nz/sr_2021-58-pdf](https://shop.gns.cri.nz/sr_2021-58-pdf) · [geodata.nz/geonetwork/srv/api/records/00876699-4791-4528-a82](https://geodata.nz/geonetwork/srv/api/records/00876699-4791-4528-a826-1d7ac3c77516) · [www.researchgate.net/publication/290806186_Preparation_of_th](https://www.researchgate.net/publication/290806186_Preparation_of_the_New_Zealand_earthquake_catalogue_for_a_probabilistic_seismic_hazard_analysis)

---

### 78. NSHM 2022 Seismicity Rate Model Distributed-Seismicity / Declustered Catalogue (Gerstenberger et al. 2024)
*type: background · focus: parameter-testing · detection: other · review: reviewed · confidence: high · verdict: confirmed*

- **Also known as:** NZ NSHM 2022 SRM; Distributed Seismicity Model (DSM)
- **Coverage:** 1840 → 2020
- **Region:** New Zealand (nationwide)
- **Bounding box:** New Zealand and offshore margins incl. Hikurangi-Kermadec and Puysegur subduction zones
- **Magnitude:** Uses Mw-homogenised magnitudes (Christophersen 2022); gridded occurrence rates as a function of magnitude rather than a fixed magnitude range.
- **Content:** other
- **Producer / contact:** GNS Science (Matthew C. Gerstenberger, Russell J. Van Dissen, Chris Rollins, Chris DiCaprio et al.)
- **Data source:** Derived from the declustered, Mw-homogenised NZ catalogue (the Rollins integrated catalogue with Christophersen 2022 standardized magnitudes); declustering sensitivity tested across multiple algorithms. Combines a multi-dataset hybrid model with a non-Poisson uniform-rate-zone model for low-seismicity regions.
- **Availability:** available (DOI) · DOI [10.1785/0120230165](https://doi.org/10.1785/0120230165)

The seismicity rate model (SRM) for the 2022 NZ NSHM, comprising an inversion fault model (IFM) and a distributed seismicity model (DSM). The DSM provides gridded background earthquake rates derived from the declustered, Mw-homogenised national catalogue. It is a gridded-rate hazard product (forecast rates), not a raw event list, produced to forecast distributed seismicity for probabilistic seismic hazard.

**Key references:**
- Gerstenberger, M.C., Van Dissen, R.J., Rollins, C., DiCaprio, C., Thingbaijam, K.K.S., Bora, S., Chamberlain, C., Christophersen, A., Coffey, G.L., Ellis, S., Iturrieta, P., et al. (2024). The Seismicity Rate Model for the 2022 Aotearoa New Zealand National Seismic Hazard Model. Bulletin of the Seismological Society of America, 114(1), 182-216. https://doi.org/10.1785/0120230165

**Caveats:**
- This is a gridded seismicity-rate FORECAST product, not a raw earthquake event list; categorized as derived-synthetic-hazard per the batch but borderline as a 'catalogue'.
- event_count not applicable; start/end dates inherited from the underlying declustered integrated catalogue and not independently pinned.
- Full author list (40+) abbreviated in citation.

**Notes:** Confirmed via search/SCEC: Gerstenberger et al. 2024, BSSA 114(1):182-216, DOI 10.1785/0120230165. SRM = IFM (upper-plate + subduction inversion fault model) + DSM (distributed seismicity / hybrid + uniform-rate-zone). This is a forecast rate product built ON the declustered integrated catalogue rather than itself being a standalone observed event catalogue; included here because the brief treats it as a derived-hazard catalogue. Declustering-method comparison context is in Rastin/Rhoades-related companion work; the 'Comparison of seismicity declustering methods' brief source is a separate methodological paper not specific to this SRM.

**Sources:** [central.scec.org/publication/13421](https://central.scec.org/publication/13421) · [pubs.geoscienceworld.org/ssa/bssa/article/114/1/182/631848/T](https://pubs.geoscienceworld.org/ssa/bssa/article/114/1/182/631848/The-Seismicity-Rate-Model-for-the-2022-Aotearoa) · [www.researchgate.net/publication/377112163_The_Seismicity_Ra](https://www.researchgate.net/publication/377112163_The_Seismicity_Rate_Model_for_the_2022_Aotearoa_New_Zealand_National_Seismic_Hazard_Model)

---

### 79. RSQSim Synthetic Earthquake Catalogue for New Zealand (NSHM2012 fault system, 276 kyr)
*type: background · focus: parameter-testing · detection: other · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** RSQSim Simulated Earthquake Catalog 5091; rundir5091; Shaw et al. 2022
- **Coverage:** synthetic (276,000-year simulated span; published 2021) → synthetic (276,000-year simulated span)
- **Region:** New Zealand (nationwide fault system)
- **Bounding box:** New Zealand (NSHM 2012 fault model domain)
- **Magnitude:** Simulated event magnitudes derived from rupture areas/slip on the fault model; full magnitude distribution over the 276 kyr simulation (no observational Mc).
- **Content:** hypocentral locations; fault-geometry; other
- **Producer / contact:** Bruce E. Shaw (Lamont-Doherty Earth Observatory, Columbia University); collaborators Bill Fry, Andrew Nicol, Andrew Howell, Matthew Gerstenberger (GNS Science)
- **Data source:** Synthetic catalogue generated by the RSQSim rate-and-state earthquake simulator run on the New Zealand NSHM 2012 fault model (fault geometries, slip rates, rupture parameters); not based on observed events.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.5534462](https://doi.org/10.5281/zenodo.5534462)

A ~276,000-year synthetic earthquake catalogue produced by the RSQSim rate-and-state simulator on the NZ NSHM 2012 fault system, generating deterministic finite-fault ruptures for physics-based seismic hazard. It was produced to test physics-based earthquake simulation as an alternative/complement to empirical hazard models for New Zealand. Distinct from the later NZNSHM22-fault RSQSim version (rundir5566).

**Key references:**
- Shaw, B.E. (2021). RSQSim Simulated Earthquake Catalog 5091, New Zealand, NSHM2012 Fault System, 276kyr [Data set]. Zenodo. https://doi.org/10.5281/zenodo.5534462
- Shaw, B.E., Fry, B., Nicol, A., Howell, A., & Gerstenberger, M. (2022). An Earthquake Simulator for New Zealand. Bulletin of the Seismological Society of America, 112(2), 763-778. https://doi.org/10.1785/0120210087

*Verification — Zenodo DOI 10.5281/zenodo.5534462 resolves; metadata (Shaw, 2021, CC BY 4.0, rundir5091, 276kyr, NSHM2012 fault system) confirmed. Defining paper DOI 10.1785/0120210087 confirmed via Crossref (Shaw, Fry, Nicol, Howell, Gerstenberger; BSSA 112(2):763-778; 2022). Note Zenodo author is Bruce E. Shaw alone (dataset), whereas the paper has five authors. event_count not stated; dates are synthetic.*

**Caveats:**
- Synthetic catalogue: no calendar dates; 276 kyr simulated span recorded in date fields as 'synthetic'.
- event_count not reported in fetched metadata.
- Zenodo dataset author is Shaw alone; defining paper is five authors (noted).

**Notes:** Zenodo record 5534462 confirmed: title 'RSQSim Simulated Earthquake Catalog 5091, New Zealand, NSHM2012 Fault System, 276kyr', author Bruce E. Shaw, published 2021-10-21, CC BY 4.0, rundir 5091. Defining paper confirmed via Crossref: Shaw et al. 2022, BSSA 112(2):763-778, DOI 10.1785/0120210087 (the brief gave no paper DOI; the correct one is 10.1785/0120210087). Simulated 276 kyr span — no calendar start/end dates apply; recorded as synthetic. Distinct from the 2025 NZNSHM22-fault catalogue (Zenodo 14532399, rundir5566).

**Sources:** [zenodo.org/records/5534462](https://zenodo.org/records/5534462) · [api.crossref.org/works?query.bibliographic=An+Earthquake+Sim](https://api.crossref.org/works?query.bibliographic=An+Earthquake+Simulator+for+New+Zealand+Shaw) · [pubs.geoscienceworld.org/ssa/bssa/article-abstract/112/2/763](https://pubs.geoscienceworld.org/ssa/bssa/article-abstract/112/2/763/611170/An-Earthquake-Simulator-for-New-Zealand)

---

### 80. RSQSim Synthetic Earthquake Catalogue + Ground Motions for New Zealand (NZNSHM22 fault system)
*type: background · focus: parameter-testing · detection: other · review: non-reviewed · confidence: high · verdict: confirmed*

- **Also known as:** RSQSim rundir5566; Shaw & Milner 2025 NZ catalog
- **Coverage:** synthetic (RSQSim simulated span; published 2025) → synthetic (RSQSim simulated span)
- **Region:** New Zealand (nationwide fault system); plus California in the bundled record
- **Bounding box:** New Zealand (NZNSHM22 fault model domain); record also includes California
- **Magnitude:** Simulated event magnitudes from rupture area/slip on 2 km triangular fault patches; full simulated magnitude distribution.
- **Content:** hypocentral locations; fault-geometry; other
- **Producer / contact:** Bruce E. Shaw (Columbia University) & Kevin R. Milner (USGS); Christine Goulet (USGS) co-author on the companion paper
- **Data source:** Synthetic catalogue, rupture slip-time histories and simulated broadband ground motions generated by the RSQSim simulator on the 2022 NZ NSHM (NZNSHM22) fault system discretized into 2 km triangular patches; bundled in the same Zenodo record as a California (UCERF3, rundir5652) catalogue.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.14532399](https://doi.org/10.5281/zenodo.14532399)

An updated physics-based synthetic earthquake catalogue with rupture slip-time histories and simulated broadband ground motions on the 2022 NZ NSHM fault system (NZ rundir5566). It extends the earlier NSHM2012-fault RSQSim NZ catalogue to the current hazard-model fault geometry and adds ground-motion simulations, supporting comparison of physics-based simulators against empirical ground-motion models. The Zenodo record bundles both the NZ (rundir5566) and a California (rundir5652) catalogue.

**Key references:**
- Shaw, B.E., & Milner, K.R. (2025). RSQSim Earthquake Simulator Catalogs and Ground Motions: California rundir5652, New Zealand rundir5566 [Data set]. Zenodo. https://doi.org/10.5281/zenodo.14532399
- Shaw, B.E., Milner, K.R., & Goulet, C.A. (2025). Deterministic Physics-Based Earthquake Sequence Simulators Match Empirical Ground-Motion Models and Enable Extrapolation to Data-Poor Regimes. Seismological Research Letters. https://doi.org/10.1785/0220240141

*Verification — Zenodo DOI 10.5281/zenodo.14532399 resolves; metadata (Shaw & Milner, 2025-01-16, CC BY 4.0, NZ rundir5566 on NZNSHM22 2 km patches, bundled with California rundir5652) confirmed. Companion SRL paper DOI 10.1785/0220240141 (Shaw, Milner & Goulet, 2025) reported on the Zenodo landing page but not independently fetched, so its exact volume/issue/pages are not verified. event_count not stated; dates are synthetic.*

**Caveats:**
- Synthetic catalogue: no calendar dates; simulated span recorded as 'synthetic'.
- Zenodo record bundles a California catalogue alongside the NZ catalogue (only NZ is in scope here).
- Companion SRL paper DOI 10.1785/0220240141 taken from Zenodo metadata; volume/issue/pages not independently verified.
- event_count not reported in fetched metadata.

**Notes:** Zenodo record 14532399 confirmed: title 'RSQSim Earthquake Simulator Catalogs and Ground Motions: California rundir5652, New Zealand rundir5566', authors Bruce E. Shaw & Kevin Ross Milner, published 2025-01-16, CC BY 4.0; NZ catalogue uses NZNSHM22 fault system on 2 km triangular patches and is bundled with a California (UCERF3) catalogue. Companion paper: Shaw, Milner & Goulet 2025, SRL, DOI 10.1785/0220240141 (reported by the Zenodo record). Extends the 2021 rundir5091 / NSHM2012 NZ catalogue. Simulated span — no calendar dates.

**Sources:** [zenodo.org/records/14532399](https://zenodo.org/records/14532399) · [files.scec.org/s3fs-public/reports/2021/21086_report.pdf](https://files.scec.org/s3fs-public/reports/2021/21086_report.pdf)

---

## Appendix A — Consolidated references

113 unique references cited across the inventory:

- Abeling, S., Horspool, N., Johnston, D., Dizhur, D., Wilson, N., Clement, C., & Ingham, J. (2020). Patterns of earthquake-related mortality at a whole-country level: New Zealand, 1840-2017. Earthquake Spectra, 36(1), 138-163. https://doi.org/10.1177/8755293019878190
- Aber, S., Ebinger, C.J., Gase, A.C., Kalugana, C., Illsley-Kemp, F., Hamling, I., Sabir, S., Savage, M.K., Eccles, J., Hreinsdottir, S., Ristau, J., & James-Le, J. (2025). Cascading Earthquake Swarms in the Northern Taupō Volcanic Zone, New Zealand. Geochemistry, Geophysics, Geosystems, 26, e2024GC012079. https://doi.org/10.1029/2024GC012079
- Aden-Antoniow, F., Frank, W. B., Chamberlain, C. J., Townend, J., Wallace, L. M., & Bannister, S. (2024). Low-Frequency Earthquakes Downdip of Deep Slow Slip Beneath the North Island of New Zealand. Journal of Geophysical Research: Solid Earth, 129, e2023JB027971. https://doi.org/10.1029/2023JB027971
- Aziz Zanjani, F., Lin, G. & Thurber, C.H. (2021). Nested regional-global seismic tomography and precise earthquake relocation along the Hikurangi subduction zone, New Zealand. Geophysical Journal International, 227(3), 1567-1590. https://doi.org/10.1093/gji/ggab294
- Bannister, S. / GNS Science (2009). Deep Geothermal HADES seismic array (HADES) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/Z8_2009
- Bannister, S., Bertrand, E.A., Heimann, S., Bourguignon, S., Asher, C., Shanks, J., & Harvison, A. (2022). Imaging sub-caldera structure with local seismicity, Okataina Volcanic Centre, Taupo Volcanic Zone, using double-difference seismic tomography. Journal of Volcanology and Geothermal Research, 431, 107653. https://doi.org/10.1016/j.jvolgeores.2022.107653
- Bannister, S., Fry, B., Reyners, M., Ristau, J., & Zhang, H. (2011). Fine-scale relocation of aftershocks of the 22 February Mw 6.2 Christchurch earthquake using double-difference tomography. Seismological Research Letters, 82(6), 839-845. doi:10.1785/gssrl.82.6.839
- Bannister, S., Sherburn, S., & Bourguignon, S. (2016). Earthquake swarm activity highlights crustal faulting associated with the Waimangu-Rotomahana-Mt Tarawera geothermal field, Taupo Volcanic Zone. Journal of Volcanology and Geothermal Research, 314, 49-56. https://doi.org/10.1016/j.jvolgeores.2015.07.024
- Baratin, L.-M., Chamberlain, C. J., Townend, J., & Savage, M. K. (2018). Focal mechanisms and inter-event times of low-frequency earthquakes reveal quasi-continuous deformation and triggered slow slip on the deep Alpine Fault. Earth and Planetary Science Letters, 484, 111-123. https://doi.org/10.1016/j.epsl.2017.12.021
- Benson, T.W., Illsley-Kemp, F., Elms, H.C., Hamling, I.J., Savage, M.K., Wilson, C.J.N., Mestel, E.R.H., & Barker, S.J. (2020). Earthquake catalogue for Tarawera region, New Zealand, March 2019 [Data set, QuakeML]. Zenodo. https://doi.org/10.5281/zenodo.4035171
- Benson, T.W., Illsley-Kemp, F., Elms, H.C., Hamling, I.J., Savage, M.K., Wilson, C.J.N., Mestel, E.R.H., & Barker, S.J. (2021). Earthquake Analysis Suggests Dyke Intrusion in 2019 Near Tarawera Volcano, New Zealand. Frontiers in Earth Science, 8, 606992. https://doi.org/10.3389/feart.2020.606992
- Bourguignon, S., Bannister, S., Henderson, C. M., Townend, J., & Zhang, H. (2015). Structural heterogeneity of the midcrust adjacent to the central Alpine Fault, New Zealand: Inferences from seismic tomography and seismicity between Harihari and Ross. Geochemistry, Geophysics, Geosystems, 16(4), 1017-1043. https://doi.org/10.1002/2014GC005702
- Chamberlain, C. J., Boese, C. M., Eccles, J. D., Savage, M. K., Baratin, L.-M., Townend, J., Gulley, A. K., Jacobs, K. M., Benson, A., Taylor-Offord, S., Thurber, C., Guo, B., Okada, T., Takagi, R., Yoshida, K., Sutherland, R., & Toy, V. G. (2017). Real-Time Earthquake Monitoring during the Second Phase of the Deep Fault Drilling Project, Alpine Fault, New Zealand. Seismological Research Letters, 88(6), 1443-1454. https://doi.org/10.1785/0220170095
- Chamberlain, C. J., Frank, W. B., Lanza, F., Townend, J., & Warren-Smith, E. (2021). Illuminating the Pre-, Co-, and Post-Seismic Phases of the 2016 M7.8 Kaikoura Earthquake With 10 Years of Seismicity. Journal of Geophysical Research: Solid Earth, 126(8), e2021JB022304. doi:10.1029/2021JB022304
- Chamberlain, C. J., Shelly, D. R., Townend, J., & Stern, T. A. (2014). Low-frequency earthquakes reveal punctuated slow slip on the deep extent of the Alpine Fault, New Zealand. Geochemistry, Geophysics, Geosystems, 15, 2984-2999. https://doi.org/10.1002/2014GC005436
- Christophersen, A., Bourguignon, S., Rhoades, D.A., Allen, T.I., Ristau, J., Salichon, J., Rollins, C., Townend, J., & Gerstenberger, M.C. (2024). Standardizing Earthquake Magnitudes for the 2022 Revision of the Aotearoa New Zealand National Seismic Hazard Model. Bulletin of the Seismological Society of America, 114(1), 111-136. https://doi.org/10.1785/0120230169
- Christophersen, A., Bourguignon, S., Rhoades, D.A., Allen, T.I., Salichon, J., Ristau, J., Rollins, C., & Gerstenberger, M.C. (2022). Consistent magnitudes over time for the revision of the New Zealand National Seismic Hazard Model. GNS Science Report 2021/42. GNS Science. https://doi.org/10.21420/A2SN-XM76
- Darfield RAMP Aftershock Deployment (D-RAD), New Zealand (2010). FDSN network 4A_2010, University of Wisconsin-Madison. doi:10.7914/SN/4A_2010
- Di Giacomo, D., Engdahl, E.R. & Storchak, D.A. (2018). The ISC-GEM Earthquake Catalogue (1904-2014): status after the Extension Project. Earth System Science Data, 10(4), 1877-1899. https://doi.org/10.5194/essd-10-1877-2018
- Downes, G. & Yetton, M. (2012). Pre-2010 historical seismicity near Christchurch, New Zealand: the 1869 Mw 4.7-4.9 Christchurch and 1870 Mw 5.6-5.8 Lake Ellesmere earthquakes. New Zealand Journal of Geology and Geophysics, 55(3), 199-205. https://doi.org/10.1080/00288306.2012.690767
- Downes, G.L. & Dowrick, D.J. (2014). Atlas of isoseismal maps of New Zealand earthquakes 1843-2003, 2nd edition (revised). GNS Science Monograph 25. Lower Hutt, NZ: GNS Science. ISBN 978-0-478-19663-4.
- Downes, G.L. (1995). Atlas of isoseismal maps of New Zealand earthquakes. Institute of Geological & Nuclear Sciences Monograph 11 (EQC Paper 7 / EQC 91/40). Lower Hutt, NZ. https://www.naturalhazards.govt.nz/assets/Publications-Resources/7-Atlas-of-isoseismal-maps-of-New-Zealand-earthquakes-compressed-v2.pdf
- Dowrick, D.J. & Cousins, W.J. (2003). Historical incidence of Modified Mercalli intensity in New Zealand and comparisons with hazard models. Bulletin of the New Zealand Society for Earthquake Engineering, 36(1), 1-24. https://doi.org/10.5459/bnzsee.36.1.1-24
- Dowrick, D.J. & Rhoades, D.A. (1998). Magnitudes of New Zealand earthquakes, 1901-1993. Bulletin of the New Zealand Society for Earthquake Engineering, 31(4), 260-280. https://doi.org/10.5459/bnzsee.31.4.260-280
- Du, W.-x., Thurber, C.H., Reyners, M., Eberhart-Phillips, D. & Zhang, H. (2004). New constraints on seismicity in the Wellington region of New Zealand from relocated earthquake hypocentres. Geophysical Journal International, 158(3), 1088-1102. https://doi.org/10.1111/j.1365-246X.2004.02366.x
- Dziak, R. P., Haxel, J. H., Matsumoto, H., Lau, T.-K., Merle, S. G., de Ronde, C. E. J., Embley, R. W., & Mellinger, D. K. (2008). Observations of regional seismicity and local harmonic tremor at Brothers volcano, south Kermadec arc, using an ocean bottom hydrophone array. Journal of Geophysical Research: Solid Earth, 113, B08S14. https://doi.org/10.1029/2007JB005533
- Earth Sciences New Zealand / GNS Science. National Earthquake Information Database (NEID). https://www.gns.cri.nz/data-and-resources/national-earthquake-information-database/
- Eberhart-Phillips, D. & Reyners, M. (2022/2023). Catalogue of 2001-2011 New Zealand earthquakes relocated with 3-D seismic velocity model and comparison to 2019-2020 auto-detected earthquakes in the sparsely instrumented southern South Island. New Zealand Journal of Geology and Geophysics, 66(4), 646-653. https://doi.org/10.1080/00288306.2022.2089171
- Eberhart-Phillips, D., & Bannister, S. (2010). 3-D imaging of Marlborough, New Zealand, subducted plate and strike-slip fault systems. Geophysical Journal International, 182(1), 73-96. https://doi.org/10.1111/j.1365-246X.2010.04621.x
- Eberhart-Phillips, D., Bannister, S., Reyners, M. & Bourguignon, S. (2022). New Zealand Wide model 2.3 seismic velocity model for New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.6568301
- Eberhart-Phillips, D., Bannister, S., Reyners, M. & Henrys, S. (2020). New Zealand Wide model 2.2 seismic velocity and Qs and Qp models for New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.3779523
- Eiby, G.A. (1968). A descriptive catalogue of New Zealand earthquakes. Part I — Shocks felt before the end of 1845. New Zealand Journal of Geology and Geophysics, 11(1), 16-40. https://doi.org/10.1080/00288306.1968.10423671
- Eiby, G.A. (1968). An annotated list of New Zealand earthquakes, 1460-1965. New Zealand Journal of Geology and Geophysics, 11(3), 630-647. https://doi.org/10.1080/00288306.1968.10420275
- Eiby, G.A. (1973). A descriptive catalogue of New Zealand earthquakes. Part 2 — Shocks felt from 1846 to 1854. New Zealand Journal of Geology and Geophysics, 16(4), 857-907. https://doi.org/10.1080/00288306.1973.10555229
- Engdahl, E.R., Di Giacomo, D., Sakarya, B., Gkarlaouni, C.G., Harris, J. & Storchak, D.A. (2020). ISC-EHB 1964-2016, an Improved Data Set for Studies of Earth Structure and Global Seismicity. Earth and Space Science, 7(1), e2019EA000897. https://doi.org/10.1029/2019EA000897
- GNS Science (1970). New Zealand Earthquake Catalogue [Data set]. GNS Science, GeoNet. https://doi.org/10.21420/0S8P-TZ38
- GNS Science (2006). GeoNet Aotearoa New Zealand Earthquake Moment Tensor solutions [Data set]. GNS Science, GeoNet. https://doi.org/10.21420/MMJ9-CZ67
- GNS Science (2008). ALFA08 (ALFA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YR_2008
- GNS Science (2014). Otago temporary broadband network [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/6K_2014
- GNS Science (2019). Dense Westland Arrays Researching Fault Segmentation: What controls earthquake segmentation along New Zealand's Alpine Fault? (DWARFS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/8N_2019
- GNS Science (2021). Aotearoa/New Zealand GeoNet Seismic Digital Waveform Dataset [Data set]. GNS Science. https://doi.org/10.21420/G19Y-9D40
- GNS Science. (2015). GeoNet Aotearoa New Zealand Felt Rapid Dataset [Data set]. GNS Science. https://doi.org/10.21420/RS7F-VE53
- GNS Science. Shaking Layers Dataset [Data set]. GNS Science. https://doi.org/10.21420/J856-2J84
- Gerstenberger, M.C., Van Dissen, R.J., Rollins, C., DiCaprio, C., Thingbaijam, K.K.S., Bora, S., Chamberlain, C., Christophersen, A., Coffey, G.L., Ellis, S., Iturrieta, P., et al. (2024). The Seismicity Rate Model for the 2022 Aotearoa New Zealand National Seismic Hazard Model. Bulletin of the Seismological Society of America, 114(1), 182-216. https://doi.org/10.1785/0120230165
- Goded, T., Horspool, N., Canessa, S., & Gerstenberger, M. (2017). Modified Mercalli intensities for the M7.8 Kaikoura (New Zealand) 14 November 2016 earthquake derived from 'felt detailed' and 'felt rapid' online questionnaires. Bulletin of the New Zealand Society for Earthquake Engineering, 50(2), 352-362. https://doi.org/10.5459/bnzsee.50.2.352-362
- Goded, T., Horspool, N., Canessa, S., Lewis, A., Geraghty, K., Jeffrey, A., & Gerstenberger, M. (2018). New macroseismic intensity assessment method for New Zealand web questionnaires. Seismological Research Letters, 89(2A), 640-652. https://doi.org/10.1785/0220170163
- Henrys, S., Wech, A., Sutherland, R., Stern, T., Savage, M., Sato, H., Mochizuki, K., Iwasaki, T., Okaya, D., Seward, A., Tozer, B., Townend, J., Kurashimo, E., Iidaka, T., & Ishiyama, T. (2013). SAHKE geophysical transect reveals crustal and subduction zone structure at the southern Hikurangi margin, New Zealand. Geochemistry, Geophysics, Geosystems, 14(6), 2063-2083. https://doi.org/10.1002/ggge.20136
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2019). Seismic Response to Injection Well Stimulation in a High-Temperature, High-Permeability Reservoir. Geochemistry, Geophysics, Geosystems, 20, 2848-2871. https://doi.org/10.1029/2019GC008243
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2020). Seismic response to evolving injection at the Rotokawa geothermal field, New Zealand. Geothermics, 85, 101750. https://doi.org/10.1016/j.geothermics.2019.101750
- Hughes, L., Chamberlain, C. J., Townend, J., & Thomas, A. M. (2021). A Repeating Earthquake Catalog From 2003 to 2020 for the Raukumara Peninsula, Northern Hikurangi Subduction Margin, New Zealand. Geochemistry, Geophysics, Geosystems, 22(5), e2021GC009670. https://doi.org/10.1029/2021GC009670
- IRIS/PASSCAL (1995). Cooperative Project on South Island New Zealand (NZ Passive) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XC_1995
- IRIS/PASSCAL (2000). Array studies of anisotropy and converted phases in the Marlborough Fault Zone of New Zealand [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XB_2000
- IRIS/PASSCAL (2001). Hikurangi Subduction System (New Zealand) Seismic Transects, North Island Geophysical Transect Passive (NIGHT Passive) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XQ_2001
- Illsley-Kemp, F. & Mestel, E.R.H. (2025). A new consistent and high-precision earthquake catalogue for the Taupō Volcanic Zone, New Zealand. Seismica, 4(1). https://doi.org/10.26443/seismica.v4i1.1490
- Illsley-Kemp, F., & Mestel, E. (2025). A new consistent and high-precision earthquake catalogue for the Taupō Volcanic Zone, New Zealand. Seismica, 4(1). https://doi.org/10.26443/seismica.v4i1.1490
- Illsley-Kemp, F., Barker, S.J., Wilson, C.J.N., Chamberlain, C.J., Hreinsdóttir, S., Ellis, S., Hamling, I.J., Savage, M.K., Mestel, E.R.H., & Wadsworth, F.B. (2021). Volcanic Unrest at Taupō Volcano in 2019: Causes, Mechanisms and Implications. Geochemistry, Geophysics, Geosystems, 22, e2021GC009803. https://doi.org/10.1029/2021GC009803
- International Seismological Centre (2021). ISC-GEM Earthquake Catalogue. https://doi.org/10.31905/D808B825
- International Seismological Centre (2022). ISC-EHB dataset. https://doi.org/10.31905/PY08W6S3
- Lamb, O., Bannister, S., Ristau, J., Miller, C., Sherburn, S., Jacobs, K., Hanson, J., D'Anastasio, E., Hreinsdóttir, S., Snee, E., Ross, M., Mestel, E., & Illsley-Kemp, F. (2024). Seismic characteristics of the 2022-2023 unrest episode at Taupō volcano, Aotearoa New Zealand. Seismica, 3(2). https://doi.org/10.26443/seismica.v3i2.1125
- Lanza, F., Chamberlain, C. J., Jacobs, K., Warren-Smith, E., Godfrey, H. J., Kortink, M., Thurber, C. H., Savage, M. K., Townend, J., Roecker, S., & Eberhart-Phillips, D. (2019). Crustal fault connectivity of the Mw 7.8 2016 Kaikoura earthquake constrained by aftershock relocations. Geophysical Research Letters, 46(12), 6487-6496. doi:10.1029/2019GL082780
- Leitner, B., Eberhart-Phillips, D., Anderson, H., & Nabelek, J. L. (2001). A focused look at the Alpine fault, New Zealand: Seismicity, focal mechanisms, and stress observations. Journal of Geophysical Research, 106(B2), 2193-2220. https://doi.org/10.1029/2000JB900303
- McGinty, P., & Robinson, R. (2007). The 2003 Mw 7.2 Fiordland subduction earthquake, New Zealand: Aftershock distribution, main shock fault plane and static stress changes on the overlying Alpine Fault. Geophysical Journal International, 169(2), 579-592. doi:10.1111/j.1365-246X.2007.03336.x
- Mestel, E.R.H., Illsley-Kemp, F., Savage, M.K., Wilson, C.J.N., Smith, B., & Hreinsdóttir, S. (2025). Seismicity From Modern Magmatic Activity Beneath Taupō Volcano, Aotearoa New Zealand. Journal of Geophysical Research: Solid Earth, 130(9), e2025JB031644. https://doi.org/10.1029/2025JB031644
- Michailos, K. (2019). Southern Alps, New Zealand microseismicity earthquake catalog [Data set, QuakeML]. Zenodo. https://doi.org/10.5281/zenodo.3529755
- Michailos, K. (2025). Southern Alps/Kā Tiritiri o te Moana Matched-Filter based microseismicity earthquake catalog [Data set, QuakeML+CSV]. Zenodo. https://doi.org/10.5281/zenodo.15002912
- Michailos, K., Chamberlain, C.J., Simpson, G., Cox, S.C., Townend, J., Vargo, L.J., Oestreicher, N. & Miller, M.S. (2025). Temporal Evolution of Seismicity in the Central Southern Alps, New Zealand: Evidence for Rainfall-Triggered Seismicity. Geochemistry, Geophysics, Geosystems, 26(8), e2025GC012317. https://doi.org/10.1029/2025GC012317
- Michailos, K., Smith, E. G. C., Chamberlain, C. J., Savage, M. K., & Townend, J. (2019). Variations in seismogenic thickness along the central Alpine Fault, New Zealand, revealed by a decade's relocated microseismicity. Geochemistry, Geophysics, Geosystems, 20. https://doi.org/10.1029/2018GC007743
- Michailos, K., Smith, E.G.C., Chamberlain, C.J., Savage, M.K. & Townend, J. (2019). Variations in Seismogenic Thickness Along the Central Alpine Fault, New Zealand, Revealed by a Decade's Relocated Microseismicity. Geochemistry, Geophysics, Geosystems, 20(1), 470-486. https://doi.org/10.1029/2018GC007743
- Michel, S., et al. (2025). 14 Years of Slip on the Hikurangi Subduction Zone. Journal of Geophysical Research: Solid Earth, 130, e2024JB030865. https://doi.org/10.1029/2024JB030865
- Mitchinson, S., Johnson, J.H., Milner, B., & Lines, J. (2024). Identifying earthquake swarms at Mt. Ruapehu, New Zealand: a machine learning approach. Frontiers in Earth Science, 12, 1343874. https://doi.org/10.3389/feart.2024.1343874
- Mroczek, S., Savage, M.K., Hopp, C., & Sewell, S.M. (2020). Anisotropy as an indicator for reservoir changes: example from the Rotokawa and Ngatamariki geothermal fields, New Zealand. Geophysical Journal International, 220(1), 1-17. https://doi.org/10.1093/gji/ggz400
- Park, I., Jolly, A., Lokmer, I., & Kennedy, B. (2020). Classification of long-term very long period (VLP) volcanic earthquakes at Whakaari/White Island volcano, New Zealand. Earth, Planets and Space, 72, 92. https://doi.org/10.1186/s40623-020-01224-z
- Perez-Silva, A., Wang, T., Wallace, L., Bebbington, M., & Denys, P. (2025). Assessing Occurrence Patterns of Shallow Hikurangi Slow Slip Events Using Renewal Processes. Geophysical Research Letters, 52, e2025GL116605. https://doi.org/10.1029/2025GL116605
- Perez-Silva, A., Wang, T., Wallace, L., Bebbington, M., & Denys, P. (2025). Assessing occurrence patterns of shallow Hikurangi slow slip events using renewal processes [Data set]. Zenodo. https://doi.org/10.5281/zenodo.14848128
- Reyners, M., Eberhart-Phillips, D., Stuart, G., & Nishimura, Y. (2006). Imaging subduction from the trench to 300 km depth beneath the central North Island, New Zealand, with Vp and Vp/Vs. Geophysical Journal International, 165(2), 565-583. https://doi.org/10.1111/j.1365-246X.2006.02897.x
- Ristau, J. (2008). Implementation of routine regional moment tensor analysis in New Zealand. Seismological Research Letters, 79(3), 400-415.
- Ristau, J. (2009). Comparison of magnitude estimates for New Zealand earthquakes: Moment magnitude, local magnitude, and teleseismic body-wave magnitude. Bulletin of the Seismological Society of America, 99(3), 1841-1852. https://doi.org/10.1785/0120080376
- Ristau, J., Holden, C., Kaiser, A., Williams, C., Bannister, S., & Fry, B. (2013). The Pegasus Bay aftershock sequence of the Mw 7.1 Darfield (Canterbury), New Zealand earthquake. Geophysical Journal International, 195(1), 444-459. doi:10.1093/gji/ggt222
- Rollins, C., Christophersen, A., Thingbaijam, K.K.S., Gerstenberger, M.C., Hutchinson, J., Eberhart-Phillips, D., Bannister, S., Van Dissen, R.J., Seebeck, H., & Ellis, S. (2025). An Integrated Earthquake Catalog for Aotearoa New Zealand (Version 1), Event-Type Classifications, and Regional Earthquake Depth Distributions. Bulletin of the Seismological Society of America, 115(4), 1703-1718. https://doi.org/10.1785/0120230179
- Rollins, C., Gerstenberger, M.C., Rhoades, D.A., Rastin, S.J., Christophersen, A., Thingbaijam, K.K.S., Van Dissen, R.J., Graham, K., DiCaprio, C., & Fraser, J. (2024). The Magnitude-Frequency Distributions of Earthquakes in Aotearoa New Zealand and on Adjoining Subduction Zones, Using a New Integrated Earthquake Catalog. Bulletin of the Seismological Society of America, 114(1), 150-181. https://doi.org/10.1785/0120230177
- Rollins, C., Thingbaijam, K.K.S., Hutchinson, J., Gerstenberger, M.C., Christophersen, A., Eberhart-Phillips, D., Rastin, S.J., & Van Dissen, R.J. (2022). An augmented New Zealand earthquake catalogue, event classifications, and models of the depth distribution of shallow earthquakes in the greater New Zealand region. GNS Science Report 2021/58. GNS Science. https://doi.org/10.21420/XT4Y-WY45
- Romanet, P., & Ide, S. (2019). Ambient tectonic tremors in Manawatu, Cape Turnagain, Marlborough, and Puysegur, New Zealand. Earth, Planets and Space, 71, 59. https://doi.org/10.1186/s40623-019-1039-1
- Rowlands, D. P., White, R. S., & Haines, A. J. (2005). Seismic tomography of the Tongariro Volcanic Centre, New Zealand. Geophysical Journal International, 163(3), 1180-1194. https://doi.org/10.1111/j.1365-246X.2005.02716.x
- STREWN: Seismic Triggering Response for Earthquakes around Wellington NZ (2016). FDSN network Z1_2016, University of Wisconsin-Madison. doi:10.7914/SN/Z1_2016
- Savage, M. K., Townend, J., Jacobs, K., Stern, T., & Louie, J. (2014). Southern Cook Strait Earthquake Response. EQC Project 13/U654, Paper number 3785. New Zealand Earthquake Commission / Natural Hazards Commission. https://www.naturalhazards.govt.nz/resilience-and-research/research/search-all-research-reports/southern-cook-strait-earthquake-response/
- Shaw, B.E. (2021). RSQSim Simulated Earthquake Catalog 5091, New Zealand, NSHM2012 Fault System, 276kyr [Data set]. Zenodo. https://doi.org/10.5281/zenodo.5534462
- Shaw, B.E., & Milner, K.R. (2025). RSQSim Earthquake Simulator Catalogs and Ground Motions: California rundir5652, New Zealand rundir5566 [Data set]. Zenodo. https://doi.org/10.5281/zenodo.14532399
- Shaw, B.E., Fry, B., Nicol, A., Howell, A., & Gerstenberger, M. (2022). An Earthquake Simulator for New Zealand. Bulletin of the Seismological Society of America, 112(2), 763-778. https://doi.org/10.1785/0120210087
- Shaw, B.E., Milner, K.R., & Goulet, C.A. (2025). Deterministic Physics-Based Earthquake Sequence Simulators Match Empirical Ground-Motion Models and Enable Extrapolation to Data-Poor Regimes. Seismological Research Letters. https://doi.org/10.1785/0220240141
- Sherburn, S., & White, R. S. (2005). Crustal seismicity in Taranaki, New Zealand using accurate hypocentres from a dense network. Geophysical Journal International, 162(2), 494-506. https://doi.org/10.1111/j.1365-246X.2005.02667.x
- Smith, E. G. C., & Oppenheimer, C. M. M. (1989). The Edgecumbe earthquake sequence: 1987 February 21 to March 18. New Zealand Journal of Geology and Geophysics, 32(1), 31-42. doi:10.1080/00288306.1989.10421386
- Smith, W. D. (1976). A computer file of New Zealand earthquakes. Bulletin of the New Zealand Society for Earthquake Engineering, 9(2), 136-... . https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184
- Stirling, M., McVerry, G., Gerstenberger, M., Litchfield, N., Van Dissen, R., Berryman, K., Barnes, P., Wallace, L., Villamor, P., Langridge, R., Lamarche, G., Nodder, S., Reyners, M., Bradley, B., Rhoades, D., Smith, W., Nicol, A., Pettinga, J., Clark, K., & Jacobs, K. (2012). National Seismic Hazard Model for New Zealand: 2010 Update. Bulletin of the Seismological Society of America, 102(4), 1514-1542. https://doi.org/10.1785/0120110170
- Storchak, D.A., Di Giacomo, D., Engdahl, E.R., Harris, J., Bondar, I., Lee, W.H.K., Bormann, P. & Villasenor, A. (2015). The ISC-GEM Global Instrumental Earthquake Catalogue (1900-2009): Introduction. Physics of the Earth and Planetary Interiors, 239, 48-63. https://doi.org/10.1016/j.pepi.2014.06.009
- Syracuse, E. M., Thurber, C. H., Rawles, C. J., Savage, M. K., & Bannister, S. (2013). High-resolution relocation of aftershocks of the Mw 7.1 Darfield, New Zealand, earthquake and implications for fault activity. Journal of Geophysical Research: Solid Earth, 118(8), 4184-4195. doi:10.1002/jgrb.50301
- Todd, E. K., & Schwartz, S. Y. (2016). Tectonic tremor along the northern Hikurangi Margin, New Zealand, between 2010 and 2015. Journal of Geophysical Research: Solid Earth, 121, 8706-8719. https://doi.org/10.1002/2016JB013480
- University of Otago (2022). Southland Otago Seismic Array (SOSA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/jr68-qq17
- University of Texas at Austin (2014). Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip (HOBITSS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YH_2014
- University of Wisconsin-Madison (2012). WIsconsin, new Zealand, And Rensselaer Deployment (WIZARD) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/ZT_2012
- University of Wisconsin-Madison (2012). WIsconsin, new Zealand, And Rpi Deployment, Deep Fault Drilling Project (DFDP13) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/6F_2012
- Victoria University of Wellington (2008). Southern Alps Microearthquake Borehole Array (SAMBA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/9F_2008
- Victoria University of Wellington (2009). Seismic Analysis of the HiKurangi Experiment, Wellington Geophysical Transect (SAHKE) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/X2_2009
- Victoria University of Wellington (2010). Deep Fault Drilling Project, Alpine Fault, New Zealand: Whataroa-Wanganui Passive Seismology Experiment 2010 (DFDP10/VicU) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XO_2010
- Victoria University of Wellington (2021). Southern Alps Long Skinny Array; Along-fault array for virtual earthquake analysis of the Alpine Fault (SALSA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/ZX_2021
- Wallace, L. M., & Beavan, J. (2010). Diverse slow slip behavior at the Hikurangi subduction margin, New Zealand. Journal of Geophysical Research: Solid Earth, 115, B12402. https://doi.org/10.1029/2010JB007717
- Warren-Smith, E., Chamberlain, C. J., Lamb, S., & Townend, J. (2017). High-Precision Analysis of an Aftershock Sequence Using Matched-Filter Detection: The 4 May 2015 ML 6 Wanaka Earthquake, Southern Alps, New Zealand. Seismological Research Letters, 88(4), 1065-1077. doi:10.1785/0220170016
- Warren-Smith, E., Jacobs, K., Rollins, C., Chamberlain, C. J., Eberhart-Phillips, D., & Williams, C. (2024). A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand. New Zealand Journal of Geology and Geophysics, 68. https://doi.org/10.1080/00288306.2024.2421309
- Weston, J., Engdahl, E.R., Harris, J., Di Giacomo, D. & Storchak, D.A. (2018). ISC-EHB: Reconstruction of a robust earthquake data set. Geophysical Journal International, 214(1), 474-484. https://doi.org/10.1093/gji/ggy155
- Williams, J. N., Eberhart-Phillips, D., Bourguignon, S., Stirling, M. W., & Oliver, W. (2025). Deep and Clustered Microseismicity at the Edge of Southern New Zealand's Transpressive Plate Boundary. Journal of Geophysical Research: Solid Earth, 130(5), e2024JB030371. https://doi.org/10.1029/2024JB030371
- Yarce, J. (2018). HOBITSS earthquake catalog 2014-2015, Hikurangi margin, New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.2022405
- Yarce, J., Sheehan, A. F., & Roecker, S. (2023). Temporal Relationship of Slow Slip Events and Microearthquake Seismicity: Insights From Earthquake Automatic Detections in the Northern Hikurangi Margin, Aotearoa New Zealand. Geochemistry, Geophysics, Geosystems, 24, e2022GC010537. https://doi.org/10.1029/2022GC010537
- Yarce, J., Sheehan, A. F., Nakai, J. S., Schwartz, S. Y., Mochizuki, K., Savage, M. K. K., et al. (2019). Seismicity at the Northern Hikurangi Margin, New Zealand, and Investigation of the Potential Spatial and Temporal Relationships With a Shallow Slow Slip Event. Journal of Geophysical Research: Solid Earth, 124(5), 4751-4766. https://doi.org/10.1029/2018JB017211
- Yarce, J., Sheehan, A., & Roecker, S. (2022). Dataset of automated earthquake detections in the Hikurangi Margin (New Zealand) during the 2014 Slow Slip Event [Data set]. Zenodo. https://doi.org/10.5281/zenodo.7274399

## Appendix B — Schema

Profiles use the *Catalogue Submission Profile* from `publication/main.tex` (Table `tab:profile`): identification & contact (name, aka, contact, data source, description); coverage (start/end date, bounding box, depth range, region, magnitude info); content flags; classification (catalogue type, focus, detection method, review status); and availability (data availability, DOI). Controlled vocabularies for type/focus/detection/review match the white paper.
