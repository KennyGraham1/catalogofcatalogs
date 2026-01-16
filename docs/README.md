# Documentation Index

Welcome to the Earthquake Catalogue Platform documentation. This directory contains comprehensive documentation for users, developers, and administrators.

## 📖 For Users

### [User Guide](USER_GUIDE.md)
Complete guide for end users of the platform.

**Contents:**
- Introduction and key features
- Getting started and navigation
- Dashboard overview
- Managing catalogues
- Uploading data (CSV, TXT, JSON, QuakeML)
- Importing from GeoNet
- Merging catalogues
- Visualization & Analytics
- Exporting data
- Advanced features
- Troubleshooting
- Best practices

**Who should read this:** Anyone using the platform to manage earthquake catalogue data.

---

### [FAQ](FAQ.md)
Frequently asked questions and answers.

**Contents:**
- General questions
- Data import & upload
- Data quality & validation
- Visualization & maps
- Merging catalogues
- Export & integration
- Performance & scalability
- Troubleshooting
- Technical questions

**Who should read this:** Users looking for quick answers to common questions.

---

## 🔧 For Developers

### [Developer Guide](DEVELOPER_GUIDE.md)
Technical documentation for developers working on the platform.

**Contents:**
- Architecture overview
- Technology stack
- Project structure
- Database schema
- API reference (summary)
- Component library
- Development workflow
- Testing
- Deployment
- Contributing guidelines
- Best practices

**Who should read this:** Developers contributing to the project or customizing the platform.

---

### [API Reference](API_REFERENCE.md)
Complete REST API documentation.

**Contents:**
- Catalogues API
- Events API
- Import API
- Upload API
- Merge API
- Export API
- Health Check API
- Error responses

**Who should read this:** Developers integrating with the platform or building custom clients.

---

## 🚀 For Administrators

### [Deployment Guide](DEPLOYMENT_GUIDE.md)
Production deployment and operations guide.

**Contents:**
- Prerequisites and system requirements
- Environment setup
- Database setup
- Production build
- Docker deployment
- Manual deployment with systemd
- Reverse proxy setup (Nginx)
- SSL/TLS configuration
- Monitoring & logging
- Backup & recovery
- Performance tuning
- Security hardening

**Who should read this:** System administrators deploying and maintaining the platform in production.

---

### [Vercel Deployment Guide](VERCEL_DEPLOYMENT_GUIDE.md)
Step-by-step guide for deploying to Vercel with MongoDB Atlas.

**Contents:**
- MongoDB Atlas cluster setup
- Database user and network configuration
- Next.js Vercel configuration
- Environment variables setup
- Database initialization for production
- Deployment process
- Post-deployment verification
- Troubleshooting common issues

**Who should read this:** Developers deploying to Vercel's serverless platform.

---

## 📊 For Data Managers

### [Data Validation Guide](DATA_VALIDATION_GUIDE.md)
Comprehensive guide to data quality and validation.

**Contents:**
- Data validation overview
- Field-level validation rules
- Cross-field validation
- Quality scoring system
- Duplicate detection
- Anomaly detection
- Completeness metrics
- Best practices
- Troubleshooting validation issues

**Who should read this:** Data managers and quality assurance personnel.

---

## 📚 Quick Reference

### Documentation by Task

