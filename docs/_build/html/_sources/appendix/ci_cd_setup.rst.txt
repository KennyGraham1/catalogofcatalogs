CI/CD Pipeline Setup
====================


Overview
--------


This document describes the Continuous Integration and Continuous Deployment (CI/CD) pipeline for the Earthquake Catalogue Platform.

GitHub Actions Workflows
------------------------


1. Test Suite Workflow (`.github/workflows/test.yml`)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Triggers:**
- Push to ``main`` or ``develop`` branches
- Pull requests to ``main`` or ``develop`` branches

**Jobs:**

Test Job
~~~~~~~~

- **Matrix Strategy**: Tests on Node.js 18.x and 20.x
- **Steps**:
  1. Checkout code
  2. Setup Node.js with caching
  3. Install dependencies (``npm ci``)
  4. Run linter (optional)
  5. Run TypeScript type check (optional)
  6. Run test suite with coverage
  7. Upload coverage to Codecov
  8. Generate coverage report in GitHub summary
  9. Archive test results as artifacts

Build Job
~~~~~~~~~

- **Depends on**: Test job must pass
- **Steps**:
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Build application (``npm run build``)
  5. Report build size

Security Job
~~~~~~~~~~~~

- **Runs in parallel** with test job
- **Steps**:
  1. Checkout code
  2. Setup Node.js
  3. Run ``npm audit`` for security vulnerabilities
  4. Report findings in GitHub summary

2. Deploy Workflow (`.github/workflows/deploy.yml`)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Triggers:**
- Push to ``main`` branch
- Manual workflow dispatch

**Environment**: Production

**Steps**:
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Run tests (must pass)
5. Build application
6. Run deployment checks
7. Deploy to production (customize for your platform)
8. Send deployment notification

Pre-commit Hooks
----------------


Setup
^^^^^


Install Husky for Git hooks:

.. code-block:: bash

   npm install --save-dev husky
   npx husky install


Pre-commit Hook (`.husky/pre-commit`)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Runs before each commit:**
1. Run tests on changed files (``--findRelatedTests``)
2. Run linter
3. Check TypeScript types

**To bypass** (use sparingly):
.. code-block:: bash

   git commit --no-verify -m "message"


Test Coverage
-------------


Coverage Goals
^^^^^^^^^^^^^^


- **Overall**: 70%+ code coverage
- **Critical Paths**: 90%+ coverage
  - Data import/export
  - Data validation
  - Database operations
- **UI Components**: 60%+ coverage
- **API Routes**: 80%+ coverage

Viewing Coverage
^^^^^^^^^^^^^^^^


**Local:**
.. code-block:: bash

   npm run test:coverage
   open coverage/lcov-report/index.html


**CI/CD:**
- Coverage reports are uploaded to Codecov
- Summary appears in GitHub Actions summary
- Artifacts are available for download

Continuous Integration Best Practices
-------------------------------------


1. Fast Feedback
^^^^^^^^^^^^^^^^


- Tests run on every push and PR
- Parallel jobs for faster execution
- Matrix testing across Node.js versions

2. Quality Gates
^^^^^^^^^^^^^^^^


- Tests must pass before merge
- Build must succeed
- Security audit runs automatically

3. Automated Checks
^^^^^^^^^^^^^^^^^^^


- Linting (code style)
- Type checking (TypeScript)
- Security audits (npm audit)
- Test coverage tracking

4. Artifact Management
^^^^^^^^^^^^^^^^^^^^^^


- Test results archived
- Coverage reports saved
- Build artifacts available

Deployment Pipeline
-------------------


Environments
^^^^^^^^^^^^


1. **Development** (``develop`` branch)
   - Automatic deployment on push
   - Testing environment
   - Latest features

2. **Production** (``main`` branch)
   - Manual approval required
   - Stable releases only
   - Full test suite must pass

Deployment Checklist
^^^^^^^^^^^^^^^^^^^^


Before deploying to production:

- [ ] All tests pass (321/321)
- [ ] Code coverage ≥ 70%
- [ ] No high-severity security vulnerabilities
- [ ] Build succeeds without errors
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Backup created

Deployment Steps
^^^^^^^^^^^^^^^^


1. **Pre-deployment**
   - Run full test suite
   - Build application
   - Run security audit

2. **Deployment**
   - Deploy to hosting platform (Vercel, AWS, etc.)
   - Run database migrations
   - Update environment variables

3. **Post-deployment**
   - Verify application is running
   - Check logs for errors
   - Run smoke tests
   - Monitor performance

Rollback Procedure
^^^^^^^^^^^^^^^^^^


If deployment fails:

1. Revert to previous version
2. Investigate failure
3. Fix issues
4. Re-deploy

Monitoring & Alerts
-------------------


GitHub Actions Notifications
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


- **Success**: Green checkmark on commits/PRs
- **Failure**: Red X with error details
- **Email**: Notifications to repository admins

Coverage Tracking
^^^^^^^^^^^^^^^^^


- Codecov integration
- Coverage trends over time
- PR coverage diff

Security Alerts
^^^^^^^^^^^^^^^


- Dependabot for dependency updates
- npm audit in CI pipeline
- GitHub security advisories

