# Contributing to Earthquake Catalogue Platform

Thank you for your interest in contributing to the Earthquake Catalogue Platform! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- MongoDB (local or Atlas)
- Git

### Development Setup

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/KennyGraham1/catalogofcatalogs.git
   cd catalogofcatalogs
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Start the development server:**

   ```bash
   npm run dev
   ```

5. **Run tests to verify setup:**

   ```bash
   npm test
   ```

## Development Workflow

### Branch Naming

Use descriptive branch names following this pattern:

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions or fixes

Examples:
- `feature/add-export-kml`
- `fix/validation-error-handling`
- `docs/update-api-docs`

### Local Development

1. Create a new branch from `main`:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature
   ```

2. Make your changes following the coding standards.

3. Write or update tests as needed.

4. Run the test suite:

   ```bash
   npm test
   ```

5. Run linting:

   ```bash
   npm run lint
   ```

6. Check TypeScript:

   ```bash
   npx tsc --noEmit
   ```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` types - use proper interfaces
- Use meaningful variable and function names
- Add JSDoc comments for public functions

```typescript
// Good
interface EarthquakeEvent {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth?: number;
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  // Implementation
}

// Avoid
function calc(a: any, b: any): any {
  // ...
}
```

### React Components

- Use functional components with hooks
- Use TypeScript interfaces for props
- Keep components focused and small
- Use `'use client'` directive only when necessary

```typescript
// Good
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function Button({ label, onClick, variant = 'primary', disabled }: ButtonProps) {
  return (
    <button
      className={cn('btn', variant === 'primary' ? 'btn-primary' : 'btn-secondary')}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
```

### File Organization

```
app/                    # Next.js App Router pages
  api/                  # API routes
  (auth)/               # Auth route group
components/             # React components
  ui/                   # shadcn/ui components
  [feature]/            # Feature-specific components
lib/                    # Utility functions and modules
types/                  # TypeScript type definitions
hooks/                  # Custom React hooks
contexts/               # React context providers
__tests__/              # Test files
```

### Styling

- Use Tailwind CSS for styling
- Use the `cn()` utility for conditional classes
- Follow the existing design system

## Testing Guidelines

### Test Structure

```typescript
describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle the expected case', () => {
      // Arrange
      const input = {...};

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe(expected);
    });

    it('should handle edge cases', () => {
      // ...
    });

    it('should throw on invalid input', () => {
      expect(() => functionName(null)).toThrow();
    });
  });
});
```

### Test Coverage

- Aim for 70%+ coverage on new code
- Critical modules (validation, auth) should have 80%+ coverage
- Write tests for:
  - Happy path scenarios
  - Edge cases
  - Error conditions
  - Security-sensitive code

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

## Commit Guidelines

### Commit Message Format

Follow the Conventional Commits specification:

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or fixes
- `chore`: Maintenance tasks

**Examples:**

```
feat(upload): add support for QuakeML 1.2 format

- Parse QuakeML 1.2 XML structure
- Extract origin and magnitude information
- Handle nested event elements

Closes #123
```

```
fix(validation): correct latitude range check

The validation was incorrectly rejecting valid latitudes
near the poles due to floating-point precision issues.

Fixes #456
```

### Pre-commit Checks

The project uses Husky for pre-commit hooks. Before each commit:

1. Tests run for changed files
2. Linting is verified
3. TypeScript types are checked

If any check fails, fix the issues before committing.

## Pull Request Process

### Before Submitting

1. ✅ All tests pass (`npm test`)
2. ✅ Linting passes (`npm run lint`)
3. ✅ TypeScript compiles (`npx tsc --noEmit`)
4. ✅ Code follows the project style
5. ✅ Documentation is updated if needed
6. ✅ Commit messages follow guidelines

### PR Description Template

```markdown
## Summary

Brief description of the changes.

## Changes

- List of specific changes
- Another change
- ...

## Testing

Describe how you tested the changes.

## Screenshots (if applicable)

Add screenshots for UI changes.

## Related Issues

Fixes #123
Relates to #456
```

### Review Process

1. Submit the PR with a clear description
2. Address any automated check failures
3. Respond to reviewer feedback
4. Make requested changes in new commits
5. Once approved, the PR will be merged

## Issue Guidelines

### Bug Reports

Include:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Browser/environment details
- Screenshots if applicable

### Feature Requests

Include:
- Clear description of the feature
- Use case / motivation
- Proposed implementation (if any)
- Alternatives considered

### Questions

For questions, consider:
- Checking existing documentation
- Searching closed issues
- Creating a discussion (if enabled)

## Getting Help

- Review existing documentation
- Check the issue tracker
- Create a new issue for bugs or features

Thank you for contributing! 🎉
