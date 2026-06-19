# NZ Earthquake Catalogues 1960–2026 — LaTeX report

Publication-ready, expert-reviewed inventory of **81 distinct earthquake catalogues** developed for /
covering Aotearoa New Zealand (1960–2026, with emphasis on temporary deployments), each profiled to the
*Catalogue Submission Profile* schema from the white paper (`../publication/main.tex`, Table `tab:profile`).

## Files

| File | Description |
|---|---|
| `nz_earthquake_catalogues_1960-2026.pdf` | Compiled report (61 pp): abstract, scope, overview, timeline, statistics, master index (with reference + DOI per catalogue), 81 detailed entries across 9 categories (with cross-reference notes on related catalogues), references. |
| `nz_earthquake_catalogues_1960-2026.tex` | LaTeX source (article class, `natbib` numeric, `xurl`). |
| `nz_catalogues.bib` | BibTeX database (128 references; `@article`/`@misc`/`@techreport`). |
| `build_report.js` | Build script: renders `inventory_data.json` into the `.tex` + `.bib`. |
| `inventory_data.json` | The inventory data behind the report. |

## Build

```bash
node build_report.js          # regenerate .tex + .bib from inventory_data.json (optional)
latexmk -pdf nz_earthquake_catalogues_1960-2026.tex   # runs pdflatex + bibtex + pdflatex ×2
```

Requires a TeX Live distribution (uses `lmodern`, `booktabs`, `longtable`, `natbib`, `xurl`, `hyperref`).

## Scope & caveats

The inventory was compiled from published literature, dataset repositories, FDSN network records,
and agency catalogues, and profiled to the submission schema (Section 2 of the report). Entries are
**discovery records, not certifications** — confirm details against the cited source before
quantitative (hazard / engineering) use. The inventory is **not exhaustive**: catalogue production
is decentralised and continuous, so a residual tail remains (see Section 6).