Local Development Workflow
--------------------------


Before Committing
^^^^^^^^^^^^^^^^^


.. code-block:: bash

   # Run tests
   npm test
   
   # Run linter
   npm run lint
   
   # Check types
   npx tsc --noEmit
   
   # Run coverage
   npm run test:coverage


Creating a Pull Request
^^^^^^^^^^^^^^^^^^^^^^^


1. Create feature branch from ``develop``
2. Make changes
3. Run tests locally
4. Commit (pre-commit hooks run automatically)
5. Push to GitHub
6. Create PR
7. Wait for CI checks to pass
8. Request review
9. Merge after approval

Troubleshooting
---------------


Tests Fail in CI but Pass Locally
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Possible causes:**
- Environment differences
- Missing environment variables
- Database state issues
- Timing/race conditions

**Solutions:**
- Check GitHub Actions logs
- Reproduce locally with ``NODE_ENV=test``
- Verify all dependencies are in ``package.json``
- Check for hardcoded paths or URLs

Build Fails in CI
^^^^^^^^^^^^^^^^^


**Possible causes:**
- TypeScript errors
- Missing dependencies
- Environment variable issues

**Solutions:**
- Run ``npm run build`` locally
- Check ``next build`` output
- Verify all imports are correct
- Check for missing environment variables

Coverage Drops Below Threshold
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Solutions:**
- Add tests for new code
- Review uncovered lines
- Update coverage goals if appropriate

Customization
-------------


Adding New Workflows
^^^^^^^^^^^^^^^^^^^^


Create new workflow file in ``.github/workflows/``:

.. code-block:: yaml

   name: Custom Workflow
   on: [push]
   jobs:
     custom-job:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Custom step
           run: echo "Hello World"


Modifying Test Job
^^^^^^^^^^^^^^^^^^


Edit ``.github/workflows/test.yml``:

.. code-block:: yaml

   - name: Run tests
     run: npm test -- --coverage --maxWorkers=2
     env:
       NODE_ENV: test
       MONGODB_URI: mongodb://localhost:27017/test_catalogue


Adding Deployment Target
^^^^^^^^^^^^^^^^^^^^^^^^


Edit ``.github/workflows/deploy.yml``:

.. code-block:: yaml

   - name: Deploy to Vercel
     uses: amondnet/vercel-action@v20
     with:
       vercel-token: ${{ secrets.VERCEL_TOKEN }}
       vercel-org-id: ${{ secrets.ORG_ID }}
       vercel-project-id: ${{ secrets.PROJECT_ID }}


Security Considerations
-----------------------


Secrets Management
^^^^^^^^^^^^^^^^^^


Store sensitive data in GitHub Secrets:

1. Go to repository Settings → Secrets and variables → Actions
2. Add secrets (API keys, tokens, etc.)
3. Reference in workflows: ``${{ secrets.SECRET_NAME }}``

**Never commit:**
- API keys
- Database passwords
- Private keys
- Environment files with secrets

Dependency Security
^^^^^^^^^^^^^^^^^^^


- Run ``npm audit`` regularly
- Update dependencies promptly
- Review Dependabot PRs
- Use ``npm ci`` in CI (not ``npm install``)

Performance Optimization
------------------------


Caching
^^^^^^^


- Node modules cached by GitHub Actions
- Build cache for faster builds
- Test cache for faster test runs

Parallel Execution
^^^^^^^^^^^^^^^^^^


- Matrix strategy for multiple Node versions
- Parallel test execution (``--maxWorkers=2``)
- Independent jobs run in parallel

Resource Limits
^^^^^^^^^^^^^^^


- GitHub Actions: 6 hours per job
- 20 concurrent jobs (free tier)
- 2,000 minutes/month (free tier)

Metrics & Analytics
-------------------


Key Metrics
^^^^^^^^^^^


- **Test Pass Rate**: 100% (321/321 tests)
- **Build Success Rate**: Track over time
- **Deployment Frequency**: Track deployments
- **Mean Time to Recovery**: Track incident response

Reporting
^^^^^^^^^


- GitHub Actions dashboard
- Codecov dashboard
- Custom reports in workflow summaries

Future Enhancements
-------------------


Planned Improvements
^^^^^^^^^^^^^^^^^^^^


1. **E2E Testing**
   - Add Playwright or Cypress
   - Test critical user flows
   - Run in CI pipeline

2. **Performance Testing**
   - Lighthouse CI
   - Load testing
   - Bundle size tracking

3. **Automated Releases**
   - Semantic versioning
   - Changelog generation
   - GitHub releases

4. **Advanced Monitoring**
   - Error tracking (Sentry)
   - Performance monitoring
   - User analytics

Resources
---------


- ``GitHub Actions Documentation <https://docs.github.com/en/actions>``_
- ``Jest Documentation <https://jestjs.io/docs/getting-started>``_
- ``Codecov Documentation <https://docs.codecov.com/>``_
- ``Husky Documentation <https://typicode.github.io/husky/>``_

Support
-------


For issues with CI/CD:
1. Check GitHub Actions logs
2. Review this documentation
3. Check repository issues
4. Contact repository maintainers
