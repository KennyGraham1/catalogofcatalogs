/** @jest-environment node */

// Focal-mechanism selection and classification.
// #79: the event's preferredFocalMechanismID picks the mechanism, not array order.

import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import {
  parseFocalMechanism, formatFocalMechanism, selectPlane, computeBeachball, getFaultType,
  getMechanismFaultType, normalizeRake,
} from '@/lib/focal-mechanism-utils';

const origin =
  `<origin publicID="smi:a/origin/1"><time><value>2024-01-01T00:00:00Z</value></time>` +
  `<latitude><value>-41</value></latitude><longitude><value>174</value></longitude><depth><value>10000</value></depth></origin>`;
const mag = `<magnitude publicID="smi:a/mag/1"><mag><value>5.5</value></mag></magnitude>`;
const plane = (tag: string, s: number, d: number, r: number) =>
  `<${tag}><strike><value>${s}</value></strike><dip><value>${d}</value></dip><rake><value>${r}</value></rake></${tag}>`;
const mechanism = (id: string, s: number, d: number, r: number) =>
  `<focalMechanism publicID="smi:a/fm/${id}"><nodalPlanes>${plane('nodalPlane1', s, d, r)}</nodalPlanes></focalMechanism>`;
const eventXml = (preferred: string | null) =>
  `<event publicID="smi:a/event/1">${origin}${mag}${mechanism('first', 0, 45, 90)}${mechanism('preferred', 0, 90, 0)}` +
  `<preferredOriginID>smi:a/origin/1</preferredOriginID><preferredMagnitudeID>smi:a/mag/1</preferredMagnitudeID>` +
  (preferred ? `<preferredFocalMechanismID>${preferred}</preferredFocalMechanismID>` : '') +
  `</event>`;

describe('#79 the preferred focal mechanism is the one shown', () => {
  it('selects the mechanism named by preferred_focal_mechanism_id, not the first stored one', () => {
    const fields: any = quakemlEventToDbFields(parseQuakeMLEvent(eventXml('smi:a/fm/preferred'))!);
    // Stored in document order; the preference is carried separately.
    expect(JSON.parse(fields.focal_mechanisms).map((m: any) => m.publicID)).toEqual(['smi:a/fm/first', 'smi:a/fm/preferred']);
    const m = parseFocalMechanism(fields.focal_mechanisms, fields.preferred_focal_mechanism_id)!;
    expect(selectPlane(m)).toEqual({ strike: 0, dip: 90, rake: 0 });
    expect(formatFocalMechanism(m).faultType).toBe('Left-lateral strike-slip');
  });

  it('falls back to the first mechanism when no ID is stated or the ID is dangling', () => {
    const fields: any = quakemlEventToDbFields(parseQuakeMLEvent(eventXml(null))!);
    expect(selectPlane(parseFocalMechanism(fields.focal_mechanisms)!)).toEqual({ strike: 0, dip: 45, rake: 90 });
    expect(selectPlane(parseFocalMechanism(fields.focal_mechanisms, null)!)).toEqual({ strike: 0, dip: 45, rake: 90 });
    expect(selectPlane(parseFocalMechanism(fields.focal_mechanisms, 'smi:a/fm/missing')!)).toEqual({ strike: 0, dip: 45, rake: 90 });
  });

  it('matches by publicID in the simplified stored format as well', () => {
    const json = JSON.stringify([
      { publicID: 'x', nodalPlane1: { strike: 10, dip: 30, rake: 90 } },
      { publicID: 'y', nodalPlane1: { strike: 200, dip: 60, rake: -90 } },
    ]);
    expect(selectPlane(parseFocalMechanism(json, 'y')!)).toEqual({ strike: 200, dip: 60, rake: -90 });
  });
});

