# Earthquake Catalogues of Aotearoa New Zealand, 1960–2026
### A Registry-style Inventory of National, Regional, Temporary-Deployment, and Derived Catalogues

**Kenny Graham** — Earth Sciences New Zealand

> **Compiled:** 2026-06-18 · **Scope:** earthquake catalogues developed for / covering New Zealand and its offshore margins whose coverage overlaps 1960–2026 (catalogues that begin earlier and extend into the period, and historical/derived catalogues used for NZ, are included). · **Special emphasis:** temporary seismic deployments (passive-seismic experiments, ocean-bottom deployments, aftershock rapid-response arrays).

This document profiles **107 distinct catalogues** against the *Catalogue Submission Profile* (minimum-attributes schema) defined in the white paper *“Towards a FAIR Framework for Earthquake Catalogues in Aotearoa New Zealand”* (`publication/main.tex`, Table `tab:profile`). It is intended as a working population of the proposed **Registry** layer — a discovery record, *not* a certification of scientific adequacy. Deeper detail is carried by each catalogue’s own dataset/DOI or publication.

## Scope, sources, and compilation

This inventory was compiled from peer-reviewed publications, dataset repositories (e.g. Zenodo, IRIS/EarthScope, PANGAEA), FDSN network records, and the catalogues and reports of GeoNet / GNS Science and partner institutions. Each catalogue was profiled against the submission schema and cross-checked against its defining publication or dataset; persistent identifiers and citations were checked against the original source, and fields that could not be established from the sources are left blank rather than inferred.

The inventory is a discovery resource — each entry summarises what a catalogue contains and how to obtain it, and is not a certification of scientific adequacy; confirm details against the cited source before quantitative use. It is also not a census: earthquake-catalogue production in Aotearoa New Zealand is decentralised and continuous, so a residual long tail of specialised and thesis-derived catalogues remains (see *Coverage gaps*). Of the 107 catalogues listed, **90 of 107** carry a resolvable DOI or stable dataset identifier.

## Summary by category

| Category | Count |
|---|---:|
| National operational & network catalogues | 4 |
| Relocated & reprocessed catalogues | 10 |
| Historical & macroseismic (felt-report) catalogues | 12 |
| Aftershock-sequence rapid-response catalogues | 13 |
| Temporary onshore passive-seismic deployments | 20 |
| Temporary offshore / ocean-bottom (OBS) deployments | 5 |
| Volcano-seismic, geothermal & induced catalogues | 17 |
| Slow-slip, tremor, LFE & moment-tensor catalogues | 15 |
| Derived, homogenised & synthetic / hazard-model catalogues | 9 |
| Strong-motion & ground-motion databases | 2 |
| **Total** | **107** |

## Overview: the shape of New Zealand’s catalogue ecosystem

New Zealand’s earthquake-catalogue landscape has three tiers. **(1) One authoritative national operational catalogue** — the GeoNet catalogue, produced by GNS Science / Earth Sciences New Zealand — provides continuous instrumental coverage (locations from the 1930s, descriptive events from ~1460) and is underpinned by the permanent National Seismograph Network (FDSN code `NZ`). It is the parent dataset for nearly every derived NZ catalogue. **(2) A large, scattered body of regional, temporary-deployment, volcano/geothermal and special-purpose catalogues**, produced mostly by universities (Victoria University of Wellington, Otago, Auckland, Canterbury) and international partners. These deliver far higher *local* precision — dense arrays, ocean-bottom seismometers, borehole sensors, and matched-filter / template-matching detection — but are typically published as one-off datasets discoverable only through the originating paper. **(3) Derived products**: relocated/reprocessed catalogues, magnitude-homogenised and declustered hazard-model catalogues (NSHM 2010 and 2022), and synthetic (RSQSim) catalogues.

Temporary deployments are the **single largest group in this inventory** (20 onshore + 5 offshore/OBS, plus a large share of the volcano-seismic and aftershock-response catalogues) — yet they are precisely the catalogues *least* discoverable in the national system. They are exactly the material the proposed Registry is designed to surface: high scientific value, but fragmented across journal supplements, Zenodo, IRIS/EarthScope, PANGAEA, and FDSN temporary-network DOIs, with heterogeneous magnitude scales, depth treatments, and metadata conventions.

## Timeline: how NZ catalogue capability evolved

- **1960s–1970s (analogue era).** The national catalogue is maintained by the DSIR Seismological Observatory; the *Computer File of New Zealand Earthquakes* runs to 1974, while Eiby’s *Descriptive Catalogue* and *Annotated List (1460–1965)* bridge the instrumental and historical records. Globally relocated NZ coverage exists via ISC-GEM (from 1904) and later ISC-EHB (from 1964).
- **1980s (digitisation begins).** Continuous digital waveforms are archived from September 1986. The **1987 Edgecumbe** sequence is an early instrumented aftershock response.
- **1990s (first big passive experiments).** **SAPSE** (Southern Alps Passive Seismic Experiment, 1995–96) is a landmark temporary deployment; Wellington-region relocation work begins; Downes’ *Atlas of Isoseismal Maps* (1995) systematises historical macroseismic intensities.
- **2000s (targeted arrays + double-difference relocation).** A wave of temporary arrays (Marlborough `XB`, Tongariro, Taranaki, CNIPSE/NIGHT, **SAHKE**, **ALFA08/09**, and the **SAMBA** borehole array from 2008); double-difference relocation becomes standard (e.g. Wellington, Du et al. 2004); the 2003 Fiordland response.
- **2010s (GeoNet modernises; sequences drive dense catalogues).** GeoNet moves to SeisComP with 3-D NonLinLoc (2012). The **Canterbury** sequence (Darfield 2010, Christchurch 2011) and **Kaikōura 2016** drive dense aftershock and ocean-bottom catalogues (**HOBITSS**, 2014–15). Matched-filter / template-matching catalogues emerge (Chamberlain; Michailos), and slow-slip and tremor/LFE catalogues mature (Wallace & Beavan 2010; Todd & Schwartz 2016).
- **2020s (ML-scale relocation, synthetics, multi-year geodetic catalogues).** High-precision matched-filter and nested-tomography catalogues (TVZ; Hikurangi); long **RSQSim** synthetic catalogues for NSHM 2022; multi-year GNSS slow-slip catalogues (Michel 2025; Perez-Silva 2025); dense onshore arrays (**DWARFS**, **SALSA**, **SOSA**); volcanic-unrest catalogues at Taupō (2019; 2022–23); and geothermal induced-seismicity monitoring (Rotokawa, Ngatamariki).

## Coverage gaps & FAIR weaknesses

- **Not a census.** Because earthquake-catalogue production is decentralised and continuous, a residual long tail remains — likely-missing material includes further PhD-thesis catalogues, additional dedicated catalogues for NZ Mw≥6 aftershock responses since 1960, more geothermal fields (Ohaaki, Mokai, Ngāwhā), and the **SISIE/MOANA/SHIRE** offshore experiments not yet retained as distinct event catalogues.
- **Discoverability is the core problem.** Temporary-deployment and regional catalogues live across journal supplements, Zenodo, IRIS/EarthScope, and FDSN network DOIs — the fragmentation the Registry exists to fix.
- **Heterogeneity.** Magnitude scales vary (ML, Mw via GeoNet CMT “MwNZ” from 2003-08, the homogenised MLNZ20→Mw used for NSHM 2022); magnitude of completeness (Mc) is rarely stated and is spatially variable; depths span 0–~600 km for subduction seismicity but many regional catalogues are shallow-crustal only.
- **A few entries are not conventional event lists** (e.g. the NZNSN *waveform* dataset; the `nz3drx` 3-D *location method* within the GeoNet DOI) — they are included for completeness and flagged in their records.
- **A few entries are provisional** (e.g. the 2013 Seddon / Lake Grassmere and 2009 Dusky Sound response deployments, and two forecast/test-centre catalogues), included pending a clearly attributable standalone dataset.

---

## The inventory

*Each entry follows the submission-profile schema. The header line gives catalogue type · focus · detection method · review status.*

## National operational & network catalogues (4)

### 1. GeoNet Aotearoa New Zealand Earthquake Catalogue
*type: background · focus: geographical · detection: automatic · review: partially reviewed*

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

---

### 2. New Zealand National Seismograph Network (NZNSN) seismic waveform dataset
*type: background · focus: geographical · detection: automatic · review: non-reviewed*

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

---

### 3. National Earthquake Information Database (NEID)
*type: compilation · focus: geographical · detection: other · review: partially reviewed*

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

---

### 4. Computer File of New Zealand Earthquakes (DSIR Seismological Observatory)
*type: compilation · focus: geographical · detection: manual · review: reviewed*

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
- Smith, W. D. (1976). A computer file of New Zealand earthquakes. Bulletin of the New Zealand Society for Earthquake Engineering, 9(2), 136-.. https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184

---

## Relocated & reprocessed catalogues (10)

### 5. Eberhart-Phillips & Reyners 2001-2011 NZ-Wide 3-D Relocated Catalogue
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 6. Hikurangi Subduction Zone Nested-Tomography Precise Relocation Catalogue (Aziz Zanjani et al. 2021)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 7. ISC-EHB Bulletin (New Zealand coverage)
*type: compilation · focus: geographical · detection: manual · review: reviewed*

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

---

### 8. ISC-GEM Global Instrumental Earthquake Catalogue (New Zealand coverage)
*type: large-events-only · focus: geographical · detection: manual · review: reviewed*

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

---

### 9. Taupo Volcanic Zone Consistent High-Precision Earthquake Catalogue (2007-2023)
*type: background · focus: geographical · detection: machine-learning · review: reviewed*

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

---

### 10. Wellington Region Double-Difference Relocated Catalogue (Du et al. 2004)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 11. Central Alpine Fault Relocated Microseismicity Catalogue (Michailos 2008-2017 / SAMBA)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 12. Central Southern Alps Matched-Filter Microseismicity Catalogue (Michailos 2009-2020)
*type: background · focus: geographical · detection: template-matching · review: reviewed*

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

---

