# Testing Guide - Earthquake Catalogue Platform

## Overview

This guide covers the testing strategy, infrastructure, and best practices for the Earthquake Catalogue Platform. Our testing approach ensures reliability, maintainability, and confidence in the codebase.

## Testing Stack

- **Jest** - Test runner and assertion library
- **React Testing Library** - Component testing utilities
- **@testing-library/user-event** - User interaction simulation
- **jest-environment-jsdom** - DOM environment for testing

## Test Structure

```
__tests__/
├── lib/                          # Unit tests for utility libraries
│   ├── earthquake-utils.test.ts
│   ├── parsers.test.ts
│   ├── quakeml-parser.test.ts
│   ├── validation.test.ts
│   ├── data-quality-checker.test.ts
│   └── cross-field-validation.test.ts
├── api/                          # API route tests (to be added)
│   ├── catalogues.test.ts
│   ├── events.test.ts
│   └── import.test.ts
├── components/                   # Component tests (to be added)
│   ├── CatalogueMap.test.tsx
│   ├── EventFilters.test.tsx
│   └── CatalogueList.test.tsx
└── integration/                  # Integration tests (to be added)
    ├── import-workflow.test.ts
    ├── merge-workflow.test.ts
    └── export-workflow.test.ts
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm test -- earthquake-utils.test.ts
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="getMagnitudeColor"
```

## Writing Tests

### Unit Tests

Unit tests focus on testing individual functions and utilities in isolation.

**Example: Testing Utility Functions**

```typescript
import { getMagnitudeColor, validateCoordinates } from '@/lib/earthquake-utils';

describe('earthquake-utils', () => {
  describe('getMagnitudeColor', () => {
    it('should return correct colors for different magnitudes', () => {
      expect(getMagnitudeColor(1)).toBe('#16a34a'); // green
      expect(getMagnitudeColor(4)).toBe('#ca8a04'); // yellow
      expect(getMagnitudeColor(6)).toBe('#dc2626'); // red
    });
  });

  describe('validateCoordinates', () => {
    it('should validate correct coordinates', () => {
      expect(validateCoordinates(-41.2865, 174.7762)).toBe(true);
    });

    it('should reject invalid latitude', () => {
      expect(validateCoordinates(91, 174.7762)).toBe(false);
    });
  });
});
```

### Component Tests

Component tests verify React components render correctly and handle user interactions.

**Example: Testing a Component**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { EventFilters } from '@/components/event-filters';

describe('EventFilters', () => {
  it('should render filter controls', () => {
    render(<EventFilters onFilterChange={jest.fn()} />);
    
    expect(screen.getByLabelText('Magnitude')).toBeInTheDocument();
    expect(screen.getByLabelText('Depth')).toBeInTheDocument();
  });

  it('should call onFilterChange when filters are updated', () => {
    const handleFilterChange = jest.fn();
    render(<EventFilters onFilterChange={handleFilterChange} />);
    
    const magnitudeInput = screen.getByLabelText('Magnitude');
    fireEvent.change(magnitudeInput, { target: { value: '5.0' } });
    
    expect(handleFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ magnitude: 5.0 })
    );
  });
});
```

### API Route Tests

API route tests verify endpoints return correct responses and handle errors.

**Example: Testing an API Route**

```typescript
import { GET } from '@/app/api/catalogues/route';
import { NextRequest } from 'next/server';

