/**
 * Focal mechanism card.
 * #84: the unshaded quadrants hold the P axis, so the legend calls them dilatational (not
 * "tensional"), and both swatches use the colours the ball is actually drawn in.
 * #80: the fault-type badge does not change with plane order, and a 0-360 rake reads as the
 * slip it describes.
 */

import { render, screen, cleanup } from '@testing-library/react';
import { FocalMechanismCard } from '@/components/advanced-viz/FocalMechanismCard';

// jsdom serialises a style colour as rgb(); SVG fill attributes keep the hex string.
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('#84 beach-ball legend', () => {
  it('shaded = compressional (T), unshaded = dilatational (P), in the drawn colours', () => {
    const { container } = render(<FocalMechanismCard mechanism={{ nodalPlane1: { strike: 0, dip: 45, rake: 90 } }} />);
    expect(screen.queryByText(/tensional/i)).toBeNull();
    const svg = container.querySelector('svg[aria-label^="Focal mechanism beach ball"]')!;
    const disc = Array.from(svg.children).find((el) => el.tagName.toLowerCase() === 'circle')!;
    const shaded = svg.querySelector('g > path')!.getAttribute('fill')!; // the compressional region
    const unshaded = disc.getAttribute('fill')!;                          // the background disc
    const swatch = (label: string) => (screen.getByText(label).previousElementSibling as HTMLElement).style.backgroundColor;
    expect(swatch('Compressional (shaded, contains T)')).toBe(rgb(shaded));
    expect(swatch('Dilatational (unshaded, contains P)')).toBe(rgb(unshaded));
  });
});

describe('#80 card fault type', () => {
  afterEach(cleanup);
  const a = { strike: 30, dip: 70, rake: 140 };
  const b = { strike: 136.01, dip: 52.84, rake: 25.41 }; // auxiliary plane of a

  it('the badge is the same whichever nodal plane is listed first', () => {
    render(<FocalMechanismCard mechanism={{ nodalPlane1: a, nodalPlane2: b }} />);
    expect(screen.getByText('oblique-reverse')).toBeInTheDocument();
    cleanup();
    render(<FocalMechanismCard mechanism={{ nodalPlane1: b, nodalPlane2: a }} />);
    expect(screen.getByText('oblique-reverse')).toBeInTheDocument();
    expect(screen.queryByText('strike-slip')).toBeNull();
  });

  it('a 270 rake is shown as the normal fault it is', () => {
    render(<FocalMechanismCard mechanism={{ nodalPlane1: { strike: 0, dip: 45, rake: 270 } }} />);
    expect(screen.getByText('normal')).toBeInTheDocument();
    expect(screen.getByText(/Normal faulting with hanging wall moving down/)).toBeInTheDocument();
  });
});