### 13. ISC Bulletin / Reviewed ISC Bulletin (New Zealand component)
*type: compilation · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** International Seismological Centre On-line Bulletin; ISC Reviewed Bulletin; reporting agency code ISC (NZ contributing agencies include GNS/WEL and historically DSIR)
- **Coverage:** 1900 → ongoing
- **Region:** Global; New Zealand component covers onshore NZ, Hikurangi-Kermadec subduction margin, and subantarctic region
- **Bounding box:** Global (NZ component covers approx. -50 to -33 lat, 165 to -176 lon, including Hikurangi/Kermadec margin and subantarctic region)
- **Depth range:** 0 to ~700 km (full crustal-to-deep subduction range; global product)
- **Magnitude:** Global product; Reviewed Bulletin applies manual review to all events with M>=3.5 (M = maximum reported network magnitude), and selectively for 2.5<=M<3.5. No single Mc defined for the NZ component (Mc varies with era and reporting completeness).
- **Content:** hypocentral locations, phase arrival-time picks, amplitude picks, focal mechanisms, quality information, other
- **Producer / contact:** International Seismological Centre (ISC), Thatcham, United Kingdom (Director: D.A. Storchak). NZ data contributed primarily by GNS Science / GeoNet (and historically DSIR Geophysics Division).
- **Data source:** Parametric earthquake data (hypocentres, phase arrival-time picks, amplitude/magnitude readings, collected focal-mechanism solutions) reported to the ISC by ~150 seismological agencies and networks worldwide, grouped and relocated by the ISC. The NZ component derives mainly from GNS Science / GeoNet (and historically DSIR) station and bulletin contributions, supplemented by globally collected phases.
- **Availability:** available (DOI) · DOI [https://doi.org/10.31905/D808B830](https://doi.org/10.31905/D808B830)

The ISC Bulletin is regarded as the definitive long-term parametric record of global seismicity, compiling hypocentres, phase arrival times, amplitudes and magnitudes, and collected focal-mechanism solutions. The 'Reviewed' product applies manual analyst checking and ISC relocation to all events with M>=3.5 (and selectively for 2.5<=M<3.5), producing the authoritative reviewed location/magnitude record for moderate-to-large NZ events. It is distinct from the ISC-EHB and ISC-GEM derivative products and is widely cited for NZ regional/teleseismic locations.

**Key references:**
- International Seismological Centre (2026). On-line Bulletin. International Seismological Centre, Thatcham, United Kingdom. https://doi.org/10.31905/D808B830
- Bondár, I. and Storchak, D.A. (2011). Improved location procedures at the International Seismological Centre. Geophysical Journal International, 186, 1220-1244. https://doi.org/10.1111/j.1365-246X.2011.05107.x
- Storchak, D.A. et al. (2017). Rebuild of the Bulletin of the International Seismological Centre (ISC), part 1: 1964-1979. Geoscience Letters, 4: 32. https://doi.org/10.1186/s40562-017-0098-z
- Storchak, D.A. et al. (2020). Rebuild of the Bulletin of the International Seismological Centre (ISC), part 2: 1980-2010. Geoscience Letters, 7: 18. https://doi.org/10.1186/s40562-020-00164-6

---

### 14. USGS NEIC Preliminary Determination of Epicenters (PDE) / ANSS Comprehensive Catalog (ComCat) — New Zealand component
*type: compilation · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** USGS NEIC PDE Bulletin; ANSS ComCat; reporting agency code US / NEIC / PDE
- **Coverage:** 1973 → ongoing
- **Region:** Global; New Zealand component covers onshore NZ, Hikurangi-Kermadec subduction margin, and subantarctic region
- **Bounding box:** Global (NZ component covers approx. -50 to -33 lat, 165 to -176 lon)
- **Depth range:** 0 to ~700 km (global product)
- **Magnitude:** Global bulletin; NZ component is dominated by larger/teleseismically detected events (roughly M>=4.5-5 regionally complete, decreasing over time). No formally published Mc for the NZ subset.
- **Content:** hypocentral locations, phase arrival-time picks, amplitude picks, focal mechanisms, quality information, other
- **Producer / contact:** U.S. Geological Survey, Earthquake Hazards Program / National Earthquake Information Center (NEIC), Golden, Colorado, USA
- **Data source:** Global earthquake bulletin compiled by the USGS NEIC from worldwide and US network phase/parametric contributions; the PDE is one discrete product within the ANSS Comprehensive Catalog (ComCat), which aggregates ~26 contributing networks. The NZ component is the subset of US/NEIC-located events located within/around New Zealand (predominantly the larger, teleseismically recorded events).
- **Availability:** available (DOI) · DOI [https://doi.org/10.5066/F74T6GJC](https://doi.org/10.5066/F74T6GJC)

The USGS NEIC PDE is the agency's global earthquake bulletin and a core contributing product within the ANSS Comprehensive Catalog (ComCat), providing near-global hypocentres, magnitudes, and associated products (moment tensors, ShakeMap, PAGER, DYFI). Its NZ component captures predominantly the larger/teleseismically recorded events along the Hikurangi-Kermadec margin and crustal NZ. It is a distinct global compilation, separate from regional GeoNet/NEID products and from the ISC and GCMT compilations.

**Key references:**
- U.S. Geological Survey, Earthquake Hazards Program (2017). Preliminary Determination of Epicenters (PDE) Bulletin. U.S. Geological Survey. https://doi.org/10.5066/F74T6GJC
- U.S. Geological Survey, Earthquake Hazards Program (2017). Advanced National Seismic System (ANSS) Comprehensive Catalog of Earthquake Events and Products. U.S. Geological Survey. https://doi.org/10.5066/F7MS3QZH

---

## Historical & macroseismic (felt-report) catalogues (12)

### 15. Atlas of Isoseismal Maps of New Zealand Earthquakes (1st edition, Downes 1995)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed*

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

---

### 16. Atlas of Isoseismal Maps of New Zealand Earthquakes 1843-2003 (2nd edition, Downes & Dowrick 2014)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed*

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

---

### 17. A Descriptive Catalogue of New Zealand Earthquakes (Eiby 1968/1973)
*type: historical · focus: geographical · detection: felt-reports · review: reviewed*

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

---

### 18. An Annotated List of New Zealand Earthquakes, 1460-1965 (Eiby 1968)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed*

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

---

### 19. GeoNet Felt Classic / Community Modified Mercalli Intensity (CMMI) Dataset
*type: compilation · focus: parameter-testing · detection: felt-reports · review: reviewed*

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

---

### 20. GeoNet Aotearoa New Zealand Felt Rapid Dataset
*type: compilation · focus: geographical · detection: felt-reports · review: non-reviewed*

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

---

### 21. GeoNet Felt Detailed Macroseismic Intensity Dataset
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed*

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

---

### 22. GeoNet Aotearoa New Zealand Shaking Layers Dataset
*type: compilation · focus: geographical · detection: other · review: non-reviewed*

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

---

### 23. Historical Incidence of Modified Mercalli Intensity in New Zealand (1840-1997)
*type: compilation · focus: geographical · detection: felt-reports · review: reviewed*

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

---

### 24. Patterns of Earthquake-Related Mortality in New Zealand, 1840-2017
*type: historical · focus: particular-event-type · detection: felt-reports · review: reviewed*

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

---

### 25. Magnitudes of New Zealand Earthquakes, 1901-1993 (Dowrick & Rhoades 1998)
*type: large-events-only · focus: parameter-testing · detection: other · review: reviewed*

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

---

### 26. Pre-2010 Historical Seismicity near Christchurch (1869 Christchurch & 1870 Lake Ellesmere)
*type: historical · focus: geographical · detection: felt-reports · review: reviewed*

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

---

## Aftershock-sequence rapid-response catalogues (13)

### 27. 1987 Edgecumbe Earthquake Sequence (ML 6.3, Bay of Plenty)
*type: aftershock · focus: geographical · detection: manual · review: reviewed*

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

---

### 28. 2003 Mw 7.2 Fiordland (Secretary Island) Aftershock Relocations
*type: aftershock · focus: geographical · detection: manual · review: reviewed*

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

---

### 29. 2010 Darfield (Canterbury) Mw 7.1 High-Resolution Aftershock Relocations
*type: aftershock · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** Darfield aftershock relocations; Syracuse et al. 2013; D-RAD / FDSN 4A deployment
- **Coverage:** 2010-09 → 2011
- **Region:** Canterbury (Greendale Fault / Darfield)
- **Bounding box:** Canterbury Plains west of Christchurch, South Island, New Zealand
- **Magnitude:** Mainshock Mw 7.1
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Ellen M. Syracuse & Clifford H. Thurber (University of Wisconsin-Madison); co-authors C. J. Rawles, M. K. Savage (VUW), S. Bannister (GNS Science)
- **Data source:** Rapid-response 10-station PASSCAL/IRIS RAMP array (Darfield RAMP Aftershock Deployment, FDSN 4A_2010, DOI 10.7914/SN/4A_2010, operated by University of Wisconsin-Madison) plus temporary GNS and GeoNet stations
- **Availability:** available on request · DOI [10.1002/jgrb.50301](https://doi.org/10.1002/jgrb.50301)

High-resolution double-difference tomography relocation of Darfield aftershocks following the 4 September 2010 Mw 7.1 earthquake. Produced to delineate buried/blind faults (including the Greendale Fault) and derive a 3-D velocity model, clarifying fault activity in the Canterbury sequence. Distinct from the later Christchurch and Pegasus Bay sub-sequence relocations.

**Key references:**
- Syracuse, E. M., Thurber, C. H., Rawles, C. J., Savage, M. K., & Bannister, S. (2013). High-resolution relocation of aftershocks of the Mw 7.1 Darfield, New Zealand, earthquake and implications for fault activity. Journal of Geophysical Research: Solid Earth, 118(8), 4184-4195. doi:10.1002/jgrb.50301
- Darfield RAMP Aftershock Deployment (D-RAD), New Zealand (2010). FDSN network 4A_2010, University of Wisconsin-Madison. doi:10.7914/SN/4A_2010

---

### 30. 2011 Christchurch (Mw 6.2) Fine-Scale Aftershock Relocations
*type: aftershock · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** Christchurch 22 February 2011 aftershock relocations; Bannister et al. 2011
- **Coverage:** 2011-02 → unknown — not documented
- **Region:** Canterbury (Christchurch / Port Hills fault)
- **Bounding box:** Christchurch / Port Hills, Canterbury, South Island, New Zealand
- **Magnitude:** Mainshock Mw 6.2
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; fault-geometry
- **Producer / contact:** Stephen Bannister, Bill Fry, Martin Reyners, John Ristau, Haijiang Zhang (GNS Science; Zhang at MIT/USTC)
- **Data source:** Dense GeoNet permanent network plus CanNet and temporary portable recorders around Christchurch
- **Availability:** available on request · DOI [10.1785/gssrl.82.6.839](https://doi.org/10.1785/gssrl.82.6.839)

Fine-scale double-difference tomography relocation of aftershocks of the 22 February 2011 Mw 6.2 Christchurch earthquake. Produced to resolve the near-surface (Port Hills) fault responsible for the high ground motions that caused widespread damage and fatalities in Christchurch. Part of the broader Canterbury earthquake sequence work, distinct from the Darfield (Syracuse 2013) and Pegasus Bay (Ristau 2013) relocations.

**Key references:**
- Bannister, S., Fry, B., Reyners, M., Ristau, J., & Zhang, H. (2011). Fine-scale relocation of aftershocks of the 22 February Mw 6.2 Christchurch earthquake using double-difference tomography. Seismological Research Letters, 82(6), 839-845. doi:10.1785/gssrl.82.6.839

---

### 31. Pegasus Bay Aftershock Sequence (2011-2012, Canterbury)
*type: aftershock · focus: geographical · detection: manual · review: reviewed*

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

---

### 32. 2015 ML 6 Wanaka Aftershock Matched-Filter Catalogue
*type: aftershock · focus: geographical · detection: template-matching · review: reviewed*

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

---

### 33. 2016 Kaikoura (Mw 7.8) Aftershock Relocations (Lanza et al. 2019, STREWN + GeoNet)
*type: aftershock · focus: geographical · detection: manual · review: reviewed*

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

---

### 34. 2016 Kaikoura 10-Year Matched-Filter Seismicity Catalogue (Chamberlain et al. 2021)
*type: background · focus: geographical · detection: template-matching · review: reviewed*

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

---

### 35. Southern Cook Strait / Seddon-Lake Grassmere 2013 Earthquake Response Deployment
*type: aftershock · focus: geographical · detection: manual · review: partially reviewed*

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

---

### 36. Kermadec 2021 Refined Earthquake Catalogue and Slip Models (Lythgoe et al.)
*type: aftershock · focus: particular-event-type · detection: manual · review: reviewed*

- **Also known as:** Kermadec 2021 refined earthquake catalogue and slip models; Lythgoe et al. 2023 Kermadec doublet dataset; Edinburgh DataShare 10283/8556
- **Coverage:** 2021-03 → 2021
- **Region:** Kermadec subduction zone (New Zealand offshore northern margin / Kermadec-Tonga)
- **Magnitude:** Mainshocks Mw 7.4 and Mw 8.1 (5 March 2021); compared to 1976 Mw ~7.9 doublet.
- **Content:** hypocentral locations, relative relocations, focal mechanisms, fault-geometry, other (finite-fault slip models)
- **Producer / contact:** Karen H. Lythgoe (Earth Observatory of Singapore, Nanyang Technological University; previously associated via University of Edinburgh DataShare deposit). Co-authors: K. Bradley, H. Zeng, S. Wei.
- **Data source:** Refined relocations, focal mechanisms and finite-fault slip models derived for the 5 March 2021 Kermadec Mw 7.4 and Mw 8.1 doublet sequence (and re-analysis of the 1976 doublet at the same location). Based on regional/teleseismic and aftershock data analysed in Lythgoe et al. (2023, EPSL). Dataset deposited on University of Edinburgh DataShare.
- **Availability:** available (DOI) · DOI [10.7488/ds/7534](https://doi.org/10.7488/ds/7534)

A standalone dataset accompanying Lythgoe et al. (2023) that provides a refined earthquake catalogue, focal mechanisms and slip models for the 2021 Kermadec Mw 7.4 + Mw 8.1 megathrust doublet, comparing it to the 1976 doublet that ruptured the same asperity. Produced to investigate why large earthquakes recur on the same plate-boundary segment with differing slip distributions, attributing persistent asperities to forearc structure and an isolated sedimentary basin. Focus is the Kermadec subduction zone along New Zealand's offshore northern margin.

**Key references:**
- Lythgoe, K., Bradley, K., Zeng, H., & Wei, S. (2023). Persistent asperities at the Kermadec subduction zone controlled by changes in forearc structure: 1976 and 2021 doublet earthquakes. Earth and Planetary Science Letters, 624, 118465. https://doi.org/10.1016/j.epsl.2023.118465
- Lythgoe, K. (2023). Kermadec 2021 refined earthquake catalogue and slip models [Dataset]. University of Edinburgh DataShare. https://doi.org/10.7488/ds/7534

---

### 37. 2016 Mw 7.1 Te Araroa (East Cape) Matched-Filter Foreshock & Aftershock Catalogue (Warren-Smith et al. 2018)
*type: aftershock · focus: particular-event-type · detection: template-matching · review: non-reviewed*

- **Also known as:** Te Araroa 2016 matched-filter catalogue; East Cape 2 September 2016 Mw 7.1 foreshock/aftershock catalogue; Warren-Smith et al. 2018 EQcorrscan catalogue
- **Coverage:** 2016-08 → 2016-11
- **Region:** Offshore East Cape / northern Hikurangi margin, North Island, New Zealand
- **Magnitude:** Mainshock Mw 7.1; largest aftershock ~M6.2; foreshock Mw 5.7. Matched-filter detections down to ~ML 2.5-3.5 reported.
- **Events:** ~8,000+ earthquakes over ~66 days (from 582 template events)
- **Content:** hypocentral locations, phase arrival-time picks, other (template/matched-filter detections; relative timing). Relative relocation not confirmed.
- **Producer / contact:** Emily Warren-Smith (lead; GNS Science). Co-authors: Bill Fry (GNS Science), Yoshihiro Kaneko, Calum J. Chamberlain (Victoria University of Wellington).
- **Data source:** Matched-filter (template-matching) detection applied to GeoNet continuous waveforms using 582 well-located GeoNet template events; recorded on broadband and short-period sensors (~27 stations). Built on the GeoNet catalogue and continuous archive.
- **Availability:** available on request

A dense matched-filter foreshock and aftershock catalogue for the 2 September 2016 Mw 7.1 Te Araroa earthquake offshore East Cape, North Island. Produced to study precursory/foreshock slip, delayed triggering, and the dynamic reinvigoration of the aftershock sequence by the November 2016 Mw 7.8 Kaikoura earthquake. Detects highly correlated events beginning ~12 minutes after a Mw 5.7 foreshock and documents bilateral migration near the eventual mainshock hypocentre.

**Key references:**
- Warren-Smith, E., Fry, B., Kaneko, Y., & Chamberlain, C. J. (2018). Foreshocks and delayed triggering of the 2016 MW7.1 Te Araroa earthquake and dynamic reinvigoration of its aftershock sequence by the MW7.8 Kaikoura earthquake, New Zealand. Earth and Planetary Science Letters, 482, 265-276. https://doi.org/10.1016/j.epsl.2017.11.020

---

### 38. 1994 Mw 6.7 Arthur's Pass Earthquake Finely Relocated Aftershock Catalogue (Bannister et al. 2006)
*type: aftershock · focus: particular-event-type · detection: manual · review: reviewed*

- **Also known as:** Arthur's Pass 1994 finely relocated aftershocks; Bannister, Thurber & Louie 2006 double-difference tomography catalogue
- **Coverage:** 1994-06 → unknown — not documented
- **Region:** Arthur's Pass / central Southern Alps, South Island, New Zealand
- **Depth range:** ~0-10 km (>98% of relocated events above ~10 km; brittle-ductile transition near 10 km)
- **Magnitude:** Mainshock Mw 6.7.
- **Events:** >3,500 relocated (of >6,000 recorded aftershocks)
- **Content:** hypocentral locations, relative relocations, phase arrival-time picks, fault-geometry, other (3-D Vp and Vp/Vs velocity model)
- **Producer / contact:** Stephen Bannister (lead; GNS Science). Co-authors: Clifford Thurber (University of Wisconsin-Madison), John Louie (University of Nevada, Reno).
- **Data source:** Aftershock arrival-time and waveform data following the 18 June 1994 Arthur's Pass Mw 6.7 earthquake (Southern Alps), relocated with double-difference tomography (tomoDD) using waveform cross-correlation and catalogue differential times.
- **Availability:** available on request

A finely relocated aftershock catalogue for the 18 June 1994 Mw 6.7 Arthur's Pass earthquake in the Southern Alps, South Island. More than 6,000 aftershocks were recorded and over 3,500 relocated, resolving two parallel ~N60E (+/-10 deg), 70-80 deg-dipping fault clusters and a 3-D Vp / Vp/Vs model around the aftershock volume. Produced to illuminate the detailed fault structure of an unusual, complex earthquake sequence.

**Key references:**
- Bannister, S., Thurber, C., & Louie, J. (2006). Detailed fault structure highlighted by finely relocated aftershocks, Arthur's Pass, New Zealand. Geophysical Research Letters, 33(18), L18315. https://doi.org/10.1029/2006GL027462

---

### 39. 2009 Mw 7.8 Dusky Sound (Fiordland/Puysegur) Aftershock Deployment Relocations
*type: aftershock · focus: particular-event-type · detection: manual · review: partially reviewed*

- **Also known as:** Dusky Sound 2009 aftershocks; Fiordland 2009 Mw 7.8 earthquake response; Puysegur subduction 2009 sequence
- **Coverage:** 2009-07 → unknown — not documented (aftershock deployment ran from 17 July 2009; broader host catalogue spans 2001-2011)
- **Region:** Dusky Sound / SW Fiordland, Puysegur subduction zone, South Island, New Zealand
- **Content:** hypocentral locations, relative relocations (within the broader 2001-2011 relocated catalogue); historical observations / response reports
- **Producer / contact:** Response/deployment: Bill Fry, Stephen Bannister, John Beavan et al. (GNS Science). Broader relocated catalogue that subsumes the aftershocks: Donna Eberhart-Phillips & Martin Reyners (GNS Science).
- **Data source:** GeoNet permanent network densified by a portable seismograph deployment (6-7 instruments installed from 17 July 2009) after the 15 July 2009 Mw 7.8 Dusky Sound earthquake on the Puysegur subduction interface. The aftershocks are captured within a national 2001-2011 catalogue relocated with a 3-D seismic velocity model.
- **Availability:** available on request

The 15 July 2009 Mw 7.8 Dusky Sound (Fiordland) earthquake ruptured the Puysegur subduction interface and was the largest NZ earthquake in ~80 years; a portable deployment densified GeoNet to better locate its rich aftershock sequence. There is NO verifiable dedicated standalone relocated-aftershock catalogue product with its own DOI: the response is documented in preliminary reports (Fry et al. 2010, Bull. NZSEE) and GPS/InSAR source papers (Beavan et al. 2010, GJI), while the relocated aftershocks are subsumed within the broader Eberhart-Phillips & Reyners (2023) 2001-2011 New Zealand relocated catalogue.

**Key references:**
- Eberhart-Phillips, D., & Reyners, M. (2023). Catalogue of 2001-2011 New Zealand earthquakes relocated with 3-D seismic velocity model and comparison to 2019-2020 auto-detected earthquakes in the sparsely instrumented southern South Island. New Zealand Journal of Geology and Geophysics, 66(4), 646-653. https://doi.org/10.1080/00288306.2022.2089171
- Beavan, J., Samsonov, S., Denys, P., Sutherland, R., Palmer, N., & Denham, M. (2010). Oblique slip on the Puysegur subduction interface in the 2009 July MW 7.8 Dusky Sound earthquake from GPS and InSAR observations: implications for the tectonics of southwestern New Zealand. Geophysical Journal International, 183(3), 1265-1286. https://doi.org/10.1111/j.1365-246X.2010.04798.x
- Fry, B., Bannister, S., Beavan, J., et al. (2010). The Mw 7.6 Dusky Sound earthquake of 2009: preliminary report. Bulletin of the New Zealand Society for Earthquake Engineering, 43(1).

---

## Temporary onshore passive-seismic deployments (20)

### 40. SAPSE — Southern Alps Passive Seismic Experiment (1995-96)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 41. SAMBA — Southern Alps Microearthquake Borehole Array (network deployment)
*type: background · focus: geographical · detection: automatic · review: partially reviewed*

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

---

### 42. DFDP-2 Real-Time / Matched-Filter Earthquake Catalogue, Whataroa (2014-2015)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

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

---

### 43. DFDP10 / Whataroa-Wanganui Passive Seismology Experiment 2010 (FDSN XO)
*type: background · focus: geographical · detection: automatic · review: non-reviewed*

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

---

### 44. ALFA08 / ALFA09 Alpine Fault Arrays (FDSN YR)
*type: background · focus: geographical · detection: manual · review: partially reviewed*

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

---

### 45. WIZARD Array — Wisconsin, New Zealand And Rensselaer Deployment (FDSN ZT / 6F)
*type: background · focus: geographical · detection: automatic · review: non-reviewed*

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

---

### 46. DWARFS — Dense Westland Arrays Researching Fault Segmentation (FDSN 7S/8N)
*type: background · focus: geographical · detection: automatic · review: non-reviewed*

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

---

### 47. SALSA — Southern Alps Long Skinny Array (FDSN ZX)
*type: background · focus: parameter-testing · detection: automatic · review: non-reviewed*

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

---

### 48. SOSA — Southland Otago Seismic Array Catalogue (2022-2023)
*type: background · focus: geographical · detection: automatic · review: reviewed*

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

---

### 49. Otago Temporary Broadband Network (FDSN 6K, 2014-2015)
*type: background · focus: geographical · detection: automatic · review: non-reviewed*

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

---

### 50. Marlborough Fault Zone Anisotropy/Converted-Phase Array (FDSN XB, 2000-2002)
*type: background · focus: geographical · detection: manual · review: partially reviewed*

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

---

### 51. SAHKE — Seismic Array HiKurangi Experiment (Wellington Geophysical Transect, passive)
*type: background · focus: geographical · detection: manual · review: partially reviewed*

- **Also known as:** SAHKE; FDSN X2 (2009-2010); Seismic Analysis of the HiKurangi Experiment
- **Coverage:** 2009-11 → 2010-04
- **Region:** Southern Hikurangi margin / Wellington transect
- **Bounding box:** Lower North Island transect, Kapiti coast to east coast (Wairarapa), New Zealand
- **Magnitude:** Local and teleseismic events recorded.
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** Victoria University of Wellington / GNS Science with ERI (Univ. Tokyo, Japan) and US partners; Stuart Henrys (GNS) lead author
- **Data source:** VUW/GNS/Japan-ERI/US passive deployment (FDSN X2): ~10 broadband + short-period sensors plus active-source shots along a lower North Island transect (Kapiti coast to east coast), Nov 2009-Apr 2010. Continuous waveforms + active-source data.
- **Availability:** available (DOI) · DOI [10.7914/SN/X2_2009](https://doi.org/10.7914/SN/X2_2009)

A passive (and active-source) deployment along a Wellington-region geophysical transect to image the locked southern Hikurangi subduction megathrust beneath the lower North Island. Recorded local and teleseismic events used with active-source data for tomography and reflection imaging of the subduction interface and overlying crust.

**Key references:**
- Henrys, S., Wech, A., Sutherland, R., Stern, T., Savage, M., Sato, H., Mochizuki, K., Iwasaki, T., Okaya, D., Seward, A., Tozer, B., Townend, J., Kurashimo, E., Iidaka, T., & Ishiyama, T. (2013). SAHKE geophysical transect reveals crustal and subduction zone structure at the southern Hikurangi margin, New Zealand. Geochemistry, Geophysics, Geosystems, 14(6), 2063-2083. https://doi.org/10.1002/ggge.20136
- Victoria University of Wellington (2009). Seismic Analysis of the HiKurangi Experiment, Wellington Geophysical Transect (SAHKE) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/X2_2009

---

### 52. CNIPSE / NIGHT Passive — Central North Island Passive Seismic Experiment (FDSN XQ)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 53. HADES — Deep Geothermal HADES Seismic Array (Taupo, FDSN Z8)
*type: background · focus: geographical · detection: automatic · review: partially reviewed*

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

---

### 54. Taranaki Dense Temporary Network Crustal Seismicity Catalogue (Sherburn & White 2005)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 55. Tongariro Volcanic Centre Local Earthquake Tomography Catalogue (Rowlands et al. 2005)
*type: background · focus: particular-event-type · detection: manual · review: reviewed*

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

---

### 56. Local Earthquake and Focal Mechanism Catalogue for the Northern Hikurangi Margin, December 2017-October 2018 (NZ3D onshore network)
*type: background · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** NZ3D onshore earthquake/focal-mechanism catalogue; Woodward et al. (2026) Northern Hikurangi catalogue; FDSN network 3C (2017-2018) 'NZ3D FWI'
- **Coverage:** 2017-12 → 2018-10
- **Region:** Northern Hikurangi subduction margin, near Gisborne, eastern North Island, New Zealand
- **Events:** 3071 high-quality local earthquakes (reported in the defining study; plus associated focal mechanisms)
- **Content:** hypocentral locations, phase arrival-time picks, focal mechanisms, quality information
- **Producer / contact:** Amy Woodward (lead author), Ian D. Bastow, Rebecca Bell — Imperial College London; deployment PI Rebecca Bell (Imperial College London)
- **Data source:** Onshore temporary NZ3D-FWI seismograph network (FDSN code 3C, 2017-2018): 49 Guralp CMG-6TD broadband instruments (NERC GEF) deployed Dec 2017-Oct 2018, supplemented by ~119 short-period DATACUBE3 (GIPP Potsdam) and 25 GSX3 (ERI Tokyo) short-period instruments (Dec 2017-Feb 2018), in a ~30 km x 15 km array near Gisborne above the 10-30 km portion of the northern Hikurangi slow-slip region. Hypocentres located and focal mechanisms derived from these continuous recordings; v2 of the dataset removed the active-source airgun shots present in v1.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.17063327](https://doi.org/10.5281/zenodo.17063327)

Produced to seismologically characterise the deeper (10-30 km) portion of the northern Hikurangi margin slow-slip region near Gisborne, associating microseismicity and faulting with normal faults, subducting seamounts and fluid seep sites. The catalogue resolves well-located earthquakes and focal mechanisms (including deep normal-faulting events within the subducting slab) to trace fluid pathways rising from the slab mantle to surface seeps. It fills a gap left by the offshore HOBITSS catalogues and the NZ3D-FWI active-source velocity-model work, which did not include an onshore-network-derived hypocentre+focal-mechanism event catalogue.

**Key references:**
- Woodward, A., Bastow, I.D., Bell, R., Wallace, L., Jacobs, K., Henrys, S., Fry, B., Merry, T.A.J., Lane, V., Ville, L., Houldsworth-Bianek, P., & Broadley, L. (2026). Seismological Characterization of Northern Hikurangi Margin Slow Slip Regions Associated With Normal Faults, Seamounts, and Seeps. Journal of Geophysical Research: Solid Earth, 131(1), e2025JB032916. https://doi.org/10.1029/2025JB032916
- Woodward, A., Bastow, I., & Bell, R. (2025). Local Earthquake and Focal Mechanism Catalogue for the Northern Hikurangi Margin December 2017-October 2018 (v2) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.17063327
- Imperial College London / IFDSN (2017). NZ3D FWI [Seismic network], FDSN code 3C (2017-2018). https://doi.org/10.7914/SN/3C_2017

---

### 57. Southern Lakes / Northern Fiordland High-Resolution Microseismicity Catalogue (Central Otago Seismic Array, COSA)
*type: background · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** COSA microearthquake catalogue; Warren-Smith et al. (2017) Southern South Island microseismicity catalogue; FDSN network 6S (Central Otago Seismic Array)
- **Coverage:** 2012-06 → 2013-03
- **Region:** Southern Lakes / northern Fiordland, southern South Island, New Zealand (zone adjacent to the southern Alpine Fault)
- **Content:** hypocentral locations, relative relocations, phase arrival-time picks, focal mechanisms, quality information
- **Producer / contact:** Emily Warren-Smith (lead author); co-authors Simon Lamb, Tim A. Stern, Euan Smith — Victoria University of Wellington (VUW). COSA network operated by Victoria University of Wellington.
- **Data source:** Central Otago Seismic Array (COSA), FDSN network code 6S, ~8 temporary broadband stations operated by Victoria University of Wellington supplementing the permanent GeoNet network; stations installed mid-2012 to early 2013 (~June 2012-March 2013). A new 15-month high-resolution microearthquake catalogue derived from these recordings, including relocations and (in the companion paper) focal mechanisms and stress inversions.
- **Availability:** available on request

Built to image diffuse crustal-to-mantle microseismicity in the Southern Lakes and northern Fiordland region adjacent to the southern Alpine Fault, and to test mechanisms of crustal deformation in an obliquely convergent (transpressive) Australian-Pacific plate boundary zone. The catalogue documents shallow (<25 km) distributed crustal seismicity across a ~150 km-wide zone plus deeper/upper-mantle events, interpreted as distributed shear and crustal thickening. A companion paper (Warren-Smith et al., 2017) derives the stress field and kinematics from the same dataset.

**Key references:**
- Warren-Smith, E., Lamb, S., Stern, T.A., & Smith, E. (2017). Microseismicity in Southern South Island, New Zealand: Implications for the Mechanism of Crustal Deformation Adjacent to a Major Continental Transform. Journal of Geophysical Research: Solid Earth, 122(11), 9208-9227. https://doi.org/10.1002/2017JB014732
- Warren-Smith, E., Lamb, S., & Stern, T.A. (2017). Stress field and kinematics for diffuse microseismicity in a zone of continental transpression, South Island, New Zealand. Journal of Geophysical Research: Solid Earth, 122(4), 2798-2811. https://doi.org/10.1002/2017JB013942
- Victoria University of Wellington. Central Otago Seismic Array (COSA), FDSN network code 6S (2012-2030). https://www.fdsn.org/networks/detail/6S_2012/

---

### 58. Dunedin Region Short-Term Broadband Array Microseismicity Catalogue (Akatore Fault)
*type: background · focus: geographical · detection: template-matching · review: reviewed*

- **Also known as:** Todd et al. (2020) Dunedin microseismicity catalogue; Dunedin short-term broadband seismic array catalogue; Akatore Fault microseismicity cluster
- **Coverage:** unknown — not documented (short-term deployments; exact array dates not extracted from accessible sources) → unknown — not documented
- **Region:** Dunedin region / Akatore Fault, eastern Otago, southern South Island, New Zealand
- **Content:** hypocentral locations, phase arrival-time picks, quality information, other (template/matched-filter detections)
- **Producer / contact:** Erin K. Todd (lead author); co-authors Mark W. Stirling, Bill Fry, Jerome Salichon, Pilar Villamor — University of Otago (Stirling) / GNS Science (Fry, Salichon, Villamor)
- **Data source:** Short-term temporary broadband seismic array deployments in/around Dunedin (a low-seismicity region), supplementing the permanent GeoNet national network. Matched-filter (template-matching) analysis using a master event detected events absent from the GeoNet national catalogue, including a microearthquake cluster at the northern end of the Akatore Fault (<15 km from Dunedin city centre).
- **Availability:** available on request

Produced to characterise microseismicity in a low-seismicity region (Dunedin) where the sparse permanent network under-detects small events, and to demonstrate the value of short-term dense broadband arrays for hazard assessment. Using template/matched-filter detection it revealed otherwise-undetected microseismicity, notably a cluster at the northern Akatore Fault — consistent with paleoseismic evidence that the fault is in an elevated-activity state after ~110 ka of quiescence.

**Key references:**
- Todd, E.K., Stirling, M.W., Fry, B., Salichon, J., & Villamor, P. (2020). Characterising microseismicity in a low seismicity region: applications of short-term broadband seismic arrays in Dunedin, New Zealand. New Zealand Journal of Geology and Geophysics, 63(3), 331-341. https://doi.org/10.1080/00288306.2019.1707238

---

### 59. Hawke's Bay Region Microearthquake Catalogue (Bannister 1988; subducting Pacific plate fine structure)
*type: background · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** Bannister (1988) Hawke's Bay microseismicity catalogue; Hawke's Bay 11-station temporary network microearthquake dataset
- **Coverage:** unknown — not documented (mid-1980s; deployment year not stated in accessible sources) → unknown — not documented (two-month deployment)
- **Region:** Hawke's Bay, eastern North Island, New Zealand (Hikurangi subduction forearc)
- **Events:** more than 350 micro-earthquakes (recorded over two months)
- **Content:** hypocentral locations, phase arrival-time picks, other (velocity-structure inversion)
- **Data source:** Temporary dense onshore network of 11 seismograph stations in the Hawke's Bay region; >350 micro-earthquakes recorded over a two-month deployment (mid-1980s). Hypocentres located and the data inverted for P-wave velocity/structure of the shallow subducting Pacific plate.
- **Availability:** not available

Produced to image the fine structure of the shallow subducting Pacific plate beneath Hawke's Bay using a short, dense temporary seismograph deployment. From >350 microearthquakes the study resolved a thin (~11-12 km) low P-velocity band interpreted as subducted sediments, with the slab dipping ~6° beneath Hawke Bay and steepening (>20°) westward. It provides an early, citable regional microseismicity product for a North Island east-coast area lacking inventoried 1980s dense-array catalogues.

**Key references:**
- Bannister, S.C. (1988). Microseismicity and Velocity Structure in the Hawke's Bay Region, New Zealand: Fine Structure of the Subducting Pacific Plate. Geophysical Journal International, 95(1), 45-62. https://doi.org/10.1111/j.1365-246X.1988.tb00449.x

---

## Temporary offshore / ocean-bottom (OBS) deployments (5)

### 60. HOBITSS Microearthquake Catalogue (2014-2015, northern Hikurangi, manual)
*type: background · focus: particular-event-type · detection: manual · review: reviewed*

- **Also known as:** HOBITSS; Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip; YH (2014); Yarce et al. 2019 catalogue
- **Coverage:** 2014-06 → 2015-05
- **Region:** Northern Hikurangi subduction margin (offshore Gisborne/Poverty Bay)
- **Bounding box:** approx 37.5S-39.3S, 176.5E-179.5E (offshore Gisborne / northern Hikurangi margin, North Island)
- **Magnitude:** approx M0.5-4.7 (local magnitude)
- **Events:** approx 2,300 (approximate)
- **Content:** hypocentral locations; phase arrival-time picks
- **Producer / contact:** Jefferson Yarce / Anne F. Sheehan (CIRES, University of Colorado Boulder); HOBITSS PIs incl. Laura Wallace, Susan Schwartz, Spahr Webb, Kimihiro Mochizuki, Stuart Henrys; network operated by University of Texas at Austin
- **Data source:** HOBITSS ocean-bottom seismometer array (FDSN network YH, 2014) deployed on the northern Hikurangi margin seafloor, supplemented by onshore GeoNet permanent stations; manual P- and S-wave picking and hypocentre location
- **Availability:** available (DOI) · DOI [10.5281/zenodo.2022405](https://doi.org/10.5281/zenodo.2022405)

Built to investigate whether a spatial/temporal relationship exists between microseismicity and the shallow ~2-week September-October 2014 slow slip event (SSE) targeted by the year-long HOBITSS deployment above the northern Hikurangi plate interface. Earthquakes were detected and located by hand-picking P/S arrivals on OBS plus onshore GeoNet stations. The catalogue reveals a 'microseismicity gap' bordering the 2014 slow-slip patch, later reused by Yarce et al. (2023).

**Key references:**
- Yarce, J., Sheehan, A. F., Nakai, J. S., Schwartz, S. Y., Mochizuki, K., Savage, M. K. K., et al. (2019). Seismicity at the Northern Hikurangi Margin, New Zealand, and Investigation of the Potential Spatial and Temporal Relationships With a Shallow Slow Slip Event. Journal of Geophysical Research: Solid Earth, 124(5), 4751-4766. https://doi.org/10.1029/2018JB017211
- Yarce, J. (2018). HOBITSS earthquake catalog 2014-2015, Hikurangi margin, New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.2022405
- University of Texas at Austin (2014). Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip (HOBITSS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YH_2014

---

### 61. HOBITSS Automatic-Detection Earthquake Catalogue (2014 SSE, REST detector)
*type: background · focus: particular-event-type · detection: automatic · review: non-reviewed*

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

---

### 62. Brothers Volcano Ocean-Bottom Hydrophone Seismicity Catalogue (south Kermadec arc)
*type: background · focus: geographical · detection: other · review: reviewed*

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

---

### 63. Monowai Submarine Volcano Long-Range Hydroacoustic (T-phase) Activity Catalogue
*type: induced · focus: particular-event-type · detection: other · review: reviewed*

- **Also known as:** Metz et al. (2018) Monowai T-phase catalogue; Tracking Submarine Volcanic Activity at Monowai
- **Coverage:** 2003-07 → 2017-01
- **Region:** Northern Kermadec Arc (Monowai volcanic centre), offshore New Zealand / Kermadec territory, SW Pacific
- **Bounding box:** Point source: Monowai volcanic centre ~25.9 deg S, 177.2 deg W (northern Kermadec Arc, SW Pacific). Detected via IMS hydrophone array near Juan Fernandez Islands.
- **Magnitude:** Detection threshold reported as ~2.2 mb in the Kermadec Arc region (about one order of magnitude better than regional land networks). The '1.4-4.2 mb' arrival range from the proposal brief was NOT corroborated in the sources accessed; treat as unverified.
- **Events:** 82 discrete activity episodes (Jul 2003-Mar 2004 and Apr 2014-Jan 2017)
- **Content:** other (long-range hydroacoustic T-phase detections / activity episodes), quality information, amplitude picks
- **Producer / contact:** D. Metz (University of Oxford); A. B. Watts (University of Oxford); I. Grevemeyer (GEOMAR Helmholtz Centre for Ocean Research Kiel)
- **Data source:** Long-range hydroacoustic (T-phase) recordings from a CTBTO International Monitoring System (IMS) hydrophone array located near the Juan Fernandez Islands (SE Pacific, ~17,000 km distant); direction-of-arrival and density-based spatial clustering analysis of 3.5 years of recordings to track Monowai volcanic centre.
- **Availability:** available (DOI) · DOI [10.1029/2018JB015888](https://doi.org/10.1029/2018JB015888)

A hydroacoustic event catalogue tracking eruptive/seismic activity at the Monowai submarine volcanic centre, northern Kermadec Arc (within New Zealand's Kermadec territory). Produced to demonstrate that ultra-long-range SOFAR-channel T-phase recordings from distant IMS hydrophone arrays can resolve submarine volcanic activity roughly one order of magnitude smaller than land-based seismic networks. 82 discrete episodes of activity were identified across two recording windows. Distinct from the Brothers volcano local OBH T-wave catalogue (different volcano; remote IMS hydrophone array rather than local ocean-bottom instruments).

**Key references:**
- Metz, D., Watts, A. B., & Grevemeyer, I. (2018). Tracking Submarine Volcanic Activity at Monowai: Constraints From Long-Range Hydroacoustic Measurements. Journal of Geophysical Research: Solid Earth, 123, 7877-7895. https://doi.org/10.1029/2018JB015888
- Metz, D., Watts, A. B., Grevemeyer, I., Rodgers, M., & Paulatto, M. (2016). Ultra-long-range hydroacoustic observations of submarine volcanic activity at Monowai, Kermadec Arc. Geophysical Research Letters. https://doi.org/10.1002/2015GL067259

---

### 64. Dataset of Earthquakes in the Northern Hikurangi Subduction Zone During the 2019 Slow Slip Event (2018-2019 OBS deployment)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

- **Also known as:** Iwasaki et al. (2025) northern Hikurangi 2019 SSE OBS catalogue; Zenodo 15713529
- **Coverage:** 2018 → 2019
- **Region:** Northern Hikurangi subduction zone, offshore Gisborne, Aotearoa New Zealand
- **Events:** 964 located events
- **Content:** hypocentral locations, phase arrival-time picks, other (event waveforms, instrument responses, station coordinates)
- **Producer / contact:** Y. (Yuriko) Iwasaki (lead author); co-authors S. Schwartz, K. Mochizuki, H. Crume, D. Bassett, T. Yamada, D. Morad
- **Data source:** Ocean-bottom seismometer (OBS) network deployed 2018-2019 directly above the main slip region of the 2019 northern Hikurangi slow slip event, offshore Gisborne; high-resolution catalogue built with a detailed velocity model plus machine-learning and template-matching detection. Archive includes the earthquake catalogue, three-component OBS event waveforms, instrument (pole-zero) responses, and station coordinates.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.15713529](https://doi.org/10.5281/zenodo.15713529)

An OBS earthquake catalogue from a deployment directly above the main slip region of the large 2019 northern Hikurangi slow slip event, offshore Gisborne, New Zealand. Produced to characterise how the SSE modulated nearby seismicity, revealing intraslab seismicity near subducted seamounts reactivated by the slow slip and potentially influenced by fluid migration. Distinct from the earlier HOBITSS 2014-2015 manual (Yarce et al. 2019) and auto-detection (Yarce et al. 2023) catalogues - this covers the later 2018-2019 OBS deployment and the 2019 SSE.

**Key references:**
- Iwasaki, Y., Schwartz, S., Mochizuki, K., Crume, H., Bassett, D., Yamada, T., & Morad, D. (2025). Intraslab Seismicity Near Subducted Seamounts Induced by the 2019 Large Slow Slip Event Offshore the Northern Hikurangi Subduction Zone, New Zealand. Journal of Geophysical Research: Solid Earth, 130(12). https://doi.org/10.1029/2025JB031751
- Iwasaki, Y., Schwartz, S., Mochizuki, K., Crume, H., Bassett, D., Yamada, T., & Morad, D. (2025). Dataset of earthquakes in the northern Hikurangi subduction zone, New Zealand, during the 2019 slow slip event [Data set]. Zenodo. https://doi.org/10.5281/zenodo.15713529

---

## Volcano-seismic, geothermal & induced catalogues (17)

### 65. Okataina Volcanic Centre Double-Difference Relocated Catalogue (2010-2021)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 66. Taupo Volcano Magmatic-Seismicity Catalogue (2019-2022 ECLIPSE temporary deployment)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 67. Taupo 2019 Volcanic Unrest Earthquake Catalogue (Illsley-Kemp et al. 2021)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

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

---

### 68. Taupo 2022-2023 Volcanic Unrest Seismicity Catalogue (Lamb et al. 2024)
*type: background · focus: particular-event-type · detection: manual · review: reviewed*

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

---

### 69. Cascading Earthquake Swarms, Northern Taupo Volcanic Zone (2019, Aber et al. 2025)
*type: background · focus: geographical · detection: other · review: reviewed*

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

---

### 70. Tarawera 2019 Dyke-Intrusion Earthquake Catalogue (Puhipuhi, Okataina; Benson et al. 2021)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

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

---

### 71. Waimangu-Rotomahana-Mt Tarawera Geothermal Field Earthquake Swarm Catalogue (2004-2015)
*type: background · focus: geographical · detection: manual · review: reviewed*

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

---

### 72. Mt Ruapehu Earthquake Swarm Catalogue (1990-2023)
*type: background · focus: geographical · detection: machine-learning · review: reviewed*

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

---

### 73. Whakaari/White Island Very-Long-Period (VLP) Earthquake Catalogue (2007-2019)
*type: background · focus: particular-event-type · detection: other · review: reviewed*

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

---

### 74. Ngatamariki Geothermal Injection-Induced Microseismicity Catalogue (2012-2015)
*type: induced · focus: particular-event-type · detection: template-matching · review: reviewed*

- **Also known as:** Hopp et al. 2019 Ngatamariki matched-filter catalogue
- **Coverage:** 2012 → 2015
- **Region:** Ngatamariki geothermal field, Taupo Volcanic Zone
- **Bounding box:** Ngatamariki geothermal field, central Taupo Volcanic Zone, North Island, New Zealand
- **Depth range:** ~1-3 km (reservoir)
- **Magnitude:** ML ~0.26-3.17
- **Events:** ~77,457 total (templates + detections); ~41,114 located (approximate)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; focal mechanisms; other
- **Producer / contact:** Chet Hopp / John Townend & Martha Savage, Victoria University of Wellington (with Mercury NZ)
- **Data source:** Mercury NZ operator temporary seismic network at Ngatamariki plus GeoNet; matched-filter (template-matching) detection
- **Availability:** available on request · DOI [10.1029/2019GC008243](https://doi.org/10.1029/2019GC008243)

Catalogue of injection/stimulation-induced microseismicity at the Ngatamariki geothermal field tied to 2012-2015 well stimulation and injection, built by matched-filter detection. Reports very large numbers of detections (templates plus matched-filter detections), a located subset in a ~1-3 km reservoir (ML ~0.26-3.17), and includes focal mechanisms, examining the relationship between injection and induced seismicity.

**Key references:**
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2019). Seismic Response to Injection Well Stimulation in a High-Temperature, High-Permeability Reservoir. Geochemistry, Geophysics, Geosystems, 20, 2848-2871. https://doi.org/10.1029/2019GC008243

---

### 75. Rotokawa Geothermal Field Induced Microseismicity Catalogue (2012-2015)
*type: induced · focus: particular-event-type · detection: template-matching · review: reviewed*

- **Also known as:** Hopp et al. 2020 Rotokawa matched-filter catalogue
- **Coverage:** 2012 → 2015
- **Region:** Rotokawa geothermal field, Taupo Volcanic Zone
- **Bounding box:** Rotokawa geothermal field, central Taupo Volcanic Zone, North Island, New Zealand
- **Depth range:** ~1-3 km (reservoir)
- **Magnitude:** ML ~0.37-3.52; Mc ~0.74
- **Events:** ~25,148 events (2,665 templates); ~6,500 relocated (approximate)
- **Content:** hypocentral locations; relative relocations; phase arrival-time picks; other
- **Producer / contact:** Chet Hopp / John Townend & Martha Savage, Victoria University of Wellington (with Mercury NZ)
- **Data source:** Mercury NZ operator temporary seismic network at Rotokawa plus GeoNet; matched-filter (template-matching) detection and double-difference relocation
- **Availability:** available on request · DOI [10.1016/j.geothermics.2019.101750](https://doi.org/10.1016/j.geothermics.2019.101750)

A ~four-year matched-filter catalogue of induced/produced seismicity at the Rotokawa geothermal field, examining the seismic response to evolving injection. Reports thousands of templates yielding tens of thousands of detected events, with a relocated subset in a ~1-3 km reservoir (ML ~0.37-3.52, Mc ~0.74).

**Key references:**
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2020). Seismic response to evolving injection at the Rotokawa geothermal field, New Zealand. Geothermics, 85, 101750. https://doi.org/10.1016/j.geothermics.2019.101750

---

### 76. Rotokawa & Ngatamariki Combined Matched-Filter Catalogue (2012-2015, anisotropy)
*type: induced · focus: parameter-testing · detection: template-matching · review: reviewed*

- **Also known as:** Mroczek et al. 2020 combined geothermal catalogue
- **Coverage:** 2012 → 2015
- **Region:** Rotokawa & Ngatamariki geothermal fields, Taupo Volcanic Zone
- **Bounding box:** Rotokawa and Ngatamariki geothermal fields, central Taupo Volcanic Zone, North Island, New Zealand
- **Depth range:** ~1-3 km (reservoirs)
- **Events:** ~160,000 matched-filter detections; ~17,702 used for shear-wave splitting (approximate)
- **Content:** hypocentral locations; phase arrival-time picks; other
- **Producer / contact:** Stefan Mroczek / Martha K. Savage, Victoria University of Wellington (with Mercury NZ)
- **Data source:** Combined Rotokawa + Ngatamariki matched-filter microseismicity (Mercury NZ networks + GeoNet); shear-wave splitting analysis
- **Availability:** available on request · DOI [10.1093/gji/ggz400](https://doi.org/10.1093/gji/ggz400)

A combined Rotokawa + Ngatamariki induced-microseismicity catalogue (~2012-2015) used to measure shear-wave splitting and track reservoir stress and fracture changes with production/injection. Reports on the order of ~160,000 matched-filter detections, of which ~17,702 events were used for the shear-wave-splitting analysis. Distinct from the single-field Hopp 2019/2020 catalogues by combining both fields and adding SWS.

**Key references:**
- Mroczek, S., Savage, M.K., Hopp, C., & Sewell, S.M. (2020). Anisotropy as an indicator for reservoir changes: example from the Rotokawa and Ngatamariki geothermal fields, New Zealand. Geophysical Journal International, 220(1), 1-17. https://doi.org/10.1093/gji/ggz400

---

### 77. Rotorua and Kawerau Geothermal Systems Relocated Seismicity Catalogue (1984-2004; Clarke et al. 2009)
*type: background · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** Clarke et al. 2009 Rotorua-Kawerau relocated seismicity; Rotorua and Kawerau geothermal seismicity (TVZ)
- **Coverage:** 1984 → 2004
- **Region:** Rotorua and Kawerau geothermal fields, central/eastern Taupo Volcanic Zone, North Island, New Zealand
- **Bounding box:** Two sub-areas in the central/eastern Taupo Volcanic Zone, North Island, New Zealand: Rotorua geothermal system (~38.1S, 176.25E) and Kawerau geothermal field (~38.07S, 176.74E).
- **Depth range:** Shallow crustal, approximately 0-20 km (datasets defined as events <=20 km depth)
- **Magnitude:** Local magnitude (ML); low-magnitude microseismicity to small earthquakes.
- **Events:** Input datasets: 504 shallow earthquakes around Rotorua and 1875 around Kawerau (1984-2004); relocated hypocentres computed for 155 (Rotorua) and 400 (Kawerau) earthquakes using combined cross-correlation and catalogue arrival times.
- **Content:** hypocentral locations, relative relocations, phase arrival-time picks, quality information, focal mechanisms
- **Producer / contact:** D. Clarke (lead author); J. Townend, M.K. Savage (Victoria University of Wellington); S. Bannister (GNS Science). Underlying picks/waveforms: GeoNet / GNS Science.
- **Data source:** Earthquakes recorded by the New Zealand national seismograph network and local stations around the Rotorua and Kawerau geothermal areas; parent catalogue arrival-time picks plus newly computed cross-correlation differential travel times. New 1-D P/S velocity models and station corrections derived with VELEST; relocation with HypoDD double-difference algorithm.
- **Availability:** available on request · DOI [10.1016/j.jvolgeores.2008.11.004](https://doi.org/10.1016/j.jvolgeores.2008.11.004)

A dedicated double-difference (HypoDD) relocated earthquake catalogue for two Taupo Volcanic Zone geothermal systems (Rotorua city / Mt Ngongotaha and the Kawerau geothermal field), produced to clarify the nature of faulting and the relationship between seismicity and known/inferred geological structures in these fields. New 1-D velocity models and station corrections were derived and a subset of events relocated using a combination of catalogue and cross-correlation arrival times. It is distinct from the inventoried TVZ-wide high-precision 2007-2023 catalogue: an earlier period, field-specific focus, and different methods.

**Key references:**
- Clarke, D., Townend, J., Savage, M.K., Bannister, S. (2009). Seismicity in the Rotorua and Kawerau geothermal systems, Taupo Volcanic Zone, New Zealand, based on improved velocity models and cross-correlation measurements. Journal of Volcanology and Geothermal Research, 180(1), 50-66. https://doi.org/10.1016/j.jvolgeores.2008.11.004

---

### 78. Rotokawa Geothermal Field Microseismicity Catalogue 2008-2012 (Sherburn et al. 2015)
*type: induced · focus: geographical · detection: manual · review: reviewed*

- **Also known as:** Sherburn et al. 2015 Rotokawa microseismicity; Microseismicity at Rotokawa geothermal field 2008-2012
- **Coverage:** 2008 → 2012
- **Region:** Rotokawa geothermal field, central Taupo Volcanic Zone, North Island, New Zealand
- **Bounding box:** Rotokawa geothermal field, central Taupo Volcanic Zone, North Island, New Zealand (~38.62S, 176.20E); most events confined to a ~1 km^2 zone between reinjection and production wells.
- **Depth range:** Shallow reservoir depths; >70% of events concentrated ~1.5-3 km depth
- **Magnitude:** ML; >1000 events ML>=0.8, ~50 events ML>=2, 2 events ML>=3 (largest M3.1). Stated completeness around ML~0.8.
- **Events:** >1000 events of ML>=0.8 located mid-2008 to end-2012 (50 of ML>=2; 2 of ML>=3)
- **Content:** hypocentral locations, phase arrival-time picks, quality information
- **Producer / contact:** S. Sherburn (lead author, GNS Science) and co-authors S.M. Sewell, S. Bourguignon, W. Cumming, S. Bannister, C. Bardsley, J. Winick, J. Quinao, I.C. Wallis (GNS Science / Mighty River Power / Contact / consultants).
- **Data source:** Events located by the local Rotokawa geothermal-field seismic network (operator monitoring), 2008-2012; located using local-network arrival-time picks. Interpreted in the context of deep fluid reinjection (e.g. Nga Awa Purua power station) and production records.
- **Availability:** available (DOI) · DOI [10.1016/j.geothermics.2014.11.001](https://doi.org/10.1016/j.geothermics.2014.11.001)

A field-specific induced-microseismicity catalogue for the Rotokawa geothermal field (TVZ) covering mid-2008 to end-2012, interpreted as injection-induced via cooling-driven reservoir contraction (reinjected fluid ~200 C cooler than the reservoir). It documents the spatial-temporal variation of microseismicity and its close correlation with deep reinjection rate. It is distinct from the inventoried Rotokawa matched-filter catalogue (Hopp et al. 2020, 2012-2015) and the Mroczek et al. 2020 anisotropy catalogue (2012-2015): different time window and detection approach (local-network locations rather than 2012-2015 array template matching).

**Key references:**
- Sherburn, S., Sewell, S.M., Bourguignon, S., Cumming, W., Bannister, S., Bardsley, C., Winick, J., Quinao, J., Wallis, I.C. (2015). Microseismicity at Rotokawa geothermal field, New Zealand, 2008-2012. Geothermics, 54, 23-34. https://doi.org/10.1016/j.geothermics.2014.11.001

---

### 79. Wairakei Geothermal Field Microseismicity Catalogue (Wairakei Seismic Network; Sepulveda et al. 2015)
*type: induced · focus: geographical · detection: manual · review: partially reviewed*

- **Also known as:** Wairakei Seismic Network (WSN) microseismicity; Spatial-temporal Characteristics of Microseismicity (2009-2014) of the Wairakei Geothermal Field (Sepulveda et al. 2015, WGC); Wairakei-Tauhara downhole microseismic catalogue
- **Coverage:** 2009-03 → ongoing
- **Region:** Wairakei-Tauhara geothermal field, central Taupo Volcanic Zone, North Island, New Zealand
- **Bounding box:** Wairakei-Tauhara geothermal field, central Taupo Volcanic Zone, North Island, New Zealand (~38.62S, 176.10E).
- **Depth range:** Shallow crustal; ~0 to ~8.5 km, with 95% of seismicity reported above ~6.5 km and 99% above ~8.5 km, constraining the reservoir base
- **Magnitude:** Microseismicity (low magnitude)
- **Events:** 5,649 located events (March 2009 - April 2013), per Sepulveda et al. (2015) and Sepulveda et al. (2013); spatial-temporal characterization extended to 2009-2014
- **Content:** hypocentral locations, quality information
- **Producer / contact:** Fabian R. Sepulveda (Contact Energy Ltd, Wairakei) and co-authors (J. Andrews/GNS Science; J. Kim; C. Siega; S.F. Milloy). Operator: Contact Energy Ltd.
- **Data source:** Local Wairakei Seismic Network of 9-13 downhole/borehole seismometers (depths ~65 m to ~1400 m) operated by Contact Energy, commissioned from 2009; events located from local-network arrival times.
- **Availability:** available on request

A dedicated operator-run downhole borehole microseismic monitoring catalogue for the Wairakei (Wairakei-Tauhara) geothermal field, used to constrain the deep field structure, reservoir base, fluid-circulation depth and the modern (microseismicity-constrained) field boundary at depth. It is not represented in the existing inventory. Recorded by a 9-13 station borehole network commissioned from early 2009.

**Key references:**
- Sepulveda, F., Andrews, J., Kim, J., Siega, C., Milloy, S.F. (2015). Spatial-temporal Characteristics of Microseismicity (2009-2014) of the Wairakei Geothermal Field, New Zealand. Proceedings World Geothermal Congress 2015, Melbourne, Australia, 19-25 April 2015. (no DOI located)
- Sepulveda, F., Andrews, J., Alvarez, M., Montague, T., Mannington, W. (2013). Overview of Deep Structure Using Microseismicity at Wairakei. Proceedings New Zealand Geothermal Workshop 2013. (no DOI located)

---

### 80. Mt Ruapehu 2022 Volcanic Unrest Drumbeat / Tremor Seismicity Catalogue (Bramwell et al. 2025)
*type: background · focus: particular-event-type · detection: manual · review: reviewed*

- **Also known as:** Drumbeat and low frequency catalogue for 2022 unrest at Ruapehu volcano (Zenodo 13910455); Bramwell et al. 2025 Ruapehu drumbeat/tremor catalogue
- **Coverage:** 2022-03 → 2022-07
- **Region:** Mt Ruapehu, Tongariro National Park, southern Taupo Volcanic Zone, North Island, New Zealand
- **Bounding box:** Mt Ruapehu crater/summit area, southern Taupo Volcanic Zone, North Island, New Zealand (~39.28S, 175.57E)
- **Depth range:** Shallow volcanic / crater-lake hydrothermal system
- **Magnitude:** Low-frequency drumbeat earthquakes and tremor (not characterized by standard ML magnitude/Mc); analysed in time, amplitude and frequency domains
- **Events:** 42,951 LF drumbeats; ~144 h of overlapping drumbeats; >2000 h of tremor over the 121-day unrest period (7 March - 6 July 2022)
- **Content:** other (low-frequency drumbeat earthquakes and volcanic tremor; source dynamics), quality information
- **Producer / contact:** Liam A. Bramwell (lead author, Victoria University of Wellington); co-authors Finnigan Illsley-Kemp, Ery C. Hughes, Sophie Butcher, Oliver D. Lamb, Yannik Behr. Waveforms: GeoNet / GNS Science.
- **Data source:** Continuous seismic waveforms from the GeoNet permanent network around Ruapehu (19 stations within 26 km; primary station MAVZ ~1.45 km N of the crater lake). Events manually picked using the Pyrocko Snuffler toolbox. Full catalogue archived on Zenodo.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.13910455](https://doi.org/10.5281/zenodo.13910455)

A manually picked catalogue of low-frequency (LF) drumbeat earthquakes and volcanic tremor produced for Mt Ruapehu's 2022 volcanic unrest, used to characterize the source dynamics (magma ascent into the shallow system) alongside crater-lake temperature and gas data. It is a distinct event-type catalogue (LF drumbeats + tremor) not captured by the inventoried Mitchinson et al. 2024 Ruapehu ML swarm catalogue (which clusters GeoNet's standard volcano-tectonic catalogue, 1990-2023).

**Key references:**
- Bramwell, L.A., Illsley-Kemp, F., Hughes, E.C., Butcher, S., Lamb, O.D., Behr, Y. (2025). Source dynamics of Ruapehu's 2022 volcanic unrest: insights from drumbeat seismicity, tremor, and crater lake signals. Bulletin of Volcanology, 87(6), 44. https://doi.org/10.1007/s00445-025-01823-2
- Bramwell, L., Illsley-Kemp, F., Hughes, E. (2024). Drumbeat and low frequency catalogue for 2022 unrest at Ruapehu volcano, New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.13910455

---

### 81. Auckland Volcanic Field Matched-Filter Earthquake Catalogue (van Wijk et al. 2021, COVID-19 lockdown study)
*type: background · focus: geographical · detection: template-matching · review: reviewed*

- **Also known as:** AVF COVID-19 lockdown matched-filter catalogue; van Wijk et al. 2021 Auckland Volcanic Field seismicity; Auckland Volcanic Seismic Network (AVSN) detections
- **Coverage:** 2019-11 → 2020-06
- **Region:** Auckland Volcanic Field, North Island, New Zealand
- **Bounding box:** Auckland Volcanic Field, greater Auckland region, North Island, New Zealand (~36.9S, 174.8E)
- **Depth range:** Shallow crustal
- **Magnitude:** Small local earthquakes
- **Events:** 35 local earthquakes (1 Nov 2019 - 15 Jun 2020), expanded from 5 known GeoNet events (30 new detections)
- **Content:** hypocentral locations, phase arrival-time picks
- **Producer / contact:** Kasper van Wijk (lead author, University of Auckland); co-authors Calum J. Chamberlain (VUW), Thomas Lecocq (Royal Observatory of Belgium), Koen Van Noten (Royal Observatory of Belgium). Waveforms: GeoNet FDSN.
- **Data source:** Continuous seismic data from the Auckland Volcanic Seismic Network (AVSN), available via the GeoNet FDSN service. 59 known-earthquake templates used in a matched-filtering (template matching) scheme with EQcorrscan to detect additional local events; starting GeoNet catalogue of 5 known local events.
- **Availability:** available on request · DOI [10.5194/se-12-363-2021](https://doi.org/10.5194/se-12-363-2021)

A small but genuinely distinct local catalogue for the Auckland Volcanic Field (a monogenetic volcanic field not otherwise represented in the inventory). Template matched-filtering on the AVSN identified 35 local earthquakes for 1 Nov 2019-15 Jun 2020 (30 new detections beyond the 5 GeoNet events), exploiting reduced urban seismic noise during the COVID-19 lockdown. Produced to test detection capability and seismic monitoring of the AVF during the lockdown 'quieting'.

**Key references:**
- van Wijk, K., Chamberlain, C.J., Lecocq, T., Van Noten, K. (2021). Seismic monitoring of the Auckland Volcanic Field during New Zealand's COVID-19 lockdown. Solid Earth, 12(2), 363-373. https://doi.org/10.5194/se-12-363-2021
- van Wijk, K. et al. (2020). Event-detection code for the Auckland Volcanic Field COVID-19 study [Code]. University of Auckland. https://doi.org/10.17608/k6.auckland.12915551.v2

---

## Slow-slip, tremor, LFE & moment-tensor catalogues (15)

### 82. GeoNet New Zealand Earthquake Moment Tensor Solutions (MwNZ)
*type: background · focus: geographical · detection: automatic · review: partially reviewed*

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

---

### 83. Hikurangi Slow Slip Event Inventory (Wallace & Beavan 2010)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed*

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

---

### 84. 14-Year GNSS Slow Slip Event Catalogue for the Hikurangi Subduction Zone (Michel et al. 2025)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed*

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

---

### 85. Shallow Hikurangi Slow Slip Event Catalogue (Perez-Silva et al. 2025)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed*

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

---

### 86. Northern Hikurangi Tectonic Tremor Catalogue 2010-2015 (Todd & Schwartz 2016)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed*

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

---

### 87. Ambient Tectonic Tremor Catalogue: Manawatu, Cape Turnagain, Marlborough & Puysegur (Romanet & Ide 2019)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed*

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

---

### 88. Alpine Fault Low-Frequency Earthquake Catalogue (Chamberlain et al. 2014)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

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

---

### 89. Alpine Fault Low-Frequency Earthquake Catalogue with Focal Mechanisms (Baratin et al. 2018)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

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

---

### 90. Kaimanawa (Deep Hikurangi) Low-Frequency Earthquake Catalogue (Aden-Antoniow et al. 2024)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

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

---

### 91. Raukumara Peninsula Repeating Earthquake Catalogue 2003-2020 (Hughes et al. 2021)
*type: background · focus: particular-event-type · detection: template-matching · review: reviewed*

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

---

### 92. New Zealand-Wide Earthquake Focal Mechanism Catalogue for Tectonic Stress (Townend et al. 2012)
*type: compilation · focus: geographical · detection: other · review: reviewed*

- **Also known as:** Townend et al. (2012) NZ focal mechanism compilation; central NZ stress-field focal mechanism dataset
- **Coverage:** 2004-01 → 2011-02
- **Region:** Central New Zealand — Hikurangi subduction margin (North Island, including Hawke's Bay area) and South Island, along the Australia-Pacific plate boundary
- **Events:** ~3424 focal mechanisms
- **Content:** focal mechanisms; hypocentral locations; quality information
- **Producer / contact:** John Townend (lead author), Victoria University of Wellington / GNS Science; co-authors Steven Sherburn (GNS Science), Richard Arnold (VUW), Carolin Boese, Louise Woods
- **Data source:** Compiled first-motion / polarity focal mechanisms derived from earthquakes recorded by the GeoNet national seismograph network (and related temporary deployments); a purpose-built NZ-wide focal-mechanism catalogue assembled for stress-tensor inversion. Distinct from the GeoNet moment-tensor (MwNZ / Ristau RMT) product.
- **Availability:** available on request · DOI [10.1016/j.epsl.2012.08.003](https://doi.org/10.1016/j.epsl.2012.08.003)

A New Zealand-wide compilation of ~3424 earthquake focal mechanisms assembled to estimate the present-day tectonic stress field at ~100 locations across central New Zealand and map the orientation of maximum horizontal compressive stress (SHmax) along the Australia-Pacific plate boundary. Produced to characterise three-dimensional variations in stress along the Hikurangi subduction margin and South Island, and to relate stress orientation to along-strike variations in subduction-thrust coupling. It was the largest study of the NZ plate-boundary stress field at the time of publication.

**Key references:**
- Townend, J., Sherburn, S., Arnold, R., Boese, C., & Woods, L. (2012). Three-dimensional variations in present-day tectonic stress along the Australia-Pacific plate boundary in New Zealand. Earth and Planetary Science Letters, 353-354, 47-59. https://doi.org/10.1016/j.epsl.2012.08.003

---

### 93. Southeastern South Island / Otago Earthquake Focal Mechanism Catalogue (Williams et al. 2026)
*type: compilation · focus: geographical · detection: other · review: reviewed*

- **Also known as:** Williams et al. (2026) southeastern South Island focal mechanisms; Otago/Southland focal-mechanism catalogue (OtagoNet + SOSA + COSA)
- **Coverage:** unknown — not documented → unknown — not documented
- **Region:** Southeastern South Island, Aotearoa New Zealand — Otago and Southland
- **Magnitude:** MLV 1.3-4.3
- **Events:** 126 combined focal mechanisms (91 rated C-quality or better, of which 57 strike-slip); constituent solutions: 96 OtagoNet + 30 SOSA + 11 COSA (167 array solutions plus GeoNet RMT entries)
- **Content:** focal mechanisms; hypocentral locations; quality information
- **Producer / contact:** Jack Williams (lead author); co-authors Donna Eberhart-Phillips, Sandra Bourguignon, Mark Stirling, Martin Reyners, Phaedra Upton (University of Otago / GNS Science)
- **Data source:** First-motion / polarity focal mechanisms computed from earthquakes recorded by temporary regional networks: OtagoNet (Otago temporary broadband network, Reyners 2014), the Southland Otago Seismic Array (SOSA, Williams et al. 2022), and the Central Otago Seismic Array (COSA); supplemented by GeoNet regional moment-tensor (RMT) catalogue entries.
- **Availability:** available (DOI) · DOI [10.5281/zenodo.17228270](https://doi.org/10.5281/zenodo.17228270)

A regional focal-mechanism catalogue for the southeastern South Island (Otago/Southland) of Aotearoa New Zealand, compiling 126 combined nodal-plane solutions for small earthquakes (MLV 1.3-4.3) to study how oblique Australia-Pacific plate motion is accommodated. The mechanisms reveal a strike-slip stress state with a WNW-trending maximum compressive stress and are used to argue for scale-dependent partitioning of transpressional strain controlled by inherited structures. Data are deposited on Zenodo under CC-BY-4.0.

**Key references:**
- Williams, J., Eberhart-Phillips, D., Bourguignon, S., Stirling, M., Reyners, M., & Upton, P. (2026). Focal mechanisms in the southeastern South Island of Aotearoa New Zealand indicate scale-dependent partitioning of transpressional strain. Seismica, 5(1). https://doi.org/10.26443/seismica.v5i1.1839
- Williams, J., Eberhart-Phillips, D., Bourguignon, S., Stirling, M., Reyners, M., & Upton, P. (2025). Supplementary files to 'Focal mechanisms in the southeastern South Island of Aotearoa New Zealand indicate scale-dependent partitioning of transpressional strain' [Data set]. Zenodo. https://doi.org/10.5281/zenodo.17228270

---

### 94. HOBITSS Ocean-Bottom Focal-Mechanism / Stress-Tensor Cycling Catalogue, Northern Hikurangi (Warren-Smith et al. 2019)
*type: background · focus: particular-event-type · detection: other · review: reviewed*

- **Also known as:** Warren-Smith et al. (2019) HOBITSS focal mechanisms; northern Hikurangi intraslab focal-mechanism / stress-ratio cycling dataset
- **Coverage:** 2014-05 → 2015-06
- **Region:** Northern Hikurangi subduction margin, offshore Gisborne, North Island, New Zealand
- **Depth range:** ~13-15 km thick intraslab seismicity zone within the subducting Pacific oceanic crust; subduction interface seismogenic depths roughly 15-35 km (per-event depth range not tabulated in the paper)
- **Magnitude:** Earthquakes with Mw > 1.8 (lower magnitude threshold for mechanism calculation); upper range and Mc not separately documented
- **Events:** 278 intraslab earthquakes analysed (subset of Mw>1.8 GeoNet events); ~140 focal mechanisms at SSE initiation and ~80 at SSE shutdown used for stress inversions
- **Content:** focal mechanisms; hypocentral locations; quality information; other
- **Producer / contact:** Emily Warren-Smith (lead author), GNS Science, Lower Hutt; co-authors B. Fry, L. Wallace, E. Chon, S. Henrys, A. Sheehan, K. Mochizuki, S. Schwartz, S. Webb, S. Lebedev
- **Data source:** Earthquake first-motion polarity focal mechanisms computed for Mw>1.8 events from the GeoNet national seismicity catalogue, using the 2014-2015 HOBITSS (Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip) ocean-bottom seismometer network (10 broadband + 5 short-period OBS, plus 24 absolute pressure gauges) combined with onshore GeoNet stations, offshore Gisborne.
- **Availability:** available on request · DOI [10.1038/s41561-019-0367-x](https://doi.org/10.1038/s41561-019-0367-x)

A focal-mechanism catalogue for microearthquakes in the subducting Pacific oceanic crust at the northern Hikurangi margin offshore Gisborne, derived from the 2014-2015 HOBITSS ocean-bottom seismometer deployment. Used to perform time-varying stress-tensor inversions and track the stress shape ratio (R) as a proxy for fluid pressure cycling before, during, and after four shallow slow slip events. The product is distinct in content (focal mechanisms plus a stress-ratio time series) from the HOBITSS hypocentral microearthquake catalogues (Yarce et al. 2019, 2023).

**Key references:**
- Warren-Smith, E., Fry, B., Wallace, L., Chon, E., Henrys, S., Sheehan, A., Mochizuki, K., Schwartz, S., Webb, S., & Lebedev, S. (2019). Episodic stress and fluid pressure cycling in subducting oceanic crust during slow slip. Nature Geoscience, 12, 475-481. https://doi.org/10.1038/s41561-019-0367-x

---

### 95. Manawatu Deep Short-Term Slow-Slip and Tremor Catalogue (Fasola et al. 2023)
*type: background · focus: particular-event-type · detection: other · review: reviewed*

- **Also known as:** Fasola et al. (2023) Manawatu deep tremor / short-term ETS-like SSE; Manawatu/Kaimanawa deep tremor-associated slip model
- **Coverage:** 2005 → 2016
- **Region:** Manawatu and Kaimanawa region, deep central Hikurangi subduction zone, lower North Island, Aotearoa New Zealand
- **Events:** ~354 tremor events (input Romanet & Ide 2019 Manawatu catalogue), grouped into 26 tremor clusters (durations 1-80 days, ~75% of tremor); no separate event count published for the derived slip catalogue
- **Content:** hypocentral locations, fault-geometry, other
- **Producer / contact:** Shannon L. Fasola (lead author; Univ. of Kansas / KU Crustal Deformation group) — co-authors Noel M. Jackson (formerly Noel M. Bartlow, Univ. of Kansas) and Charles A. Williams (GNS Science, New Zealand)
- **Data source:** Tremor locations/times reused from the Romanet & Ide (2019) ambient-tremor catalogue (envelope cross-correlation on GeoNet permanent seismometers; ~354 Manawatu tremor events, 2005-2016). Continuous GNSS daily time-series from the GeoNet Aotearoa NZ Continuous GNSS Network (GNS Science). New products derived in this paper: time-averaged tremor-associated surface displacements/velocities and a static slip inversion (tremor-associated slip distribution) on the Hikurangi plate interface, plus identification of deep short-term ETS-like slow slip.
- **Availability:** available on request · DOI [10.1029/2023GL105428](https://doi.org/10.1029/2023GL105428)

Investigates whether small, short-term ETS-like slow-slip events occur at the deep Manawatu/Kaimanawa tremor source, where tectonic tremor lies adjacent to (not co-located with) the deep long-term Manawatu and Kaimanawa slow-slip events on the central Hikurangi subduction interface. The authors cluster existing tremor, decompose GNSS at tremor times to recover tremor-associated displacement offsets, and invert these for slip on the plate interface, concluding the interface below deep long-term SSEs likely slips frequently in small ETS-like SSEs too small to detect individually with geodesy. Distinct in focus (deep Manawatu tremor-associated slip modeling) from the northern Hikurangi tremor catalogue (Todd & Schwartz 2016) and the source ambient-tremor catalogue (Romanet & Ide 2019).

**Key references:**
- Fasola, S. L., Jackson, N. M., & Williams, C. A. (2023). Deep Short-Term Slow Slip and Tremor in the Manawatu Region, New Zealand. Geophysical Research Letters, 50(21), e2023GL105428. https://doi.org/10.1029/2023GL105428
- Romanet, P., & Ide, S. (2019). Ambient tectonic tremors in Manawatu, Cape Turnagain, Marlborough, and Puysegur, New Zealand. Earth, Planets and Space, 71, 59. https://doi.org/10.1186/s40623-019-1039-1

---

### 96. Global Centroid Moment Tensor (GCMT) catalogue (New Zealand component)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed*

- **Also known as:** Global CMT; GCMT; formerly Harvard CMT (HRV) catalog
- **Coverage:** 1976 → ongoing
- **Region:** Global; New Zealand component covers onshore NZ, Hikurangi-Kermadec subduction margin, and subantarctic region
- **Bounding box:** Global (NZ component covers approx. -50 to -33 lat, 165 to -176 lon)
- **Depth range:** 0 to ~700 km (centroid depths; global product spanning shallow crustal to deep subduction)
- **Magnitude:** Mw >= ~5.0 globally (systematic threshold); the NZ component contains moderate-to-large events at or above this threshold
- **Content:** focal mechanisms, hypocentral locations, other
- **Producer / contact:** Global CMT Project, Lamont-Doherty Earth Observatory (LDEO), Columbia University (PI: Göran Ekström; Co-PI: Meredith Nettles). Originally founded at Harvard University (1982); relocated to LDEO in 2006. NSF-funded.
- **Data source:** Long-period and broadband digital seismic waveform data from global networks (e.g. GSN/FDSN), inverted independently at LDEO/Columbia to derive centroid moment tensor solutions. Not a regional NZ network product; the NZ component is the subset of GCMT solutions located within/around New Zealand.
- **Availability:** available (DOI) · DOI [https://doi.org/10.1016/j.pepi.2012.04.002](https://doi.org/10.1016/j.pepi.2012.04.002)

The GCMT (formerly Harvard CMT) Project systematically determines centroid moment tensors and focal mechanisms for global earthquakes of M>=~5.0 since 1976, with more than 25,000 solutions. Its NZ component provides an independent, long-standing record of focal mechanisms and centroid locations for moderate-to-large events along the Hikurangi-Kermadec margin, crustal NZ, and the subantarctic region. It is distinct from the regional GeoNet/Ristau MwNZ moment-tensor catalogue, which is NZ-operated and extends to smaller events.

**Key references:**
- Dziewonski, A.M., Chou, T.-A. and Woodhouse, J.H. (1981). Determination of earthquake source parameters from waveform data for studies of global and regional seismicity. Journal of Geophysical Research, 86, 2825-2852. https://doi.org/10.1029/JB086iB04p02825
- Ekström, G., Nettles, M. and Dziewoński, A.M. (2012). The global CMT project 2004-2010: Centroid-moment tensors for 13,017 earthquakes. Physics of the Earth and Planetary Interiors, 200-201, 1-9. https://doi.org/10.1016/j.pepi.2012.04.002

---

## Derived, homogenised & synthetic / hazard-model catalogues (9)

### 97. NSHM 2010 Earthquake Catalogue (Stirling et al. 2012)
*type: background · focus: geographical · detection: other · review: reviewed*

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

---

### 98. Mw-Homogenised NZ Earthquake Catalogue for NSHM 2022 (Christophersen et al. 2022)
*type: compilation · focus: parameter-testing · detection: other · review: reviewed*

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

---

### 99. Integrated / Augmented Earthquake Catalogue for Aotearoa New Zealand (NSHM 2022; Rollins et al.)
*type: compilation · focus: geographical · detection: other · review: reviewed*

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

---

### 100. NSHM 2022 Seismicity Rate Model Distributed-Seismicity / Declustered Catalogue (Gerstenberger et al. 2024)
*type: background · focus: parameter-testing · detection: other · review: reviewed*

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

---

### 101. RSQSim Synthetic Earthquake Catalogue for New Zealand (NSHM2012 fault system, 276 kyr)
*type: background · focus: parameter-testing · detection: other · review: non-reviewed*

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

---

### 102. RSQSim Synthetic Earthquake Catalogue + Ground Motions for New Zealand (NZNSHM22 fault system)
*type: background · focus: parameter-testing · detection: other · review: non-reviewed*

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

---

### 103. Hikurangi Trench Earthquake-Swarm Catalogue (ETAS-based, Nishikawa et al. 2021)
*type: compilation · focus: particular-event-type · detection: other · review: non-reviewed*

- **Also known as:** Nishikawa Hikurangi swarm catalog; ETAS swarm catalogue, Hikurangi Trench (1997-2015)
- **Coverage:** 1997 → 2015
- **Region:** Hikurangi Trench / Hikurangi subduction margin, North Island, New Zealand (offshore eastern margin)
- **Magnitude:** M>=3; magnitude of completeness (Mc) estimated to vary in time: 3.0 (1997-2001), 2.7 (2002-2006), 2.5 (2007-2011), 3.1 (2012-2015), attributed to changes in the GeoNet location algorithm/procedure in 2012
- **Content:** hypocentral locations; quality information; other (statistical swarm classification / background-rate anomalies)
- **Producer / contact:** Tomoaki Nishikawa (lead author); at time of publication Graduate School of Science / Disaster Prevention Research Institute, Kyoto University, Japan. Co-authors Takuya Nishimura and Yutaro Okada.
- **Data source:** Derived by applying the epidemic-type aftershock-sequence (ETAS) model to the GeoNet New Zealand earthquake catalogue (M>=3, 1997-2015) to statistically separate background/swarm seismicity from aftershock sequences along the Hikurangi Trench.
- **Availability:** DOI [10.1029/2020JB020618](https://doi.org/10.1029/2020JB020618)

A derived, declustering-type catalogue produced to study the spatiotemporal relationship between seismicity and slow slip events (SSEs) along the Hikurangi subduction margin. The authors fitted the ETAS model to GeoNet data to identify anomalous earthquake swarms (statistically elevated background rate) and built a new swarm catalogue, finding many swarms occur as intraplate events lagging SSEs by days or more. The focus is on isolating SSE-associated swarm activity rather than cataloguing all seismicity.

**Key references:**
- Nishikawa, T., Nishimura, T., & Okada, Y. (2021). Earthquake Swarm Detection Along the Hikurangi Trench, New Zealand: Insights Into the Relationship Between Seismicity and Slow Slip Events. Journal of Geophysical Research: Solid Earth, 126(4), e2020JB020618. https://doi.org/10.1029/2020JB020618

---

### 104. EEPAS Lag-Compensated Earthquake Forecast for Central New Zealand (Rhoades et al. 2022)
*type: compilation · focus: parameter-testing · detection: other · review: reviewed*

- **Also known as:** EEPAS (Every Earthquake a Precursor According to Scale) lag-compensated medium-term forecast, central New Zealand; EEPAS-TLC
- **Coverage:** 2019 → 2030
- **Region:** Central New Zealand (Wellington / Cook Strait region); broader EEPAS reviewed for NZ, California, Japan, Italy, Greece and synthetic catalogues
- **Bounding box:** Central New Zealand; a 2-degree rectangle centred on Wellington ~173-177 E, 39-43 S (per the 2019 central-NZ forecast paper; the 2022 review is global in scope)
- **Magnitude:** Forecast target magnitudes M>=6.0, 6.5, 7.0, 7.5, 8.0 (central-NZ lag-compensated forecast); model fitted using NZ catalogue data with lower magnitude thresholds for precursory seismicity
- **Content:** other (forecast occurrence-rate / probability grids; not observed events)
- **Producer / contact:** David A. Rhoades (lead author), GNS Science (Te Pu Ao / Earth Sciences New Zealand), Lower Hutt; co-authors Sepideh J. Rastin and Annemarie Christophersen (2022 review). The central-NZ-to-2030 forecast product itself is Rhoades & Christophersen, GNS Science.
- **Data source:** Derived/forecasting product: the EEPAS model fitted to the GeoNet New Zealand earthquake catalogue, producing gridded medium-term forecast occurrence-rate / probability estimates rather than observed events.
- **Availability:** available on request · DOI [10.3390/geosciences12090349](https://doi.org/10.3390/geosciences12090349)

A derived forecasting product, not a discrete event catalogue. EEPAS treats every earthquake as a precursor contributing a transient increment to the expected rate of larger events via empirical predictive scaling relations; the lag-compensated (time-lag) variant corrects the model's tendency to underpredict when forecasting periods beginning several years ahead. It was produced to forecast medium-term M>=6.0-8.0 occurrence in central New Zealand and is the EEPAS medium-term component of NZ public/operational earthquake forecasts.

**Key references:**
- Rhoades, D. A., Rastin, S. J., & Christophersen, A. (2022). A 20-Year Journey of Forecasting with the 'Every Earthquake a Precursor According to Scale' Model. Geosciences, 12(9), 349. https://doi.org/10.3390/geosciences12090349
- Rhoades, D. A., & Christophersen, A. (2019). Time-varying probabilities of earthquake occurrence in central New Zealand based on the EEPAS model compensated for time-lag. Geophysical Journal International, 219(1), 417-429. https://doi.org/10.1093/gji/ggz301

---

### 105. New Zealand Earthquake Forecast Testing Centre (CSEP-NZ) Authorized Test Catalogue
*type: compilation · focus: parameter-testing · detection: other · review: reviewed*

- **Also known as:** CSEP-NZ testing catalogue; NZ Earthquake Forecast Testing Centre authorized catalogue; CSEP New Zealand evaluation catalogue
- **Coverage:** 2008 → ongoing
- **Region:** New Zealand (CSEP-NZ collection/testing region)
- **Depth range:** 0-40 (epicentral depths h<=40 km included in the test region)
- **Magnitude:** Short-term models tested at M>=4 (24-hour bins); intermediate-term and long-term models tested at M>=5 (3-month, 6-month and 5-year bins); depth cutoff h<=40 km
- **Content:** hypocentral locations; quality information; other (authorized/binned test catalogue for forecast scoring)
- **Producer / contact:** Matthew C. Gerstenberger & David A. Rhoades, GNS Science (Te Pu Ao / Earth Sciences New Zealand), Lower Hutt; operated under the Collaboratory for the Study of Earthquake Predictability (CSEP).
- **Data source:** Processed/filtered subset of the GeoNet New Zealand earthquake catalogue, authorized and binned (time/magnitude/location) for prospective scoring of forecast models within the CSEP testing infrastructure.
- **Availability:** available on request

A derived 'authorized' evaluation catalogue: the GeoNet NZ catalogue filtered to defined magnitude/depth thresholds and binned in time-magnitude-space cells, used as the observation set against which prospective earthquake-forecast models are scored (N, L and R tests) in the CSEP New Zealand testing centre. It was created as forecast-testing infrastructure to enable verifiable prospective evaluation of time-varying earthquake-occurrence models for the NZ region, with tests running from the start of 2008.

**Key references:**
- Gerstenberger, M. C., & Rhoades, D. A. (2010). New Zealand Earthquake Forecast Testing Centre. Pure and Applied Geophysics, 167(8-9), 877-892. https://doi.org/10.1007/s00024-010-0082-4

---

## Strong-motion & ground-motion databases (2)

### 106. New Zealand Strong Motion Database (NZSMDB)
*type: compilation · focus: particular-event-type · detection: other · review: reviewed*

- **Also known as:** NZSMDB; NZ Strong Motion Database; GeoNet/GNS Science strong-motion database; Van Houtte et al. (2017) database
- **Coverage:** 1968 → ongoing
- **Region:** New Zealand (incl. Hikurangi and Fiordland subduction margins; crustal and subducting-plate seismicity)
- **Events:** 276 earthquakes (4,148 uniformly-processed recordings; 598 of 756 three-component accelerograms identified as suitable for time-domain structural response analyses)
- **Content:** hypocentral locations, fault-geometry, quality information, other
- **Producer / contact:** Chris Van Houtte (lead author); GNS Science / GeoNet (producing institution). Co-authors: Stephen Bannister, Caroline Holden, Sandra Bourguignon, Graeme McVerry.
- **Data source:** Strong-motion (accelerograph) recordings from the GeoNet network and earlier NZ strong-motion network operators, compiled and uniformly reprocessed by GNS Science. Event source parameters (hypocentres, magnitudes) and rupture models derived from seismic and geodetic data; site metadata characterised separately for GeoNet stations.
- **Availability:** available (DOI) · DOI [https://doi.org/10.5459/bnzsee.50.1.1-20](https://doi.org/10.5459/bnzsee.50.1.1-20)

GNS Science/GeoNet engineering strong-motion database compiling 276 NZ earthquakes (Mw 3.5-7.8) recorded by strong-motion instruments and uniformly processed into 4,148 recordings, to provide a consistent, high-quality dataset for ground-motion modelling and seismic-hazard/engineering applications. Beyond the ground-motion products it carries an explicit event component: recomputed source parameters (hypocentres, magnitudes), rupture models for selected large events in a common format, and associated site metadata. It is the foundational engineering strong-motion event compilation for NZ, distinct from the routine GeoNet earthquake catalogue.

**Key references:**
- Van Houtte, C., Bannister, S., Holden, C., Bourguignon, S., & McVerry, G. (2017). The New Zealand Strong Motion Database. Bulletin of the New Zealand Society for Earthquake Engineering, 50(1), 1-20. https://doi.org/10.5459/bnzsee.50.1.1-20
- Kaiser, A.E., Van Houtte, C., Perrin, N.D., Wotherspoon, L., & McVerry, G.H. (2017). Site characterisation of GeoNet stations for the New Zealand Strong Motion Database. Bulletin of the New Zealand Society for Earthquake Engineering, 50(1), 39-49. https://doi.org/10.5459/bnzsee.50.1.39-49
- GNS Science (2016). Database of site metadata for GeoNet strong motion stations. GNS Science. https://doi.org/10.21420/G26P4C

---

### 107. New Zealand Ground-Motion Database (NZGMDB)
*type: compilation · focus: parameter-testing · detection: manual · review: reviewed*

- **Also known as:** NZGMDB; 2023 NZGMDB; 2021 New Zealand Ground-Motion Database (GNS Science Report 2021/56); NZ Ground-Motion Database 2024 Update
- **Coverage:** 2000 → 2022-12
- **Region:** New Zealand (including crustal, subduction interface, outer-rise and inslab/intraslab events of the Hikurangi-Kermadec and Puysegur margins)
- **Magnitude:** Moment magnitude Mw ~3.0 to ~7.8 (2023 version; abstract states events with Mw greater than ~3.0 to end-2022). Predecessor 2021 version used a threshold of Mw >= 4.0.
- **Events:** ~2,725 events reported for the 2023 version in the source (breakdown given as ~1,598 crustal, 432 interface, 98 outer-rise, 597 inslab)
- **Content:** hypocentral locations, quality information, other (recomputed moment magnitudes, event tectonic classifications, ground-motion intensity measures: PGA / pseudo-acceleration response spectra / smoothed Fourier amplitude spectra / cumulative & duration metrics, source-receiver path and site information)
- **Producer / contact:** Jesse A. Hutchinson, Robin L. Lee, Brendon A. Bradley and colleagues (University of Canterbury / QuakeCoRE and GNS Science). Producing institutions: University of Canterbury and GNS Science.
- **Data source:** Recompiled from New Zealand earthquake events and strong-motion recordings: GeoNet earthquake catalogue / waveform archive (quakesearch.geonet.org.nz) plus recomputed hypocentres, moment magnitudes and tectonic classifications. Builds on the 2021 GNS Science Report predecessor that was the central ground-motion event database for the NSHM 2022 ground-motion characterization (GMC) model.
- **Availability:** available (DOI) · DOI [10.1785/0120230184 (2023 version paper, BSSA); dataset hosted on OSF at https://osf.io/q9yrg/. Predecessor: GNS Science Report 2021/56, DOI 10.21420/Z20E-5507](https://doi.org/10.1785/0120230184 (2023 version paper, BSSA); dataset hosted on OSF at https://osf.io/q9yrg/. Predecessor: GNS Science Report 2021/56, DOI 10.21420/Z20E-5507)

The NZGMDB is a unified, expandable New Zealand event-and-ground-motion catalogue purpose-built for ground-motion model development. It compiles all local events above a moment-magnitude threshold together with recomputed earthquake hypocentres, moment magnitudes, event tectonic classifications (crustal, interface, outer-rise, inslab), source-receiver path/site information, and processed ground-motion intensity measures (PGA, 5%-damped pseudo-acceleration response spectra, smoothed Fourier amplitude spectra, and cumulative/duration metrics). A preceding 2021/2022 version (GNS Science Report 2021/56) served as the central ground-motion database for the 2022 NZ National Seismic Hazard Model GMC modelling; it is maintained as a distinct, separately published dataset from the NSHM Mw-homogenised hazard catalogue.

**Key references:**
- Hutchinson, J. A., Zhu, C., Bradley, B. A., Lee, R. L., Wotherspoon, L. M., Dupuis, M., Schill, C., Motha, J., Manea, E. F., & Kaiser, A. E. (2024). The 2023 New Zealand Ground-Motion Database. Bulletin of the Seismological Society of America, 114(1), 291-310. https://doi.org/10.1785/0120230184
- Hutchinson, J., Bradley, B. A., Lee, R. L., Wotherspoon, L. M., Dupuis, M., Schill, C., Motha, J., Kaiser, A. E., & Manea, E. F. (2022). 2021 New Zealand Ground-Motion Database. GNS Science Report 2021/56. GNS Science, Lower Hutt, New Zealand. https://doi.org/10.21420/Z20E-5507
- Rampersad, A., Ridden, J., Lee, R. L., Bradley, B. A., Zhu, C., Pajaro, C., & Schill, C. (2025). The New Zealand Ground-Motion Database: A 2024 Update. New Zealand Society for Earthquake Engineering Annual Conference, Auckland, 8-10 April 2025.

---

## Appendix A — Consolidated references

163 unique references cited across the inventory:

- Abeling, S., Horspool, N., Johnston, D., Dizhur, D., Wilson, N., Clement, C., & Ingham, J. (2020). Patterns of earthquake-related mortality at a whole-country level: New Zealand, 1840-2017. Earthquake Spectra, 36(1), 138-163. https://doi.org/10.1177/8755293019878190
- Aber, S., Ebinger, C.J., Gase, A.C., Kalugana, C., Illsley-Kemp, F., Hamling, I., Sabir, S., Savage, M.K., Eccles, J., Hreinsdottir, S., Ristau, J., & James-Le, J. (2025). Cascading Earthquake Swarms in the Northern Taupō Volcanic Zone, New Zealand. Geochemistry, Geophysics, Geosystems, 26, e2024GC012079. https://doi.org/10.1029/2024GC012079
- Aden-Antoniow, F., Frank, W. B., Chamberlain, C. J., Townend, J., Wallace, L. M., & Bannister, S. (2024). Low-Frequency Earthquakes Downdip of Deep Slow Slip Beneath the North Island of New Zealand. Journal of Geophysical Research: Solid Earth, 129, e2023JB027971. https://doi.org/10.1029/2023JB027971
- Aziz Zanjani, F., Lin, G. & Thurber, C.H. (2021). Nested regional-global seismic tomography and precise earthquake relocation along the Hikurangi subduction zone, New Zealand. Geophysical Journal International, 227(3), 1567-1590. https://doi.org/10.1093/gji/ggab294
- Bannister, S. / GNS Science (2009). Deep Geothermal HADES seismic array (HADES) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/Z8_2009
- Bannister, S., Bertrand, E.A., Heimann, S., Bourguignon, S., Asher, C., Shanks, J., & Harvison, A. (2022). Imaging sub-caldera structure with local seismicity, Okataina Volcanic Centre, Taupo Volcanic Zone, using double-difference seismic tomography. Journal of Volcanology and Geothermal Research, 431, 107653. https://doi.org/10.1016/j.jvolgeores.2022.107653
- Bannister, S., Fry, B., Reyners, M., Ristau, J., & Zhang, H. (2011). Fine-scale relocation of aftershocks of the 22 February Mw 6.2 Christchurch earthquake using double-difference tomography. Seismological Research Letters, 82(6), 839-845. doi:10.1785/gssrl.82.6.839
- Bannister, S., Sherburn, S., & Bourguignon, S. (2016). Earthquake swarm activity highlights crustal faulting associated with the Waimangu-Rotomahana-Mt Tarawera geothermal field, Taupo Volcanic Zone. Journal of Volcanology and Geothermal Research, 314, 49-56. https://doi.org/10.1016/j.jvolgeores.2015.07.024
- Bannister, S., Thurber, C., & Louie, J. (2006). Detailed fault structure highlighted by finely relocated aftershocks, Arthur's Pass, New Zealand. Geophysical Research Letters, 33(18), L18315. https://doi.org/10.1029/2006GL027462
- Bannister, S.C. (1988). Microseismicity and Velocity Structure in the Hawke's Bay Region, New Zealand: Fine Structure of the Subducting Pacific Plate. Geophysical Journal International, 95(1), 45-62. https://doi.org/10.1111/j.1365-246X.1988.tb00449.x
- Baratin, L.-M., Chamberlain, C. J., Townend, J., & Savage, M. K. (2018). Focal mechanisms and inter-event times of low-frequency earthquakes reveal quasi-continuous deformation and triggered slow slip on the deep Alpine Fault. Earth and Planetary Science Letters, 484, 111-123. https://doi.org/10.1016/j.epsl.2017.12.021
- Beavan, J., Samsonov, S., Denys, P., Sutherland, R., Palmer, N., & Denham, M. (2010). Oblique slip on the Puysegur subduction interface in the 2009 July MW 7.8 Dusky Sound earthquake from GPS and InSAR observations: implications for the tectonics of southwestern New Zealand. Geophysical Journal International, 183(3), 1265-1286. https://doi.org/10.1111/j.1365-246X.2010.04798.x
- Benson, T.W., Illsley-Kemp, F., Elms, H.C., Hamling, I.J., Savage, M.K., Wilson, C.J.N., Mestel, E.R.H., & Barker, S.J. (2020). Earthquake catalogue for Tarawera region, New Zealand, March 2019 [Data set, QuakeML]. Zenodo. https://doi.org/10.5281/zenodo.4035171
- Benson, T.W., Illsley-Kemp, F., Elms, H.C., Hamling, I.J., Savage, M.K., Wilson, C.J.N., Mestel, E.R.H., & Barker, S.J. (2021). Earthquake Analysis Suggests Dyke Intrusion in 2019 Near Tarawera Volcano, New Zealand. Frontiers in Earth Science, 8, 606992. https://doi.org/10.3389/feart.2020.606992
- Bondár, I. and Storchak, D.A. (2011). Improved location procedures at the International Seismological Centre. Geophysical Journal International, 186, 1220-1244. https://doi.org/10.1111/j.1365-246X.2011.05107.x
- Bourguignon, S., Bannister, S., Henderson, C. M., Townend, J., & Zhang, H. (2015). Structural heterogeneity of the midcrust adjacent to the central Alpine Fault, New Zealand: Inferences from seismic tomography and seismicity between Harihari and Ross. Geochemistry, Geophysics, Geosystems, 16(4), 1017-1043. https://doi.org/10.1002/2014GC005702
- Bramwell, L., Illsley-Kemp, F., Hughes, E. (2024). Drumbeat and low frequency catalogue for 2022 unrest at Ruapehu volcano, New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.13910455
- Bramwell, L.A., Illsley-Kemp, F., Hughes, E.C., Butcher, S., Lamb, O.D., Behr, Y. (2025). Source dynamics of Ruapehu's 2022 volcanic unrest: insights from drumbeat seismicity, tremor, and crater lake signals. Bulletin of Volcanology, 87(6), 44. https://doi.org/10.1007/s00445-025-01823-2
- Chamberlain, C. J., Boese, C. M., Eccles, J. D., Savage, M. K., Baratin, L.-M., Townend, J., Gulley, A. K., Jacobs, K. M., Benson, A., Taylor-Offord, S., Thurber, C., Guo, B., Okada, T., Takagi, R., Yoshida, K., Sutherland, R., & Toy, V. G. (2017). Real-Time Earthquake Monitoring during the Second Phase of the Deep Fault Drilling Project, Alpine Fault, New Zealand. Seismological Research Letters, 88(6), 1443-1454. https://doi.org/10.1785/0220170095
- Chamberlain, C. J., Frank, W. B., Lanza, F., Townend, J., & Warren-Smith, E. (2021). Illuminating the Pre-, Co-, and Post-Seismic Phases of the 2016 M7.8 Kaikoura Earthquake With 10 Years of Seismicity. Journal of Geophysical Research: Solid Earth, 126(8), e2021JB022304. doi:10.1029/2021JB022304
- Chamberlain, C. J., Shelly, D. R., Townend, J., & Stern, T. A. (2014). Low-frequency earthquakes reveal punctuated slow slip on the deep extent of the Alpine Fault, New Zealand. Geochemistry, Geophysics, Geosystems, 15, 2984-2999. https://doi.org/10.1002/2014GC005436
- Christophersen, A., Bourguignon, S., Rhoades, D.A., Allen, T.I., Ristau, J., Salichon, J., Rollins, C., Townend, J., & Gerstenberger, M.C. (2024). Standardizing Earthquake Magnitudes for the 2022 Revision of the Aotearoa New Zealand National Seismic Hazard Model. Bulletin of the Seismological Society of America, 114(1), 111-136. https://doi.org/10.1785/0120230169
- Christophersen, A., Bourguignon, S., Rhoades, D.A., Allen, T.I., Salichon, J., Ristau, J., Rollins, C., & Gerstenberger, M.C. (2022). Consistent magnitudes over time for the revision of the New Zealand National Seismic Hazard Model. GNS Science Report 2021/42. GNS Science. https://doi.org/10.21420/A2SN-XM76
- Clarke, D., Townend, J., Savage, M.K., Bannister, S. (2009). Seismicity in the Rotorua and Kawerau geothermal systems, Taupo Volcanic Zone, New Zealand, based on improved velocity models and cross-correlation measurements. Journal of Volcanology and Geothermal Research, 180(1), 50-66. https://doi.org/10.1016/j.jvolgeores.2008.11.004
- Darfield RAMP Aftershock Deployment (D-RAD), New Zealand (2010). FDSN network 4A_2010, University of Wisconsin-Madison. doi:10.7914/SN/4A_2010
- Di Giacomo, D., Engdahl, E.R. & Storchak, D.A. (2018). The ISC-GEM Earthquake Catalogue (1904-2014): status after the Extension Project. Earth System Science Data, 10(4), 1877-1899. https://doi.org/10.5194/essd-10-1877-2018
- Downes, G. & Yetton, M. (2012). Pre-2010 historical seismicity near Christchurch, New Zealand: the 1869 Mw 4.7-4.9 Christchurch and 1870 Mw 5.6-5.8 Lake Ellesmere earthquakes. New Zealand Journal of Geology and Geophysics, 55(3), 199-205. https://doi.org/10.1080/00288306.2012.690767
- Downes, G.L. & Dowrick, D.J. (2014). Atlas of isoseismal maps of New Zealand earthquakes 1843-2003, 2nd edition (revised). GNS Science Monograph 25. Lower Hutt, NZ: GNS Science. ISBN 978-0-478-19663-4.
- Downes, G.L. (1995). Atlas of isoseismal maps of New Zealand earthquakes. Institute of Geological & Nuclear Sciences Monograph 11 (EQC Paper 7 / EQC 91/40). Lower Hutt, NZ. https://www.naturalhazards.govt.nz/assets/Publications-Resources/7-Atlas-of-isoseismal-maps-of-New-Zealand-earthquakes-compressed-v2.pdf
- Dowrick, D.J. & Cousins, W.J. (2003). Historical incidence of Modified Mercalli intensity in New Zealand and comparisons with hazard models. Bulletin of the New Zealand Society for Earthquake Engineering, 36(1), 1-24. https://doi.org/10.5459/bnzsee.36.1.1-24
- Dowrick, D.J. & Rhoades, D.A. (1998). Magnitudes of New Zealand earthquakes, 1901-1993. Bulletin of the New Zealand Society for Earthquake Engineering, 31(4), 260-280. https://doi.org/10.5459/bnzsee.31.4.260-280
- Du, W.-x., Thurber, C.H., Reyners, M., Eberhart-Phillips, D. & Zhang, H. (2004). New constraints on seismicity in the Wellington region of New Zealand from relocated earthquake hypocentres. Geophysical Journal International, 158(3), 1088-1102. https://doi.org/10.1111/j.1365-246X.2004.02366.x
- Dziak, R. P., Haxel, J. H., Matsumoto, H., Lau, T.-K., Merle, S. G., de Ronde, C. E. J., Embley, R. W., & Mellinger, D. K. (2008). Observations of regional seismicity and local harmonic tremor at Brothers volcano, south Kermadec arc, using an ocean bottom hydrophone array. Journal of Geophysical Research: Solid Earth, 113, B08S14. https://doi.org/10.1029/2007JB005533
- Dziewonski, A.M., Chou, T.-A. and Woodhouse, J.H. (1981). Determination of earthquake source parameters from waveform data for studies of global and regional seismicity. Journal of Geophysical Research, 86, 2825-2852. https://doi.org/10.1029/JB086iB04p02825
- Earth Sciences New Zealand / GNS Science. National Earthquake Information Database (NEID). https://www.gns.cri.nz/data-and-resources/national-earthquake-information-database/
- Eberhart-Phillips, D. & Reyners, M. (2022/2023). Catalogue of 2001-2011 New Zealand earthquakes relocated with 3-D seismic velocity model and comparison to 2019-2020 auto-detected earthquakes in the sparsely instrumented southern South Island. New Zealand Journal of Geology and Geophysics, 66(4), 646-653. https://doi.org/10.1080/00288306.2022.2089171
- Eberhart-Phillips, D., & Bannister, S. (2010). 3-D imaging of Marlborough, New Zealand, subducted plate and strike-slip fault systems. Geophysical Journal International, 182(1), 73-96. https://doi.org/10.1111/j.1365-246X.2010.04621.x
- Eberhart-Phillips, D., & Reyners, M. (2023). Catalogue of 2001-2011 New Zealand earthquakes relocated with 3-D seismic velocity model and comparison to 2019-2020 auto-detected earthquakes in the sparsely instrumented southern South Island. New Zealand Journal of Geology and Geophysics, 66(4), 646-653. https://doi.org/10.1080/00288306.2022.2089171
- Eberhart-Phillips, D., Bannister, S., Reyners, M. & Bourguignon, S. (2022). New Zealand Wide model 2.3 seismic velocity model for New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.6568301
- Eberhart-Phillips, D., Bannister, S., Reyners, M. & Henrys, S. (2020). New Zealand Wide model 2.2 seismic velocity and Qs and Qp models for New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.3779523
- Eiby, G.A. (1968). A descriptive catalogue of New Zealand earthquakes. Part I — Shocks felt before the end of 1845. New Zealand Journal of Geology and Geophysics, 11(1), 16-40. https://doi.org/10.1080/00288306.1968.10423671
- Eiby, G.A. (1968). An annotated list of New Zealand earthquakes, 1460-1965. New Zealand Journal of Geology and Geophysics, 11(3), 630-647. https://doi.org/10.1080/00288306.1968.10420275
- Eiby, G.A. (1973). A descriptive catalogue of New Zealand earthquakes. Part 2 — Shocks felt from 1846 to 1854. New Zealand Journal of Geology and Geophysics, 16(4), 857-907. https://doi.org/10.1080/00288306.1973.10555229
- Ekström, G., Nettles, M. and Dziewoński, A.M. (2012). The global CMT project 2004-2010: Centroid-moment tensors for 13,017 earthquakes. Physics of the Earth and Planetary Interiors, 200-201, 1-9. https://doi.org/10.1016/j.pepi.2012.04.002
- Engdahl, E.R., Di Giacomo, D., Sakarya, B., Gkarlaouni, C.G., Harris, J. & Storchak, D.A. (2020). ISC-EHB 1964-2016, an Improved Data Set for Studies of Earth Structure and Global Seismicity. Earth and Space Science, 7(1), e2019EA000897. https://doi.org/10.1029/2019EA000897
- Fasola, S. L., Jackson, N. M., & Williams, C. A. (2023). Deep Short-Term Slow Slip and Tremor in the Manawatu Region, New Zealand. Geophysical Research Letters, 50(21), e2023GL105428. https://doi.org/10.1029/2023GL105428
- Fry, B., Bannister, S., Beavan, J., et al. (2010). The Mw 7.6 Dusky Sound earthquake of 2009: preliminary report. Bulletin of the New Zealand Society for Earthquake Engineering, 43(1).
- GNS Science (1970). New Zealand Earthquake Catalogue [Data set]. GNS Science, GeoNet. https://doi.org/10.21420/0S8P-TZ38
- GNS Science (2006). GeoNet Aotearoa New Zealand Earthquake Moment Tensor solutions [Data set]. GNS Science, GeoNet. https://doi.org/10.21420/MMJ9-CZ67
- GNS Science (2008). ALFA08 (ALFA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YR_2008
- GNS Science (2014). Otago temporary broadband network [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/6K_2014
- GNS Science (2016). Database of site metadata for GeoNet strong motion stations. GNS Science. https://doi.org/10.21420/G26P4C
- GNS Science (2019). Dense Westland Arrays Researching Fault Segmentation: What controls earthquake segmentation along New Zealand's Alpine Fault? (DWARFS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/8N_2019
- GNS Science (2021). Aotearoa/New Zealand GeoNet Seismic Digital Waveform Dataset [Data set]. GNS Science. https://doi.org/10.21420/G19Y-9D40
- GNS Science. (2015). GeoNet Aotearoa New Zealand Felt Rapid Dataset [Data set]. GNS Science. https://doi.org/10.21420/RS7F-VE53
- GNS Science. Shaking Layers Dataset [Data set]. GNS Science. https://doi.org/10.21420/J856-2J84
- Gerstenberger, M. C., & Rhoades, D. A. (2010). New Zealand Earthquake Forecast Testing Centre. Pure and Applied Geophysics, 167(8-9), 877-892. https://doi.org/10.1007/s00024-010-0082-4
- Gerstenberger, M.C., Van Dissen, R.J., Rollins, C., DiCaprio, C., Thingbaijam, K.K.S., Bora, S., Chamberlain, C., Christophersen, A., Coffey, G.L., Ellis, S., Iturrieta, P., et al. (2024). The Seismicity Rate Model for the 2022 Aotearoa New Zealand National Seismic Hazard Model. Bulletin of the Seismological Society of America, 114(1), 182-216. https://doi.org/10.1785/0120230165
- Goded, T., Horspool, N., Canessa, S., & Gerstenberger, M. (2017). Modified Mercalli intensities for the M7.8 Kaikoura (New Zealand) 14 November 2016 earthquake derived from 'felt detailed' and 'felt rapid' online questionnaires. Bulletin of the New Zealand Society for Earthquake Engineering, 50(2), 352-362. https://doi.org/10.5459/bnzsee.50.2.352-362
- Goded, T., Horspool, N., Canessa, S., Lewis, A., Geraghty, K., Jeffrey, A., & Gerstenberger, M. (2018). New macroseismic intensity assessment method for New Zealand web questionnaires. Seismological Research Letters, 89(2A), 640-652. https://doi.org/10.1785/0220170163
- Henrys, S., Wech, A., Sutherland, R., Stern, T., Savage, M., Sato, H., Mochizuki, K., Iwasaki, T., Okaya, D., Seward, A., Tozer, B., Townend, J., Kurashimo, E., Iidaka, T., & Ishiyama, T. (2013). SAHKE geophysical transect reveals crustal and subduction zone structure at the southern Hikurangi margin, New Zealand. Geochemistry, Geophysics, Geosystems, 14(6), 2063-2083. https://doi.org/10.1002/ggge.20136
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2019). Seismic Response to Injection Well Stimulation in a High-Temperature, High-Permeability Reservoir. Geochemistry, Geophysics, Geosystems, 20, 2848-2871. https://doi.org/10.1029/2019GC008243
- Hopp, C., Sewell, S., Mroczek, S., Savage, M., & Townend, J. (2020). Seismic response to evolving injection at the Rotokawa geothermal field, New Zealand. Geothermics, 85, 101750. https://doi.org/10.1016/j.geothermics.2019.101750
- Hughes, L., Chamberlain, C. J., Townend, J., & Thomas, A. M. (2021). A Repeating Earthquake Catalog From 2003 to 2020 for the Raukumara Peninsula, Northern Hikurangi Subduction Margin, New Zealand. Geochemistry, Geophysics, Geosystems, 22(5), e2021GC009670. https://doi.org/10.1029/2021GC009670
- Hutchinson, J. A., Zhu, C., Bradley, B. A., Lee, R. L., Wotherspoon, L. M., Dupuis, M., Schill, C., Motha, J., Manea, E. F., & Kaiser, A. E. (2024). The 2023 New Zealand Ground-Motion Database. Bulletin of the Seismological Society of America, 114(1), 291-310. https://doi.org/10.1785/0120230184
- Hutchinson, J., Bradley, B. A., Lee, R. L., Wotherspoon, L. M., Dupuis, M., Schill, C., Motha, J., Kaiser, A. E., & Manea, E. F. (2022). 2021 New Zealand Ground-Motion Database. GNS Science Report 2021/56. GNS Science, Lower Hutt, New Zealand. https://doi.org/10.21420/Z20E-5507
- IRIS/PASSCAL (1995). Cooperative Project on South Island New Zealand (NZ Passive) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XC_1995
- IRIS/PASSCAL (2000). Array studies of anisotropy and converted phases in the Marlborough Fault Zone of New Zealand [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XB_2000
- IRIS/PASSCAL (2001). Hikurangi Subduction System (New Zealand) Seismic Transects, North Island Geophysical Transect Passive (NIGHT Passive) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XQ_2001
- Illsley-Kemp, F. & Mestel, E.R.H. (2025). A new consistent and high-precision earthquake catalogue for the Taupō Volcanic Zone, New Zealand. Seismica, 4(1). https://doi.org/10.26443/seismica.v4i1.1490
- Illsley-Kemp, F., & Mestel, E. (2025). A new consistent and high-precision earthquake catalogue for the Taupō Volcanic Zone, New Zealand. Seismica, 4(1). https://doi.org/10.26443/seismica.v4i1.1490
- Illsley-Kemp, F., Barker, S.J., Wilson, C.J.N., Chamberlain, C.J., Hreinsdóttir, S., Ellis, S., Hamling, I.J., Savage, M.K., Mestel, E.R.H., & Wadsworth, F.B. (2021). Volcanic Unrest at Taupō Volcano in 2019: Causes, Mechanisms and Implications. Geochemistry, Geophysics, Geosystems, 22, e2021GC009803. https://doi.org/10.1029/2021GC009803
- Imperial College London / IFDSN (2017). NZ3D FWI [Seismic network], FDSN code 3C (2017-2018). https://doi.org/10.7914/SN/3C_2017
- International Seismological Centre (2021). ISC-GEM Earthquake Catalogue. https://doi.org/10.31905/D808B825
- International Seismological Centre (2022). ISC-EHB dataset. https://doi.org/10.31905/PY08W6S3
- International Seismological Centre (2026). On-line Bulletin. International Seismological Centre, Thatcham, United Kingdom. https://doi.org/10.31905/D808B830
- Iwasaki, Y., Schwartz, S., Mochizuki, K., Crume, H., Bassett, D., Yamada, T., & Morad, D. (2025). Dataset of earthquakes in the northern Hikurangi subduction zone, New Zealand, during the 2019 slow slip event [Data set]. Zenodo. https://doi.org/10.5281/zenodo.15713529
- Iwasaki, Y., Schwartz, S., Mochizuki, K., Crume, H., Bassett, D., Yamada, T., & Morad, D. (2025). Intraslab Seismicity Near Subducted Seamounts Induced by the 2019 Large Slow Slip Event Offshore the Northern Hikurangi Subduction Zone, New Zealand. Journal of Geophysical Research: Solid Earth, 130(12). https://doi.org/10.1029/2025JB031751
- Kaiser, A.E., Van Houtte, C., Perrin, N.D., Wotherspoon, L., & McVerry, G.H. (2017). Site characterisation of GeoNet stations for the New Zealand Strong Motion Database. Bulletin of the New Zealand Society for Earthquake Engineering, 50(1), 39-49. https://doi.org/10.5459/bnzsee.50.1.39-49
- Lamb, O., Bannister, S., Ristau, J., Miller, C., Sherburn, S., Jacobs, K., Hanson, J., D'Anastasio, E., Hreinsdóttir, S., Snee, E., Ross, M., Mestel, E., & Illsley-Kemp, F. (2024). Seismic characteristics of the 2022-2023 unrest episode at Taupō volcano, Aotearoa New Zealand. Seismica, 3(2). https://doi.org/10.26443/seismica.v3i2.1125
- Lanza, F., Chamberlain, C. J., Jacobs, K., Warren-Smith, E., Godfrey, H. J., Kortink, M., Thurber, C. H., Savage, M. K., Townend, J., Roecker, S., & Eberhart-Phillips, D. (2019). Crustal fault connectivity of the Mw 7.8 2016 Kaikoura earthquake constrained by aftershock relocations. Geophysical Research Letters, 46(12), 6487-6496. doi:10.1029/2019GL082780
- Leitner, B., Eberhart-Phillips, D., Anderson, H., & Nabelek, J. L. (2001). A focused look at the Alpine fault, New Zealand: Seismicity, focal mechanisms, and stress observations. Journal of Geophysical Research, 106(B2), 2193-2220. https://doi.org/10.1029/2000JB900303
- Lythgoe, K. (2023). Kermadec 2021 refined earthquake catalogue and slip models [Dataset]. University of Edinburgh DataShare. https://doi.org/10.7488/ds/7534
- Lythgoe, K., Bradley, K., Zeng, H., & Wei, S. (2023). Persistent asperities at the Kermadec subduction zone controlled by changes in forearc structure: 1976 and 2021 doublet earthquakes. Earth and Planetary Science Letters, 624, 118465. https://doi.org/10.1016/j.epsl.2023.118465
- McGinty, P., & Robinson, R. (2007). The 2003 Mw 7.2 Fiordland subduction earthquake, New Zealand: Aftershock distribution, main shock fault plane and static stress changes on the overlying Alpine Fault. Geophysical Journal International, 169(2), 579-592. doi:10.1111/j.1365-246X.2007.03336.x
- Mestel, E.R.H., Illsley-Kemp, F., Savage, M.K., Wilson, C.J.N., Smith, B., & Hreinsdóttir, S. (2025). Seismicity From Modern Magmatic Activity Beneath Taupō Volcano, Aotearoa New Zealand. Journal of Geophysical Research: Solid Earth, 130(9), e2025JB031644. https://doi.org/10.1029/2025JB031644
- Metz, D., Watts, A. B., & Grevemeyer, I. (2018). Tracking Submarine Volcanic Activity at Monowai: Constraints From Long-Range Hydroacoustic Measurements. Journal of Geophysical Research: Solid Earth, 123, 7877-7895. https://doi.org/10.1029/2018JB015888
- Metz, D., Watts, A. B., Grevemeyer, I., Rodgers, M., & Paulatto, M. (2016). Ultra-long-range hydroacoustic observations of submarine volcanic activity at Monowai, Kermadec Arc. Geophysical Research Letters. https://doi.org/10.1002/2015GL067259
- Michailos, K. (2019). Southern Alps, New Zealand microseismicity earthquake catalog [Data set, QuakeML]. Zenodo. https://doi.org/10.5281/zenodo.3529755
- Michailos, K. (2025). Southern Alps/Kā Tiritiri o te Moana Matched-Filter based microseismicity earthquake catalog [Data set, QuakeML+CSV]. Zenodo. https://doi.org/10.5281/zenodo.15002912
- Michailos, K., Chamberlain, C.J., Simpson, G., Cox, S.C., Townend, J., Vargo, L.J., Oestreicher, N. & Miller, M.S. (2025). Temporal Evolution of Seismicity in the Central Southern Alps, New Zealand: Evidence for Rainfall-Triggered Seismicity. Geochemistry, Geophysics, Geosystems, 26(8), e2025GC012317. https://doi.org/10.1029/2025GC012317
- Michailos, K., Smith, E. G. C., Chamberlain, C. J., Savage, M. K., & Townend, J. (2019). Variations in seismogenic thickness along the central Alpine Fault, New Zealand, revealed by a decade's relocated microseismicity. Geochemistry, Geophysics, Geosystems, 20. https://doi.org/10.1029/2018GC007743
- Michailos, K., Smith, E.G.C., Chamberlain, C.J., Savage, M.K. & Townend, J. (2019). Variations in Seismogenic Thickness Along the Central Alpine Fault, New Zealand, Revealed by a Decade's Relocated Microseismicity. Geochemistry, Geophysics, Geosystems, 20(1), 470-486. https://doi.org/10.1029/2018GC007743
- Michel, S., et al. (2025). 14 Years of Slip on the Hikurangi Subduction Zone. Journal of Geophysical Research: Solid Earth, 130, e2024JB030865. https://doi.org/10.1029/2024JB030865
- Mitchinson, S., Johnson, J.H., Milner, B., & Lines, J. (2024). Identifying earthquake swarms at Mt. Ruapehu, New Zealand: a machine learning approach. Frontiers in Earth Science, 12, 1343874. https://doi.org/10.3389/feart.2024.1343874
- Mroczek, S., Savage, M.K., Hopp, C., & Sewell, S.M. (2020). Anisotropy as an indicator for reservoir changes: example from the Rotokawa and Ngatamariki geothermal fields, New Zealand. Geophysical Journal International, 220(1), 1-17. https://doi.org/10.1093/gji/ggz400
- Nishikawa, T., Nishimura, T., & Okada, Y. (2021). Earthquake Swarm Detection Along the Hikurangi Trench, New Zealand: Insights Into the Relationship Between Seismicity and Slow Slip Events. Journal of Geophysical Research: Solid Earth, 126(4), e2020JB020618. https://doi.org/10.1029/2020JB020618
- Park, I., Jolly, A., Lokmer, I., & Kennedy, B. (2020). Classification of long-term very long period (VLP) volcanic earthquakes at Whakaari/White Island volcano, New Zealand. Earth, Planets and Space, 72, 92. https://doi.org/10.1186/s40623-020-01224-z
- Perez-Silva, A., Wang, T., Wallace, L., Bebbington, M., & Denys, P. (2025). Assessing Occurrence Patterns of Shallow Hikurangi Slow Slip Events Using Renewal Processes. Geophysical Research Letters, 52, e2025GL116605. https://doi.org/10.1029/2025GL116605
- Perez-Silva, A., Wang, T., Wallace, L., Bebbington, M., & Denys, P. (2025). Assessing occurrence patterns of shallow Hikurangi slow slip events using renewal processes [Data set]. Zenodo. https://doi.org/10.5281/zenodo.14848128
- Rampersad, A., Ridden, J., Lee, R. L., Bradley, B. A., Zhu, C., Pajaro, C., & Schill, C. (2025). The New Zealand Ground-Motion Database: A 2024 Update. New Zealand Society for Earthquake Engineering Annual Conference, Auckland, 8-10 April 2025.
- Reyners, M., Eberhart-Phillips, D., Stuart, G., & Nishimura, Y. (2006). Imaging subduction from the trench to 300 km depth beneath the central North Island, New Zealand, with Vp and Vp/Vs. Geophysical Journal International, 165(2), 565-583. https://doi.org/10.1111/j.1365-246X.2006.02897.x
- Rhoades, D. A., & Christophersen, A. (2019). Time-varying probabilities of earthquake occurrence in central New Zealand based on the EEPAS model compensated for time-lag. Geophysical Journal International, 219(1), 417-429. https://doi.org/10.1093/gji/ggz301
- Rhoades, D. A., Rastin, S. J., & Christophersen, A. (2022). A 20-Year Journey of Forecasting with the 'Every Earthquake a Precursor According to Scale' Model. Geosciences, 12(9), 349. https://doi.org/10.3390/geosciences12090349
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
- Sepulveda, F., Andrews, J., Alvarez, M., Montague, T., Mannington, W. (2013). Overview of Deep Structure Using Microseismicity at Wairakei. Proceedings New Zealand Geothermal Workshop 2013. (no DOI located)
- Sepulveda, F., Andrews, J., Kim, J., Siega, C., Milloy, S.F. (2015). Spatial-temporal Characteristics of Microseismicity (2009-2014) of the Wairakei Geothermal Field, New Zealand. Proceedings World Geothermal Congress 2015, Melbourne, Australia, 19-25 April 2015. (no DOI located)
- Shaw, B.E. (2021). RSQSim Simulated Earthquake Catalog 5091, New Zealand, NSHM2012 Fault System, 276kyr [Data set]. Zenodo. https://doi.org/10.5281/zenodo.5534462
- Shaw, B.E., & Milner, K.R. (2025). RSQSim Earthquake Simulator Catalogs and Ground Motions: California rundir5652, New Zealand rundir5566 [Data set]. Zenodo. https://doi.org/10.5281/zenodo.14532399
- Shaw, B.E., Fry, B., Nicol, A., Howell, A., & Gerstenberger, M. (2022). An Earthquake Simulator for New Zealand. Bulletin of the Seismological Society of America, 112(2), 763-778. https://doi.org/10.1785/0120210087
- Shaw, B.E., Milner, K.R., & Goulet, C.A. (2025). Deterministic Physics-Based Earthquake Sequence Simulators Match Empirical Ground-Motion Models and Enable Extrapolation to Data-Poor Regimes. Seismological Research Letters. https://doi.org/10.1785/0220240141
- Sherburn, S., & White, R. S. (2005). Crustal seismicity in Taranaki, New Zealand using accurate hypocentres from a dense network. Geophysical Journal International, 162(2), 494-506. https://doi.org/10.1111/j.1365-246X.2005.02667.x
- Sherburn, S., Sewell, S.M., Bourguignon, S., Cumming, W., Bannister, S., Bardsley, C., Winick, J., Quinao, J., Wallis, I.C. (2015). Microseismicity at Rotokawa geothermal field, New Zealand, 2008-2012. Geothermics, 54, 23-34. https://doi.org/10.1016/j.geothermics.2014.11.001
- Smith, E. G. C., & Oppenheimer, C. M. M. (1989). The Edgecumbe earthquake sequence: 1987 February 21 to March 18. New Zealand Journal of Geology and Geophysics, 32(1), 31-42. doi:10.1080/00288306.1989.10421386
- Smith, W. D. (1976). A computer file of New Zealand earthquakes. Bulletin of the New Zealand Society for Earthquake Engineering, 9(2), 136-.. https://bulletin.nzsee.org.nz/index.php/bnzsee/article/view/1184
- Stirling, M., McVerry, G., Gerstenberger, M., Litchfield, N., Van Dissen, R., Berryman, K., Barnes, P., Wallace, L., Villamor, P., Langridge, R., Lamarche, G., Nodder, S., Reyners, M., Bradley, B., Rhoades, D., Smith, W., Nicol, A., Pettinga, J., Clark, K., & Jacobs, K. (2012). National Seismic Hazard Model for New Zealand: 2010 Update. Bulletin of the Seismological Society of America, 102(4), 1514-1542. https://doi.org/10.1785/0120110170
- Storchak, D.A. et al. (2017). Rebuild of the Bulletin of the International Seismological Centre (ISC), part 1: 1964-1979. Geoscience Letters, 4: 32. https://doi.org/10.1186/s40562-017-0098-z
- Storchak, D.A. et al. (2020). Rebuild of the Bulletin of the International Seismological Centre (ISC), part 2: 1980-2010. Geoscience Letters, 7: 18. https://doi.org/10.1186/s40562-020-00164-6
- Storchak, D.A., Di Giacomo, D., Engdahl, E.R., Harris, J., Bondar, I., Lee, W.H.K., Bormann, P. & Villasenor, A. (2015). The ISC-GEM Global Instrumental Earthquake Catalogue (1900-2009): Introduction. Physics of the Earth and Planetary Interiors, 239, 48-63. https://doi.org/10.1016/j.pepi.2014.06.009
- Syracuse, E. M., Thurber, C. H., Rawles, C. J., Savage, M. K., & Bannister, S. (2013). High-resolution relocation of aftershocks of the Mw 7.1 Darfield, New Zealand, earthquake and implications for fault activity. Journal of Geophysical Research: Solid Earth, 118(8), 4184-4195. doi:10.1002/jgrb.50301
- Todd, E. K., & Schwartz, S. Y. (2016). Tectonic tremor along the northern Hikurangi Margin, New Zealand, between 2010 and 2015. Journal of Geophysical Research: Solid Earth, 121, 8706-8719. https://doi.org/10.1002/2016JB013480
- Todd, E.K., Stirling, M.W., Fry, B., Salichon, J., & Villamor, P. (2020). Characterising microseismicity in a low seismicity region: applications of short-term broadband seismic arrays in Dunedin, New Zealand. New Zealand Journal of Geology and Geophysics, 63(3), 331-341. https://doi.org/10.1080/00288306.2019.1707238
- Townend, J., Sherburn, S., Arnold, R., Boese, C., & Woods, L. (2012). Three-dimensional variations in present-day tectonic stress along the Australia-Pacific plate boundary in New Zealand. Earth and Planetary Science Letters, 353-354, 47-59. https://doi.org/10.1016/j.epsl.2012.08.003
- U.S. Geological Survey, Earthquake Hazards Program (2017). Advanced National Seismic System (ANSS) Comprehensive Catalog of Earthquake Events and Products. U.S. Geological Survey. https://doi.org/10.5066/F7MS3QZH
- U.S. Geological Survey, Earthquake Hazards Program (2017). Preliminary Determination of Epicenters (PDE) Bulletin. U.S. Geological Survey. https://doi.org/10.5066/F74T6GJC
- University of Otago (2022). Southland Otago Seismic Array (SOSA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/jr68-qq17
- University of Texas at Austin (2014). Hikurangi Ocean Bottom Investigation of Tremor and Slow Slip (HOBITSS) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/YH_2014
- University of Wisconsin-Madison (2012). WIsconsin, new Zealand, And Rensselaer Deployment (WIZARD) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/ZT_2012
- University of Wisconsin-Madison (2012). WIsconsin, new Zealand, And Rpi Deployment, Deep Fault Drilling Project (DFDP13) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/6F_2012
- Van Houtte, C., Bannister, S., Holden, C., Bourguignon, S., & McVerry, G. (2017). The New Zealand Strong Motion Database. Bulletin of the New Zealand Society for Earthquake Engineering, 50(1), 1-20. https://doi.org/10.5459/bnzsee.50.1.1-20
- Victoria University of Wellington (2008). Southern Alps Microearthquake Borehole Array (SAMBA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/9F_2008
- Victoria University of Wellington (2009). Seismic Analysis of the HiKurangi Experiment, Wellington Geophysical Transect (SAHKE) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/X2_2009
- Victoria University of Wellington (2010). Deep Fault Drilling Project, Alpine Fault, New Zealand: Whataroa-Wanganui Passive Seismology Experiment 2010 (DFDP10/VicU) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/XO_2010
- Victoria University of Wellington (2021). Southern Alps Long Skinny Array; Along-fault array for virtual earthquake analysis of the Alpine Fault (SALSA) [Data set]. International Federation of Digital Seismograph Networks. https://doi.org/10.7914/SN/ZX_2021
- Victoria University of Wellington. Central Otago Seismic Array (COSA), FDSN network code 6S (2012-2030). https://www.fdsn.org/networks/detail/6S_2012/
- Wallace, L. M., & Beavan, J. (2010). Diverse slow slip behavior at the Hikurangi subduction margin, New Zealand. Journal of Geophysical Research: Solid Earth, 115, B12402. https://doi.org/10.1029/2010JB007717
- Warren-Smith, E., Chamberlain, C. J., Lamb, S., & Townend, J. (2017). High-Precision Analysis of an Aftershock Sequence Using Matched-Filter Detection: The 4 May 2015 ML 6 Wanaka Earthquake, Southern Alps, New Zealand. Seismological Research Letters, 88(4), 1065-1077. doi:10.1785/0220170016
- Warren-Smith, E., Fry, B., Kaneko, Y., & Chamberlain, C. J. (2018). Foreshocks and delayed triggering of the 2016 MW7.1 Te Araroa earthquake and dynamic reinvigoration of its aftershock sequence by the MW7.8 Kaikoura earthquake, New Zealand. Earth and Planetary Science Letters, 482, 265-276. https://doi.org/10.1016/j.epsl.2017.11.020
- Warren-Smith, E., Fry, B., Wallace, L., Chon, E., Henrys, S., Sheehan, A., Mochizuki, K., Schwartz, S., Webb, S., & Lebedev, S. (2019). Episodic stress and fluid pressure cycling in subducting oceanic crust during slow slip. Nature Geoscience, 12, 475-481. https://doi.org/10.1038/s41561-019-0367-x
- Warren-Smith, E., Jacobs, K., Rollins, C., Chamberlain, C. J., Eberhart-Phillips, D., & Williams, C. (2024). A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand. New Zealand Journal of Geology and Geophysics, 68. https://doi.org/10.1080/00288306.2024.2421309
- Warren-Smith, E., Lamb, S., & Stern, T.A. (2017). Stress field and kinematics for diffuse microseismicity in a zone of continental transpression, South Island, New Zealand. Journal of Geophysical Research: Solid Earth, 122(4), 2798-2811. https://doi.org/10.1002/2017JB013942
- Warren-Smith, E., Lamb, S., Stern, T.A., & Smith, E. (2017). Microseismicity in Southern South Island, New Zealand: Implications for the Mechanism of Crustal Deformation Adjacent to a Major Continental Transform. Journal of Geophysical Research: Solid Earth, 122(11), 9208-9227. https://doi.org/10.1002/2017JB014732
- Weston, J., Engdahl, E.R., Harris, J., Di Giacomo, D. & Storchak, D.A. (2018). ISC-EHB: Reconstruction of a robust earthquake data set. Geophysical Journal International, 214(1), 474-484. https://doi.org/10.1093/gji/ggy155
- Williams, J. N., Eberhart-Phillips, D., Bourguignon, S., Stirling, M. W., & Oliver, W. (2025). Deep and Clustered Microseismicity at the Edge of Southern New Zealand's Transpressive Plate Boundary. Journal of Geophysical Research: Solid Earth, 130(5), e2024JB030371. https://doi.org/10.1029/2024JB030371
- Williams, J., Eberhart-Phillips, D., Bourguignon, S., Stirling, M., Reyners, M., & Upton, P. (2025). Supplementary files to 'Focal mechanisms in the southeastern South Island of Aotearoa New Zealand indicate scale-dependent partitioning of transpressional strain' [Data set]. Zenodo. https://doi.org/10.5281/zenodo.17228270
- Williams, J., Eberhart-Phillips, D., Bourguignon, S., Stirling, M., Reyners, M., & Upton, P. (2026). Focal mechanisms in the southeastern South Island of Aotearoa New Zealand indicate scale-dependent partitioning of transpressional strain. Seismica, 5(1). https://doi.org/10.26443/seismica.v5i1.1839
- Woodward, A., Bastow, I., & Bell, R. (2025). Local Earthquake and Focal Mechanism Catalogue for the Northern Hikurangi Margin December 2017-October 2018 (v2) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.17063327
- Woodward, A., Bastow, I.D., Bell, R., Wallace, L., Jacobs, K., Henrys, S., Fry, B., Merry, T.A.J., Lane, V., Ville, L., Houldsworth-Bianek, P., & Broadley, L. (2026). Seismological Characterization of Northern Hikurangi Margin Slow Slip Regions Associated With Normal Faults, Seamounts, and Seeps. Journal of Geophysical Research: Solid Earth, 131(1), e2025JB032916. https://doi.org/10.1029/2025JB032916
- Yarce, J. (2018). HOBITSS earthquake catalog 2014-2015, Hikurangi margin, New Zealand [Data set]. Zenodo. https://doi.org/10.5281/zenodo.2022405
- Yarce, J., Sheehan, A. F., & Roecker, S. (2023). Temporal Relationship of Slow Slip Events and Microearthquake Seismicity: Insights From Earthquake Automatic Detections in the Northern Hikurangi Margin, Aotearoa New Zealand. Geochemistry, Geophysics, Geosystems, 24, e2022GC010537. https://doi.org/10.1029/2022GC010537
- Yarce, J., Sheehan, A. F., Nakai, J. S., Schwartz, S. Y., Mochizuki, K., Savage, M. K. K., et al. (2019). Seismicity at the Northern Hikurangi Margin, New Zealand, and Investigation of the Potential Spatial and Temporal Relationships With a Shallow Slow Slip Event. Journal of Geophysical Research: Solid Earth, 124(5), 4751-4766. https://doi.org/10.1029/2018JB017211
- Yarce, J., Sheehan, A., & Roecker, S. (2022). Dataset of automated earthquake detections in the Hikurangi Margin (New Zealand) during the 2014 Slow Slip Event [Data set]. Zenodo. https://doi.org/10.5281/zenodo.7274399
- van Wijk, K. et al. (2020). Event-detection code for the Auckland Volcanic Field COVID-19 study [Code]. University of Auckland. https://doi.org/10.17608/k6.auckland.12915551.v2
- van Wijk, K., Chamberlain, C.J., Lecocq, T., Van Noten, K. (2021). Seismic monitoring of the Auckland Volcanic Field during New Zealand's COVID-19 lockdown. Solid Earth, 12(2), 363-373. https://doi.org/10.5194/se-12-363-2021

## Appendix B — Schema

Profiles use the *Catalogue Submission Profile* from `publication/main.tex` (Table `tab:profile`): identification & contact (name, aka, contact, data source, description); coverage (start/end date, bounding box, depth range, region, magnitude info); content flags; classification (catalogue type, focus, detection method, review status); and availability (data availability, DOI). Controlled vocabularies for type/focus/detection/review match the white paper.
