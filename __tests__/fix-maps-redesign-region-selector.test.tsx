/**
 * Map redesign S6, region selector (components/catalogues/RegionSelectorMap.tsx): the gray
 * basemap through the shared layer control, drawn and preset regions in the app's primary
 * colour (2 px outline, 8 % fill) in both themes, a leaflet-draw toolbar that stays legible
 * on the dark control background, a one-line hint, and the CSP-safe default marker icon.
 * The national preset's antimeridian box is covered by fix-maps-nz-preset.test.tsx.
 */
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import L from 'leaflet';

const mockFitBounds = jest.fn();
const mockAddLayer = jest.fn();
const editControlProps: any[] = [];
jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    useMap: jest.fn(),
    MapContainer: React.forwardRef(function MapContainer({ children }: any, ref: any) {
      React.useImperativeHandle(ref, () => ({ fitBounds: mockFitBounds }));
      return <div data-testid="map-container">{children}</div>;
    }),
    FeatureGroup: React.forwardRef(function FeatureGroup({ children }: any, ref: any) {
      React.useImperativeHandle(ref, () => ({ addLayer: mockAddLayer, removeLayer: jest.fn() }));
      return <div>{children}</div>;
    }),
    ScaleControl: (props: any) => <div data-testid="scale-bar" data-position={props.position} />,
  };
});
jest.mock('react-leaflet-draw', () => ({
  EditControl: (props: any) => { editControlProps.push(props); return null; },
}));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => <div data-testid="layer-control" /> }));
jest.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: any) => (
    <select aria-label="Preset region" defaultValue="" onChange={(e) => onValueChange(e.target.value)}>
      <option value="" disabled>Select Region</option>
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

import {
  REGION_SHAPE_FILL_OPACITY, REGION_SHAPE_WEIGHT, RegionSelectorMap, regionShapeStyle, resolvePrimaryColor,
} from '@/components/catalogues/RegionSelectorMap';

const root = document.documentElement;

beforeEach(() => {
  mockFitBounds.mockClear();
  mockAddLayer.mockClear();
  editControlProps.length = 0;
});
afterEach(() => {
  root.style.removeProperty('--primary');
});

const choosePreset = (value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: 'Preset region' }), { target: { value } });
const drawnRegion = () => mockAddLayer.mock.calls[mockAddLayer.mock.calls.length - 1][0] as L.Rectangle;
const lastEditControl = () => editControlProps[editControlProps.length - 1];

describe('region shape style', () => {
  it('reads the theme\'s --primary as a colour Leaflet can paint', () => {
    root.style.setProperty('--primary', '221.2 83.2% 53.3%');
    expect(resolvePrimaryColor(false)).toBe('hsl(221.2, 83.2%, 53.3%)');
    expect(regionShapeStyle(false)).toEqual({
      color: 'hsl(221.2, 83.2%, 53.3%)', fillColor: 'hsl(221.2, 83.2%, 53.3%)', weight: 2, opacity: 1, fillOpacity: 0.08,
    });
  });

  it('falls back to the default theme primaries when the variable cannot be read', () => {
    expect(resolvePrimaryColor(false)).toBe('hsl(0, 0%, 9%)');
    expect(resolvePrimaryColor(true)).toBe('hsl(0, 0%, 98%)');
  });
});

describe('RegionSelectorMap', () => {
  it('draws a preset region in the primary colour with a 2 px outline and an 8 % fill', () => {
    root.style.setProperty('--primary', '0 0% 9%');
    render(<RegionSelectorMap onRegionSelected={jest.fn()} />);
    choosePreset('nz-wellington');
    expect(drawnRegion().options).toMatchObject({
      color: 'hsl(0, 0%, 9%)', fillColor: 'hsl(0, 0%, 9%)', weight: REGION_SHAPE_WEIGHT, fillOpacity: REGION_SHAPE_FILL_OPACITY,
    });
    expect([REGION_SHAPE_WEIGHT, REGION_SHAPE_FILL_OPACITY]).toEqual([2, 0.08]);
  });

  it('gives the polygon tool the same style, keeps it while editing, and offers no other tool', () => {
    render(<RegionSelectorMap onRegionSelected={jest.fn()} />);
    const { draw, edit, position } = lastEditControl();
    expect(position).toBe('topright');
    expect(draw.polygon.shapeOptions).toEqual(regionShapeStyle(false));
    expect(draw.polygon.allowIntersection).toBe(false);
    for (const tool of ['rectangle', 'circle', 'circlemarker', 'marker', 'polyline']) expect(draw[tool]).toBe(false);
    expect(edit.edit.selectedPathOptions).toMatchObject({ maintainColor: true, dashArray: expect.any(String) });
  });

  it('restyles the tool and the drawn region when the theme changes', async () => {
    root.style.setProperty('--primary', '0 0% 9%');
    render(<RegionSelectorMap onRegionSelected={jest.fn()} />);
    choosePreset('nz-auckland');
    await act(async () => {
      root.style.setProperty('--primary', '0 0% 98%');
      root.classList.add('dark');
    });
    expect(lastEditControl().draw.polygon.shapeOptions.color).toBe('hsl(0, 0%, 98%)');
    expect(drawnRegion().options.color).toBe('hsl(0, 0%, 98%)');
    await act(async () => { root.classList.remove('dark'); });
  });

  it('uses the shared layer control (gray base) and a scale bar, with a one-line hint', () => {
    render(<RegionSelectorMap onRegionSelected={jest.fn()} />);
    expect(screen.getByTestId('layer-control')).toBeInTheDocument();
    expect(screen.getByTestId('scale-bar')).toHaveAttribute('data-position', 'bottomleft');
    expect(screen.queryByText('Tip')).toBeNull();
    expect(screen.queryByText(/You can also edit or delete/)).toBeNull();
    expect(screen.getByText(/Draw a polygon with the tool at the top right of the map, or pick a preset/)).toBeInTheDocument();
    // The search panel's tab heads the map; no second card title inside it.
    expect(screen.queryByText('Interactive Region Selector')).toBeNull();
  });

  it('points the default marker icon at bundled images, not the CSP-blocked cdnjs', () => {
    render(<RegionSelectorMap onRegionSelected={jest.fn()} />);
    expect(String(L.Icon.Default.prototype.options.iconUrl)).not.toMatch(/cdnjs/);
  });

  it('keeps the draw toolbar legible in both themes: currentColor icons instead of the black sprite', () => {
    const { container } = render(<RegionSelectorMap onRegionSelected={jest.fn()} />);
    // The toolbar rules are scoped to the map wrapper (CSS module class).
    expect(container.querySelector('.map [data-testid="map-container"]')).not.toBeNull();

    const css = fs.readFileSync(path.join(process.cwd(), 'components/catalogues/RegionSelectorMap.module.css'), 'utf8');
    const rule = (selector: string) => {
      const start = css.indexOf(selector);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf('}', start));
    };
    expect(rule('.leaflet-draw-toolbar a {')).toMatch(/background-image:\s*none/);
    expect(rule('.leaflet-draw-toolbar a::after')).toMatch(/background-color:\s*currentColor/);
    for (const tool of ['draw-draw-polygon', 'draw-edit-edit', 'draw-edit-remove']) {
      expect(rule(`a.leaflet-${tool}::after`)).toMatch(/(^|\s)mask-image:\s*url\("data:image\/svg\+xml/m);
    }
  });
});
