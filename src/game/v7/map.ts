/**
 * The cursed board: a loop AND an open map (owner #25). A ring of 24 spaces around the jungle, with two paths that cut in to
 * the Heart of the jungle and two that lead back out. Forks: the ring's west and east gates, and the Heart itself.
 * Coordinates are in board units (the 2D view maps them to the painted map); y grows downward.
 */
import type { Item } from './cards.ts';

export interface MapNode {
  id: number;
  x: number;
  y: number;
  ring: boolean;
  /** Where you may step next (the direction of travel). */
  next: number[];
  /** Neighbours both ways (creatures hunt along these). */
  adj: number[];
  kind: 'empty' | 'lair' | 'item' | 'portal';
  /** A portal's twin. */
  pair: number | null;
  beast: { card: string; grow: number } | null;
  trap: { card: string; by: number } | null;
  item: Item | null;
  seen: boolean;
}

export const RING = 24;
export const HEART = 26;
/** Board size in units. */
export const BOARD_W = 1600;
export const BOARD_H = 1000;

export function makeMap(): MapNode[] {
  const cx = BOARD_W / 2;
  const cy = BOARD_H / 2;
  const nodes: MapNode[] = [];
  const add = (x: number, y: number, ring: boolean): MapNode => {
    const n: MapNode = {
      id: nodes.length,
      x: Math.round(x),
      y: Math.round(y),
      ring,
      next: [],
      adj: [],
      kind: 'empty',
      pair: null,
      beast: null,
      trap: null,
      item: null,
      seen: false,
    };
    nodes.push(n);
    return n;
  };
  // The ring: an organic oval, clockwise from the west gate.
  for (let k = 0; k < RING; k++) {
    const a = Math.PI + (k / RING) * Math.PI * 2;
    const wob = 1 + 0.06 * Math.sin(a * 3 + 0.7) + 0.035 * Math.cos(a * 5);
    add(cx + Math.cos(a) * 640 * wob, cy + Math.sin(a) * 390 * wob, true);
  }
  const lerp = (from: MapNode, k: number, bend: number) => {
    const x = from.x + (cx - from.x) * k;
    const y = from.y + (cy - from.y) * k;
    return add(x + bend * (cy - from.y) * 0.08, y + bend * (from.x - cx) * 0.08, false);
  };
  const r = (i: number) => nodes[i]!;
  // In-paths from the west gate (0) and the east gate (12) to the Heart (26).
  const w1 = lerp(r(0), 0.34, 1); // 24
  const w2 = lerp(r(0), 0.67, -1); // 25
  const heart = add(cx, cy, false); // 26
  const e1 = lerp(r(12), 0.34, 1); // 27
  const e2 = lerp(r(12), 0.67, -1); // 28
  // Out-paths from the Heart to the north (6) and the south (18).
  const n1 = lerp(r(6), 0.67, 1); // 29
  const n2 = lerp(r(6), 0.34, -1); // 30
  const s1 = lerp(r(18), 0.67, 1); // 31
  const s2 = lerp(r(18), 0.34, -1); // 32
  const link = (a: MapNode, b: MapNode) => {
    a.next.push(b.id);
    if (!a.adj.includes(b.id)) a.adj.push(b.id);
    if (!b.adj.includes(a.id)) b.adj.push(a.id);
  };
  for (let k = 0; k < RING; k++) link(r(k), r((k + 1) % RING));
  link(r(0), w1);
  link(w1, w2);
  link(w2, heart);
  link(r(12), e1);
  link(e1, e2);
  link(e2, heart);
  link(heart, n1);
  link(n1, n2);
  link(n2, r(6));
  link(heart, s1);
  link(s1, s2);
  link(s2, r(18));
  // Two portals, twinned, on opposite sides of the ring.
  r(9).kind = 'portal';
  r(21).kind = 'portal';
  r(9).pair = 21;
  r(21).pair = 9;
  return nodes;
}