describe('/api/catalogues', () => {
  it('should return list of catalogues', async () => {
    const request = new NextRequest('http://localhost:3001/api/catalogues');
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('id');
    expect(data[0]).toHaveProperty('name');
  });

  it('should handle database errors gracefully', async () => {
    // Mock database error
    jest.spyOn(db, 'all').mockImplementation(() => {
      throw new Error('Database connection failed');
    });
    
    const request = new NextRequest('http://localhost:3001/api/catalogues');
    const response = await GET(request);
    
    expect(response.status).toBe(500);
    expect(await response.json()).toHaveProperty('error');
  });
});
```

### Integration Tests

Integration tests verify complete workflows across multiple components and APIs.

**Example: Testing Import Workflow**

```typescript
describe('QuakeML Import Workflow', () => {
  it('should import QuakeML file and create catalogue', async () => {
    // 1. Upload file
    const formData = new FormData();
    formData.append('file', quakemlFile);
    formData.append('name', 'Test Catalogue');
    
    const uploadResponse = await fetch('/api/import/quakeml', {
      method: 'POST',
      body: formData,
    });
    
    expect(uploadResponse.status).toBe(200);
    const { catalogueId } = await uploadResponse.json();
    
    // 2. Verify catalogue was created
    const catalogueResponse = await fetch(`/api/catalogues/${catalogueId}`);
    const catalogue = await catalogueResponse.json();
    
    expect(catalogue.name).toBe('Test Catalogue');
    expect(catalogue.event_count).toBeGreaterThan(0);
    
    // 3. Verify events were imported
    const eventsResponse = await fetch(`/api/catalogues/${catalogueId}/events`);
    const events = await eventsResponse.json();
    
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty('magnitude');
    expect(events[0]).toHaveProperty('latitude');
  });
});
```

## Test Coverage Goals

### Current Coverage

Based on existing tests:
- **Utility Libraries**: ~80% coverage
  - ✅ earthquake-utils.ts
  - ✅ parsers.ts
  - ✅ quakeml-parser.ts
  - ✅ validation.ts
  - ✅ data-quality-checker.ts
  - ✅ cross-field-validation.ts

### Target Coverage

- **Overall**: 70%+ code coverage
- **Critical Paths**: 90%+ coverage
  - Data import/export
  - Authentication & authorization
  - Data validation
  - Database operations
- **UI Components**: 60%+ coverage
- **API Routes**: 80%+ coverage

## Best Practices

### 1. Test Naming

Use descriptive test names that explain what is being tested:

```typescript
// ✅ Good
it('should return red color for magnitude >= 6.0', () => {});

// ❌ Bad
it('test magnitude color', () => {});
```

### 2. Arrange-Act-Assert Pattern

Structure tests clearly:

```typescript
it('should validate earthquake event', () => {
  // Arrange
  const event = {
    time: '2024-01-01T00:00:00Z',
    latitude: -41.2865,
    longitude: 174.7762,
    magnitude: 5.0,
    depth: 10
  };
  
  // Act
  const result = validateEvent(event);
  
  // Assert
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});
```

### 3. Test Independence

Each test should be independent and not rely on other tests:

```typescript
// ✅ Good - Each test is independent
describe('Catalogue API', () => {
  beforeEach(() => {
    // Reset database state
    resetTestDatabase();
  });
  
  it('should create catalogue', () => {});
  it('should update catalogue', () => {});
});
```

### 4. Mock External Dependencies

Mock database calls, API requests, and file system operations:

```typescript
jest.mock('@/lib/db', () => ({
  all: jest.fn(),
  run: jest.fn(),
  get: jest.fn(),
}));
```

### 5. Test Edge Cases

Don't just test the happy path:

```typescript
describe('validateMagnitude', () => {
  it('should accept valid magnitudes', () => {
    expect(validateMagnitude(5.0)).toBe(true);
  });
  
  it('should reject negative magnitudes', () => {
    expect(validateMagnitude(-1.0)).toBe(false);
  });
  
  it('should reject extremely large magnitudes', () => {
    expect(validateMagnitude(15.0)).toBe(false);
  });
  
  it('should handle null values', () => {
    expect(validateMagnitude(null)).toBe(false);
  });
});
```

## Continuous Integration

Tests should run automatically on:
- Every commit (pre-commit hook)
- Every pull request
- Before deployment

## Troubleshooting

### Common Issues

**Issue**: Tests fail with "Cannot find module '@/lib/...'"
**Solution**: Check `jest.config.js` has correct `moduleNameMapper`:
```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
}
```

**Issue**: Tests timeout
**Solution**: Increase timeout for slow tests:
```typescript
it('should import large file', async () => {
  // Test code
}, 30000); // 30 second timeout
```

**Issue**: Database locked errors
**Solution**: Use `maxWorkers: 1` in jest.config.js for SQLite tests

## Next Steps

1. ✅ Install testing dependencies
2. ⏳ Create API route tests
3. ⏳ Create component tests
4. ⏳ Create integration tests
5. ⏳ Set up CI/CD pipeline
6. ⏳ Achieve 70%+ code coverage

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