// #80: the faulting style is a property of the double couple, not of the plane listed first.
describe('#80 fault type is plane-independent and reads 0-360 rakes correctly', () => {
  const D = Math.PI / 180;
  // Auxiliary plane computed here, independently of the library: the normal and slip
  // vectors swap roles (N, E, Down), with the new normal turned to point upward.
  const auxiliary = (strike: number, dip: number, rake: number) => {
    const s = strike * D, d = dip * D, r = rake * D;
    let n = [Math.cos(r) * Math.cos(s) + Math.sin(r) * Math.cos(d) * Math.sin(s), Math.cos(r) * Math.sin(s) - Math.sin(r) * Math.cos(d) * Math.cos(s), -Math.sin(r) * Math.sin(d)];
    let u = [-Math.sin(d) * Math.sin(s), Math.sin(d) * Math.cos(s), -Math.cos(d)];
    if (n[2] > 0) { n = n.map((x) => -x); u = u.map((x) => -x); }
    const dip2 = Math.acos(-n[2]) / D;
    const strike2 = ((Math.atan2(-n[0], n[1]) / D) + 360) % 360;
    const rake2 = Math.atan2(-u[2] / Math.sin(dip2 * D), u[0] * Math.cos(strike2 * D) + u[1] * Math.sin(strike2 * D)) / D;
    return { strike: strike2, dip: dip2, rake: rake2 };
  };
  const one = (p: { strike: number; dip: number; rake: number }) => ({ nodalPlane1: p });
  // Unit moment tensor (Aki & Richards 1980, eq. 4.29; N, E, Down): equal tensors prove the
  // auxiliary plane above describes the same double couple.
  const tensor = ({ strike, dip, rake }: { strike: number; dip: number; rake: number }) => {
    const s = strike * D, d = dip * D, r = rake * D;
    return [
      -(Math.sin(d) * Math.cos(r) * Math.sin(2 * s) + Math.sin(2 * d) * Math.sin(r) * Math.sin(s) ** 2),
      Math.sin(d) * Math.cos(r) * Math.sin(2 * s) - Math.sin(2 * d) * Math.sin(r) * Math.cos(s) ** 2,
      Math.sin(2 * d) * Math.sin(r),
      Math.sin(d) * Math.cos(r) * Math.cos(2 * s) + 0.5 * Math.sin(2 * d) * Math.sin(r) * Math.sin(2 * s),
      -(Math.cos(d) * Math.cos(r) * Math.cos(s) + Math.cos(2 * d) * Math.sin(r) * Math.sin(s)),
      -(Math.cos(d) * Math.cos(r) * Math.sin(s) - Math.cos(2 * d) * Math.sin(r) * Math.cos(s)),
    ];
  };

  it('both nodal planes of one mechanism get the same fault type (seeded Monte Carlo)', () => {
    let seed = 20260925;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let i = 0; i < 2000; i++) {
      const plane = { strike: rnd() * 360, dip: 2 + rnd() * 86, rake: -180 + rnd() * 360 };
      const aux = auxiliary(plane.strike, plane.dip, plane.rake);
      const m1 = tensor(plane), m2 = tensor(aux);
      m1.forEach((v, k) => expect(m2[k]).toBeCloseTo(v, 9));
      if (i < 10) {
        // And the library draws the same P and T axes for both (full geometry is slow).
        const g1 = computeBeachball(one(plane))!, g2 = computeBeachball(one(aux))!;
        expect(g2.pAxis.plunge).toBeCloseTo(g1.pAxis.plunge, 6);
        expect(g2.tAxis.plunge).toBeCloseTo(g1.tAxis.plunge, 6);
      }
      expect(getMechanismFaultType(one(aux))!.type).toBe(getMechanismFaultType(one(plane))!.type);
    }
  });

  it('the reviewed mechanisms keep one style whichever plane is listed first', () => {
    const a = { strike: 30, dip: 70, rake: 140 };
    const b = auxiliary(30, 70, 140); // 136/53/25
    expect(formatFocalMechanism({ nodalPlane1: a, nodalPlane2: b }).faultType)
      .toBe(formatFocalMechanism({ nodalPlane1: b, nodalPlane2: a }).faultType);
    expect(getMechanismFaultType(one(a))!.type).toBe('oblique-reverse'); // P 10.7, T 42.0 (WSM TS)
    // 0/75/60: P 24, T 51, B 29 plunges - an oblique thrust, never strike-slip.
    for (const p of [{ strike: 0, dip: 75, rake: 60 }, auxiliary(0, 75, 60)]) {
      expect(getMechanismFaultType(one(p))!.type).toBe('oblique');
    }
    expect(getMechanismFaultType(one({ strike: 200, dip: 60, rake: -60 }))!.type).toBe('normal');
    expect(getMechanismFaultType(one(auxiliary(200, 60, -60)))!.type).toBe('normal');
  });

  it('pure mechanisms and their lateral sense are unchanged', () => {
    expect(getMechanismFaultType(one({ strike: 0, dip: 45, rake: 90 }))!.description).toBe('Reverse/Thrust fault');
    expect(getMechanismFaultType(one({ strike: 0, dip: 80, rake: 90 }))!.type).toBe('reverse'); // P plunge exactly 35
    expect(getMechanismFaultType(one({ strike: 0, dip: 45, rake: -90 }))!.description).toBe('Normal fault');
    expect(getMechanismFaultType(one({ strike: 0, dip: 90, rake: 0 }))!.description).toBe('Left-lateral strike-slip');
    expect(getMechanismFaultType(one({ strike: 90, dip: 90, rake: 180 }))!.description).toBe('Right-lateral strike-slip');
    expect(getMechanismFaultType({ nodalPlane1: { strike: 0, dip: null, rake: 0 } })).toBeNull();
  });

  it('a 0-360 rake is normalised before any rake-based text', () => {
    expect(getFaultType(270).type).toBe('normal');
    expect([normalizeRake(270), normalizeRake(-180), normalizeRake(180), normalizeRake(540), normalizeRake(-90)]).toEqual([-90, 180, 180, 180, -90]);
    expect(getFaultType(200).type).toBe('strike-slip'); // 200 = -160: right-lateral
    expect(getFaultType(200).description).toBe('Right-lateral strike-slip');
    expect(getFaultType(330).type).toBe('strike-slip'); // 330 = -30: left-lateral
    expect(getFaultType(330).description).toBe('Left-lateral strike-slip');
    expect(formatFocalMechanism(one({ strike: 0, dip: 45, rake: 270 })).faultType).toBe('Normal fault');
  });
});
