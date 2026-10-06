/**
 * UI audit 2026-10-05, the wider axe sweep beyond the audit's 14 samples:
 *  - a table that scrolls sideways is reachable by keyboard (scrollable-region-focusable),
 *    and a table that fits adds no tab stop;
 *  - the quality grade badge's text keeps 4.5:1 on every grade colour.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { readableTextOn } from '@/components/advanced-viz/QualityScoreCard';
import { QUALITY_GRADE_COLORS } from '@/lib/map-style';

function sized(scrollWidth: number, clientWidth: number) {
  jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => scrollWidth);
  jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => clientWidth);
}
afterEach(() => jest.restoreAllMocks());

const table = () => render(<Table aria-label="Users"><TableBody><TableRow><TableCell>cell</TableCell></TableRow></TableBody></Table>);

describe('Table scroll region', () => {
  it('is a focusable, named region while the table overflows its box', () => {
    sized(900, 300);
    table();
    const region = screen.getByRole('region', { name: 'Users' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('adds no tab stop when the table fits', () => {
    sized(300, 300);
    table();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('table').parentElement).not.toHaveAttribute('tabindex');
  });
});

describe('quality grade badge text', () => {
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  it.each(Object.entries(QUALITY_GRADE_COLORS))('grade %s: the chosen text colour reaches 4.5:1', (_grade, colour) => {
    expect(contrast(readableTextOn(colour as string), colour as string)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Badge as a Radix trigger', () => {
  it('takes the trigger ref (no "Function components cannot be given refs" warning)', () => {
    const { Badge } = jest.requireActual('@/components/ui/badge');
    const { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } = jest.requireActual('@/components/ui/tooltip');
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><Badge>Strategy</Badge></TooltipTrigger>
          <TooltipContent>Explains the strategy</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(error.mock.calls.map(c => String(c[0])).filter(m => /cannot be given refs/.test(m))).toEqual([]);
    expect(screen.getByText('Strategy')).toBeInTheDocument();
  });
});

describe('toasts', () => {
  it('render as status regions (not list items), with a named close button', () => {
    const { Toast, ToastClose, ToastProvider, ToastTitle, ToastViewport } = jest.requireActual('@/components/ui/toast');
    render(
      <ToastProvider>
        <Toast open><ToastTitle>Preview generated</ToastTitle><ToastClose /></Toast>
        <ToastViewport />
      </ToastProvider>
    );
    const status = screen.getAllByRole('status').find(el => el.textContent?.includes('Preview generated'));
    expect(status).toBeDefined();
    expect(status!.tagName).toBe('DIV');
    expect(document.querySelector('ol, li')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close notification' })).toBeInTheDocument();
  });
});
