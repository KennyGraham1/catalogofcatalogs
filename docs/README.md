# 📚 Documentation

The authoritative documentation for the Earthquake Catalogue Platform is managed using **Sphinx** and **ReadTheDocs**.

## 📖 Where to Find Documentation

- **Source Files (ReStructuredText):** All documentation source files are located in the [`source`](./source/) directory.
- **Built Documentation:** The latest documentation is available online at:
  > **[https://catalogofcatalogs.readthedocs.io/en/latest/](https://catalogofcatalogs.readthedocs.io/en/latest/)**

## 📂 Directory Structure

- `source/`: Contains the `.rst` source files for Sphinx.
  - `source/user-guide/`: Guides for end-users.
  - `source/developer-guide/`: Technical documentation for developers.
  - `source/api-reference/`: API specifications.
  - `source/deployment/`: Deployment and administration guides.
  - `source/appendix/`: Supplementary materials and design documents.
- `archive/`: Contains old/redundant Markdown files (deprecated).

## 🛠️ Building Locally

To build the documentation locally, you need Python and Sphinx installed.

```bash
# Install dependencies
pip install -r requirements.txt

# Build HTML
make html
```

The built HTML files will be in `_build/html`.