#### Getting Started
1. **New User?** → Start with [User Guide - Getting Started](USER_GUIDE.md#getting-started)
2. **Installing?** → See [Deployment Guide - Prerequisites](DEPLOYMENT_GUIDE.md#prerequisites)
3. **Developing?** → Read [Developer Guide - Development Workflow](DEVELOPER_GUIDE.md#development-workflow)

#### Common Tasks

**Uploading Data:**
- [User Guide - Uploading Data](USER_GUIDE.md#uploading-data)
- [FAQ - Data Import & Upload](FAQ.md#data-import--upload)

**Importing from GeoNet:**
- [User Guide - Importing from GeoNet](USER_GUIDE.md#importing-from-geonet)
- [GeoNet Import Documentation](../GEONET_IMPORT_DOCUMENTATION.md)

**Merging Catalogues:**
- [User Guide - Merging Catalogues](USER_GUIDE.md#merging-catalogues)
- [FAQ - Merging Catalogues](FAQ.md#merging-catalogues)

**Exporting Data:**
- [User Guide - Exporting Data](USER_GUIDE.md#exporting-data)
- [FAQ - Export & Integration](FAQ.md#export--integration)

**Visualization:**
- [User Guide - Visualization & Analytics](USER_GUIDE.md#visualization--analytics)
- [FAQ - Visualization & Maps](FAQ.md#visualization--maps)

**API Integration:**
- [API Reference](API_REFERENCE.md)
- [Developer Guide - API Reference](DEVELOPER_GUIDE.md#api-reference)

**Deployment:**
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Developer Guide - Deployment](DEVELOPER_GUIDE.md#deployment)

**Troubleshooting:**
- [FAQ - Troubleshooting](FAQ.md#troubleshooting)
- [User Guide - Troubleshooting](USER_GUIDE.md#troubleshooting)

---

## 🔍 Documentation by Topic

### Data Management
- [User Guide - Managing Catalogues](USER_GUIDE.md#managing-catalogues)
- [User Guide - Uploading Data](USER_GUIDE.md#uploading-data)
- [User Guide - Importing from GeoNet](USER_GUIDE.md#importing-from-geonet)
- [Data Validation Guide](DATA_VALIDATION_GUIDE.md)

### Visualization
- [User Guide - Visualization & Analytics](USER_GUIDE.md#visualization--analytics)
- [FAQ - Visualization & Maps](FAQ.md#visualization--maps)

### Quality Assessment
- [Data Validation Guide - Quality Scoring](DATA_VALIDATION_GUIDE.md#quality-scoring-system)
- [User Guide - Advanced Features](USER_GUIDE.md#advanced-features)

### Development
- [Developer Guide](DEVELOPER_GUIDE.md)
- [API Reference](API_REFERENCE.md)

### Operations
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Developer Guide - Testing](DEVELOPER_GUIDE.md#testing)

---

## 📄 Additional Documentation

The following documentation files are located in the project root directory:

### Feature-Specific Guides
- **[GeoNet Import Documentation](../GEONET_IMPORT_DOCUMENTATION.md)** - Detailed guide to GeoNet import feature
- **[GeoNet Baseline Setup](../GEONET_BASELINE_SETUP.md)** - Setting up baseline GeoNet data
- **[GeoNet Implementation Summary](../GEONET_IMPORT_IMPLEMENTATION_SUMMARY.md)** - Technical implementation details

### Technical Specifications
- **[QuakeML Schema Design](../QUAKEML_SCHEMA_DESIGN.md)** - Database schema for QuakeML 1.2 support
- **[QuakeML Testing Report](../QUAKEML_TESTING_REPORT.md)** - Comprehensive testing results

### Maintenance Guides
- **[Database Management](../DATABASE_MANAGEMENT.md)** - Database storage, backups, and maintenance
- **[Quick Test Guide](../QUICK_TEST_GUIDE.md)** - Quick reference for testing features

---

## 🆘 Getting Help

### I need help with...

**Using the platform:**
1. Check the [User Guide](USER_GUIDE.md)
2. Look in the [FAQ](FAQ.md)
3. Contact support

**Developing or customizing:**
1. Read the [Developer Guide](DEVELOPER_GUIDE.md)
2. Check the [API Reference](API_REFERENCE.md)
3. Review the code examples
4. Create an issue in the repository

**Deploying to production:**
1. Follow the [Deployment Guide](DEPLOYMENT_GUIDE.md)
2. Check the [FAQ - Technical Questions](FAQ.md#technical-questions)
3. Contact the development team

**Data quality issues:**
1. Read the [Data Validation Guide](DATA_VALIDATION_GUIDE.md)
2. Check [FAQ - Data Quality & Validation](FAQ.md#data-quality--validation)
3. Review your data format

---

## 📝 Documentation Standards

All documentation in this directory follows these standards:

- **Markdown Format**: All files use GitHub-flavored Markdown
- **Table of Contents**: Each document includes a TOC for easy navigation
- **Examples**: Code examples and screenshots where applicable
- **Cross-References**: Links to related documentation
- **Last Updated**: Each document shows when it was last updated

---

## 🤝 Contributing to Documentation

Found an error or want to improve the documentation?

1. **Small fixes**: Create an issue or submit a merge request
2. **New sections**: Discuss with the team first
3. **Screenshots**: Use PNG format, optimize file size
4. **Code examples**: Test all code examples before submitting

See the [Developer Guide - Contributing](DEVELOPER_GUIDE.md#contributing) for more details.

---

## 📅 Documentation Updates

**Last Major Update:** October 2024

**Recent Changes:**
- Added comprehensive User Guide
- Added Developer Guide with architecture details
- Added complete API Reference
- Added Deployment Guide for production
- Added FAQ with common questions
- Reorganized documentation structure

---

## 📧 Contact

For questions about the documentation or the platform:

- **Issues**: Create an issue in the GitLab repository
- **Email**: Contact GNS Science
- **Support**: See the main [README](../README.md) for support information

---

*This documentation is maintained by the Earthquake Catalogue Platform development team.*
