# NZ Earthquake Catalogues 1960–2026 — LaTeX report

A reviewed inventory of **93 distinct earthquake catalogues** developed for /
covering Aotearoa New Zealand (1960–2026, with emphasis on temporary deployments), each profiled to the
*Catalogue Submission Profile* schema from the white paper (`../publication/main.tex`, Table `tab:profile`).

## Files

| File | Description |
|---|---|
| `nz_earthquake_catalogues_1960-2026.pdf` | Compiled report (68 pp): abstract, scope, overview, timeline, statistics, master index (with reference + DOI per catalogue), a spatial-coverage map, 93 detailed entries across 9 categories (with cross-reference notes on related catalogues), references. |
| `nz_earthquake_catalogues_1960-2026.tex` | LaTeX source (article class, `natbib` numeric, `xurl`, `graphicx`). |
| `nz_catalogues.bib` | BibTeX database (142 references; `@article`/`@misc`/`@techreport`). |
| `build_report.js` | Build script: renders `inventory_data.json` into the `.tex` + `.bib`. |
| `inventory_data.json` | The inventory data behind the report. |
| `make_map.py` | Builds the spatial-coverage figure (cartopy + matplotlib + the active-fault GeoJSON); geocodes each catalogue to a representative footprint and dumps `map/footprints.json`. |
| `figures/nz_catalogue_coverage.{pdf,png}` | Two-panel map (shown landscape in the report): (a) catalogue footprints by category; (b) regional coverage-density heatmap. |
| `make_leaflet.py` | Builds the interactive map from `map/footprints.json`. |
| `map/nz_catalogue_map.html` | **Interactive** Leaflet map: category-coloured footprints with popups (period, region, DOI), category toggles, legend, and a national-catalogues panel. Open in a browser (needs internet for tiles). |

## Build

```bash
python3 make_map.py           # regenerate figures/nz_catalogue_coverage.{pdf,png} (optional)
node build_report.js          # regenerate .tex + .bib from inventory_data.json (optional)
latexmk -pdf nz_earthquake_catalogues_1960-2026.tex   # runs pdflatex + bibtex + pdflatex ×2
```

Requires a TeX Live distribution (uses `lmodern`, `booktabs`, `longtable`, `natbib`, `xurl`, `graphicx`, `hyperref`).
The map step needs Python with `cartopy`, `matplotlib`, `geopandas` (coastline from cartopy's cached 10 m Natural Earth data; faults from `../public/data/nz-active-faults.geojson`).

## Scope & caveats

The inventory was compiled from published literature, dataset repositories, FDSN network records,
and agency catalogues, and profiled to the submission schema (Section 2 of the report). Entries are
**discovery records, not certifications** — confirm details against the cited source before
quantitative (hazard / engineering) use. The inventory is **not exhaustive**: catalogue production
is decentralised and continuous, so a residual tail remains (see Section 6).
