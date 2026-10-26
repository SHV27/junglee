/**
 * The cursed game's rules: a pure, deterministic generator. It yields an Ask whenever a player must decide and appends Beats
 * (what happened, in order) to `g.log`; the presenter plays each beat on screen, one at a time, before it shows the next ask.
 * Nothing happens that is not a beat, and every beat names its subject: that is the legibility law in code.
 */
import { next, seedRng, shuffle, type RngState } from '../../shared/rng.ts';
import {
  BARE_HANDS,
  CARD,
  CARDS,
  FATE_DECK,
  FLIPS,
  HEROES,
  ITEMS,
  POWERS,
  POWER_BONUS,
  type Card,
  type Fate,
  type FlipKind,
  type Hero,
  type Item,
  type Power,
  type Stat,
} from './cards.ts';
import { makeMap, type MapNode } from './map.ts';
import { TUNE } from './tune.ts';

export interface Beast {
  card: string;
  grow: number;
}
export interface Player {
  seat: number;
  hero: Hero;
  power: Power;
  hearts: number;
  deck: string[];
  items: Item[];
  node: number;
  out: boolean;
  tamed: number;
  /** How often this fallen player has picked for a creature (the job rotates). */
  creaturePicks: number;
}
export type DuelSource = 'lair' | 'trap' | 'unleash' | 'hunt' | 'storm' | 'wake';
export interface Duel {
  seat: number;
  node: number;
  beast: Beast;
  source: DuelSource;
  /** The player's card: the top of their deck ('hands' when the deck is empty). */
  card: string;
  peek: boolean;
  double: boolean;
  redrawn: boolean;
}
export type Outcome = 'win' | 'lose' | 'standoff';
export interface Row {
  stat: Stat;
  you: number;
  it: number;
  res: 'W' | 'L' | 'T';
}

/** What a space shows once seen (a snapshot taken when the beat happens, so the screen never shows the future). */
export interface Spot {
  id: number;
  seen: boolean;
  kind: MapNode['kind'];
  beast: Beast | null;
  item: Item | null;
}
export const spot = (n: MapNode): Spot => ({
  id: n.id,
  seen: n.seen,
  kind: n.kind,
  beast: n.beast ? { ...n.beast } : null,
  item: n.item,
});

export type Beat =
  | { t: 'start' }
  | { t: 'round'; round: number }
  | { t: 'meter'; turns: number; anger: number }
  | { t: 'turn'; seat: number }
  | { t: 'fate'; seat: number; fate: Fate; underdog: boolean }
  | { t: 'step'; seat: number; from: number; to: number }
  | { t: 'reveal'; nodes: Spot[] }
  | { t: 'land'; seat: number; node: number; what: 'empty' | 'item' | 'portal' | 'ownTrap' | 'friend' }
  | { t: 'item'; seat: number; item: Item; why: 'chest' | 'find' | 'tame' }
  | { t: 'portal'; seat: number; from: number; to: number }
  | { t: 'steal'; seat: number; from: number; card: string }
  | { t: 'trapSet'; seat: number; node: number }
  | { t: 'swap'; seat: number; with: number; a: number; b: number }
  | { t: 'unleash'; seat: number; target: number; node: number; card: string }
  | { t: 'hunt'; by: number; target: number; card: string; grow: number; path: number[]; spawned: boolean }
  | { t: 'emerge'; seat: number; node: number; card: string; grow: number; source: DuelSource; by: number }
  | { t: 'picked'; seat: number }
  | { t: 'creaturePicked'; seat: number }
  | {
      t: 'duel';
      seat: number;
      node: number;
      card: string;
      beast: string;
      grow: number;
      pick: Stat;
      itsPick: Stat;
      rows: Row[];
      outcome: Outcome;
      double: boolean;
      lucky: boolean;
      /** The fought creature was the one living on this space. */
      resident: boolean;
      /** After a loss or standoff, the fought creature now holds the space (else it leaves). */
      stays: boolean;
    }
  | { t: 'tamed'; seat: number; card: string }
  | { t: 'lostCard'; seat: number; card: string }
  | { t: 'grow'; node: number; card: string; grow: number }
  | { t: 'leaves'; node: number; card: string }
  | { t: 'heart'; seat: number; hearts: number; blocked: 'safe' | null }
  | { t: 'out'; seat: number }
  | { t: 'omen'; flip: FlipKind }
  | {
      t: 'flip';
      flip: FlipKind;
      moves: { seat: number; from: number; to: number }[];
      board: Spot[];
      /** Decks Swap: whose deck went to whom, and its best card (shown face-up). */
      passes: { from: number; to: number; best: string | null }[];
    }
  | { t: 'powers'; powers: Power[] }
  | { t: 'storm' }
  | { t: 'win'; seat: number; why: 'last' | 'time' };

export type Ask =
  | { k: 'fork'; seat: number; options: number[] }
  | { k: 'target'; seat: number; why: 'steal' | 'unleash' | 'swap'; options: number[] }
  | { k: 'pick'; seat: number; duel: Duel }
  | { k: 'jungle'; seat: number; options: number[] }
  | { k: 'creature'; seat: number; hero: number; beast: Beast; fallback: Stat };

export type Answer =
  | { k: 'fork'; node: number }
  | { k: 'target'; seat: number }
  | { k: 'use'; item: Item }
  | { k: 'stat'; stat: Stat }
  | { k: 'jungle'; act: 'hunt' | 'trap'; target: number };

export interface Game {
  rng: RngState;
  players: Player[];
  nodes: MapNode[];
  round: number;
  /** The Jungle Meter: turns played so far (one notch each). */
  turns: number;
  /** This table's meter: the storm notch and the two flip notches. */
  stormAt: number;
  flipAt: number[];
  fate: Fate[];
  flips: FlipKind[];
  omen: FlipKind | null;
  storm: boolean;
  log: Beat[];
  winner: number | null;
  /** Who is acting right now (for the presenter's camera). */
  active: number;
  /** The last friend a nasty card hit: nobody is dog-piled twice in a row (audience lane). */
  lastHit: number;
}

// ---------- randomness (all through g.rng: deterministic) ----------
function rand(g: Game): number {
  const [r, s] = next(g.rng);
  g.rng = s;
  return r;
}
function pickOne<T>(g: Game, xs: readonly T[]): T {
  return xs[Math.floor(rand(g) * xs.length)] as T;
}
function shuffled<T>(g: Game, xs: readonly T[]): T[] {
  const [out, s] = shuffle(xs, g.rng);
  g.rng = s;
  return out;
}

// ---------- reading the state ----------
const sum = (id: string) => cardOf(id).stats.reduce((a, b) => a + b, 0);
export const alive = (g: Game) => g.players.filter((p) => !p.out);
export const anger = (g: Game) => Math.min(TUNE.angerCap, Math.round(TUNE.angerStep * Math.min(g.turns, g.stormAt)));
export const cardOf = (id: string): Card => (id === 'hands' ? BARE_HANDS : (CARD[id] ?? BARE_HANDS));

/** A creature's stat as it fights right now: its card + its growth + the jungle's anger, capped at 100. */
export function beastStat(g: Game, b: Beast, s: Stat): number {
  return Math.min(100, cardOf(b.card).stats[s] + b.grow + anger(g));
}
/** Your card's stat in a duel: the card + your hero power's bonus (+ Double on your own pick). */
export function yourStat(p: Player, card: string, s: Stat, doubled: boolean): number {
  const bonus =
    (p.power === 'might' && s === 0) ||
    (p.power === 'speed' && s === 1) ||
    (p.power === 'brains' && s === 2) ||
    (p.power === 'weird' && s === 3)
      ? POWER_BONUS
      : 0;
  return (cardOf(card).stats[s] + bonus) * (doubled ? 2 : 1);
}

// ---------- setup ----------
export function createGame(seed: number, seats: number): Game {
  const g: Game = {
    rng: seedRng(seed),
    players: [],
    nodes: makeMap(),
    round: 1,
    turns: 0,
    stormAt: TUNE.stormAt,
    flipAt: [...TUNE.flipAt],
    fate: [],
    flips: [],
    omen: null,
    storm: false,
    log: [],
    winner: null,
    active: 0,
    lastHit: -1,
  };
  const heroes = shuffled(g, HEROES);
  const powers = shuffled(g, POWERS);
  const pool = shuffled(
    g,
    CARDS.filter((c) => c.tier < 3).map((c) => c.id),
  );
  const t1 = pool.filter((id) => cardOf(id).tier === 1);
  const t2 = pool.filter((id) => cardOf(id).tier === 2);
  const starts = startNodes(g.nodes, seats);
  for (let s = 0; s < seats; s++) {
    const deck = shuffled(g, [...t1.splice(0, 3), ...t2.splice(0, TUNE.startDeck - 3)]);
    g.players.push({
      seat: s,
      hero: heroes[s]!,
      power: powers[s]!,
      hearts: TUNE.hearts,
      deck,
      items: [],
      node: starts[s]!,
      out: false,
      tamed: 0,
      creaturePicks: 0,
    });
  }
  // Fill the board: lairs (a creature waits), chests, two portals (fixed by the map), the rest empty.
  const free = shuffled(
    g,
    g.nodes.filter((n) => n.kind === 'empty' && !starts.includes(n.id)).map((n) => n.id),
  );
  for (const id of free.splice(0, TUNE.lairs)) {
    const n = g.nodes[id]!;
    n.kind = 'lair';
    n.beast = { card: spawnCard(g, rand(g) < 0.6 ? 1 : 2), grow: 0 };
  }
  for (const id of free.splice(0, TUNE.items)) {
    const n = g.nodes[id]!;
    n.kind = 'item';
    n.item = pickOne(g, ITEMS);
  }
  g.stormAt = TUNE.stormBySeats[seats] ?? TUNE.stormAt;
  g.flipAt = [Math.round(g.stormAt * 0.35), Math.round(g.stormAt * 0.7)];
  // The Decks Swap (he named it) always comes, as the second flip; the first is the Shift or the Wake.
  g.flips = [pickOne(g, ['shift', 'wake'] as FlipKind[]), 'decks'];
  for (const p of g.players) reveal(g, p.node, false);
  return g;
}

function startNodes(nodes: readonly MapNode[], seats: number): number[] {
  const ring = nodes.filter((n) => n.ring).map((n) => n.id);
  const step = Math.floor(ring.length / seats);
  return Array.from({ length: seats }, (_, i) => ring[(i * step) % ring.length]!);
}

/** A creature card for the board: tier 1..3 preferred; the storm and the late game bring the monsters. */
function spawnCard(g: Game, tier: 1 | 2 | 3): string {
  // Never a creature that is already in someone's deck or on the board (a Lion fighting a Lion reads as a bug).
  const used = new Set<string>([...g.players.flatMap((p) => p.deck), ...g.nodes.flatMap((n) => [n.beast?.card, n.trap?.card])].filter((x): x is string => !!x));
  const ids = CARDS.filter((c) => c.tier === tier).map((c) => c.id);
  const fresh = ids.filter((id) => !used.has(id));
  return pickOne(g, fresh.length ? fresh : ids);
}
function spawnTier(g: Game): 1 | 2 | 3 {
  if (g.storm) return 3;
  const r = rand(g);
  if (g.round <= 2) return r < 0.7 ? 1 : 2;
  if (g.round <= 5) return r < 0.25 ? 1 : r < 0.8 ? 2 : 3;
  return r < 0.5 ? 2 : 3;
}

/** Fog of war: the space you stand on and the spaces one step ahead are seen. */
function reveal(g: Game, at: number, emit = true): void {
  const n = g.nodes[at]!;
  const fresh: Spot[] = [];
  // At a fork both ways stay fogged (owner: "fork info: nothing"); on a plain path you see one step ahead.
  for (const id of n.next.length > 1 ? [at] : [at, ...n.next]) {
    const m = g.nodes[id]!;
    if (!m.seen) {
      m.seen = true;
      fresh.push(spot(m));
    }
  }
  if (emit && fresh.length) g.log.push({ t: 'reveal', nodes: fresh });
}

// ---------- the game ----------
export function* play(g: Game): Generator<Ask, void, Answer> {
  g.log.push({ t: 'start' });
  g.log.push({ t: 'round', round: g.round });
  while (g.winner === null) {
    for (const p of g.players) {
      if (p.out || g.winner !== null) continue;
      g.active = p.seat;
      yield* turn(g, p);
      checkWin(g);
      if (g.winner === null) yield* tick(g);
    }
    if (g.winner !== null) break;
    for (const p of g.players) {
      if (!p.out || g.winner !== null || alive(g).length < 2) continue;
      g.active = p.seat;
      yield* jungleTurn(g, p);
      checkWin(g);
    }
    if (g.winner !== null) break;
    yield* endRound(g);
  }
}

function checkWin(g: Game): void {
  if (g.winner !== null) return;
  const live = alive(g);
  if (live.length === 1) {
    g.winner = live[0]!.seat;
    g.log.push({ t: 'win', seat: g.winner, why: 'last' });
  }
}

const CHAOS: readonly Fate[] = [{ k: 'portal' }, { k: 'swap' }, { k: 'steal' }, { k: 'unleash' }];

function drawFate(g: Game): Fate {
  if (!g.fate.length) g.fate = shuffled(g, FATE_DECK);
  return g.fate.pop()!;
}

function* turn(g: Game, p: Player): Generator<Ask, void, Answer> {
  g.log.push({ t: 'turn', seat: p.seat });
  // Underdog luck (owner #22 "lucky big swings"): the player alone in last place sometimes draws from the chaos cards.
  const live = alive(g);
  const low = Math.min(...live.map((o) => o.hearts));
  const underdog =
    live.length > 2 &&
    p.hearts === low &&
    live.filter((o) => o.hearts === low).length === 1 &&
    rand(g) < TUNE.underdog;
  const f: Fate = underdog ? pickOne(g, CHAOS) : drawFate(g);
  g.log.push({ t: 'fate', seat: p.seat, fate: f, underdog });
  const others = () => {
    const xs = alive(g).filter((o) => o.seat !== p.seat);
    const fresh = xs.filter((o) => o.seat !== g.lastHit);
    return fresh.length ? fresh : xs;
  };
  switch (f.k) {
    case 'move':
      yield* walk(g, p, f.n);
      return yield* land(g, p);
    case 'find': {
      gainItem(g, p, 'find');
      yield* walk(g, p, 1);
      return yield* land(g, p);
    }
    case 'portal': {
      const fog = g.nodes.filter((n) => !n.seen && !g.players.some((o) => !o.out && o.node === n.id));
      const to = fog.length ? pickOne(g, fog).id : pickOne(g, g.nodes).id;
      g.log.push({ t: 'portal', seat: p.seat, from: p.node, to });
      p.node = to;
      reveal(g, to);
      return yield* land(g, p);
    }
    case 'steal': {
      const opts = others()
        .filter((o) => o.deck.length > 0)
        .map((o) => o.seat);
      if (opts.length) {
        const a = yield { k: 'target', seat: p.seat, why: 'steal', options: opts };
        const from = g.players[a.k === 'target' && opts.includes(a.seat) ? a.seat : opts[0]!]!;
        g.lastHit = from.seat;
        const card = from.deck.shift()!;
        p.deck.push(card);
        g.log.push({ t: 'steal', seat: p.seat, from: from.seat, card });
      }
      yield* walk(g, p, 2);
      return yield* land(g, p);
    }
    case 'trap': {
      const n = g.nodes[p.node]!;
      n.trap = { card: spawnCard(g, Math.min(3, spawnTier(g) + 1) as 1 | 2 | 3), by: p.seat };
      g.log.push({ t: 'trapSet', seat: p.seat, node: n.id });
      yield* walk(g, p, 3);
      return yield* land(g, p);
    }
    case 'swap': {
      const opts = others().map((o) => o.seat);
      if (!opts.length) return;
      const a = yield { k: 'target', seat: p.seat, why: 'swap', options: opts };
      const o = g.players[a.k === 'target' && opts.includes(a.seat) ? a.seat : opts[0]!]!;
      g.log.push({ t: 'swap', seat: p.seat, with: o.seat, a: p.node, b: o.node });
      [p.node, o.node] = [o.node, p.node];
      reveal(g, p.node);
      return yield* land(g, p);
    }
    case 'unleash': {
      const opts = others().map((o) => o.seat);
      if (!opts.length) return;
      const a = yield { k: 'target', seat: p.seat, why: 'unleash', options: opts };
      const o = g.players[a.k === 'target' && opts.includes(a.seat) ? a.seat : opts[0]!]!;
      g.lastHit = o.seat;
      const beast: Beast = { card: spawnCard(g, spawnTier(g)), grow: 0 };
      g.log.push({ t: 'unleash', seat: p.seat, target: o.seat, node: o.node, card: beast.card });
      g.active = o.seat;
      yield* duel(g, o, beast, 'unleash', p.seat);
      g.active = p.seat;
      return;
    }
  }
}

function* walk(g: Game, p: Player, steps: number): Generator<Ask, void, Answer> {
  for (let i = 0; i < steps; i++) {
    const here = g.nodes[p.node]!;
    let to = here.next[0]!;
    if (here.next.length > 1) {
      const a = yield { k: 'fork', seat: p.seat, options: [...here.next] };
      to = a.k === 'fork' && here.next.includes(a.node) ? a.node : to;
    }
    g.log.push({ t: 'step', seat: p.seat, from: p.node, to });
    p.node = to;
    reveal(g, to);
  }
}

function* land(g: Game, p: Player): Generator<Ask, void, Answer> {
  const n = g.nodes[p.node]!;
  if (n.trap && n.trap.by !== p.seat) {
    const beast: Beast = { card: n.trap.card, grow: 0 };
    const by = n.trap.by;
    n.trap = null;
    return yield* duel(g, p, beast, 'trap', by);
  }
  if (n.beast) return yield* duel(g, p, n.beast, n.kind === 'lair' ? 'lair' : 'hunt');
  if (g.storm) {
    n.beast = { card: spawnCard(g, 3), grow: 0 };
    return yield* duel(g, p, n.beast, 'storm');
  }
  if (n.trap && n.trap.by === p.seat) {
    g.log.push({ t: 'land', seat: p.seat, node: n.id, what: 'ownTrap' });
    return;
  }
  if (n.kind === 'item' && n.item) {
    g.log.push({ t: 'land', seat: p.seat, node: n.id, what: 'item' });
    gainItem(g, p, 'chest', n.item);
    n.item = null;
    n.kind = 'empty';
    return;
  }
  if (n.kind === 'portal' && n.pair !== null) {
    g.log.push({ t: 'land', seat: p.seat, node: n.id, what: 'portal' });
    g.log.push({ t: 'portal', seat: p.seat, from: n.id, to: n.pair });
    p.node = n.pair;
    reveal(g, p.node);
    const m = g.nodes[p.node]!;
    if (m.beast) return yield* duel(g, p, m.beast, 'lair');
    return;
  }
  const friend = g.players.some((o) => !o.out && o.seat !== p.seat && o.node === n.id);
  g.log.push({ t: 'land', seat: p.seat, node: n.id, what: friend ? 'friend' : 'empty' });
}

function gainItem(g: Game, p: Player, why: 'chest' | 'find' | 'tame', item?: Item): void {
  if (p.items.length >= TUNE.maxItems) return;
  const it = item ?? pickOne(g, ITEMS);
  p.items.push(it);
  g.log.push({ t: 'item', seat: p.seat, item: it, why });
}

/** The heart of the game: a Top Trumps duel. Your blind top card, a secret stat pick, the creature's pick, two rows compared. */
function* duel(g: Game, p: Player, beast: Beast, source: DuelSource, by = -1): Generator<Ask, void, Answer> {
  const d: Duel = {
    seat: p.seat,
    node: p.node,
    beast,
    source,
    card: p.deck[0] ?? 'hands',
    peek: false,
    double: false,
    redrawn: false,
  };
  g.log.push({ t: 'emerge', seat: p.seat, node: p.node, card: beast.card, grow: beast.grow, source, by });
  let pick: Stat | null = null;
  for (let asks = 0; pick === null; asks++) {
    // Never stuck: after a handful of answers that are not a stat, the card's biggest stat is played (as the timer would).
    if (asks > 6) {
      const mine = [0, 1, 2, 3].map((s) => yourStat(p, d.card, s as Stat, false));
      pick = mine.indexOf(Math.max(...mine)) as Stat;
      break;
    }
    const a = yield { k: 'pick', seat: p.seat, duel: { ...d } };
    if (a.k === 'stat') pick = a.stat;
    else if (a.k === 'use') {
      const i = p.items.indexOf(a.item);
      if (i < 0) continue;
      if (a.item === 'peek' && !d.peek) d.peek = true;
      else if (a.item === 'double' && !d.double) d.double = true;
      else if (a.item === 'redraw' && !d.redrawn && p.deck.length > 1) {
        d.redrawn = true;
        p.deck.push(p.deck.shift()!);
        d.card = p.deck[0]!;
      } else continue;
      p.items.splice(i, 1);
    }
  }
  g.log.push({ t: 'picked', seat: p.seat });
  // The creature picks: usually its best stat, sometimes another (guessable, never certain).
  const its = [0, 1, 2, 3].map((s) => beastStat(g, beast, s as Stat));
  // Honest tells (Chief v7): it picks its signature (best) stat, else its SECOND best — never its weakest.
  const order = ([0, 1, 2, 3] as Stat[]).sort((a, b) => its[b]! - its[a]! || a - b);
  let itsPick: Stat = rand(g) < TUNE.creatureBest ? order[0]! : order[1]!;
  // Once someone is out, a fallen player secretly picks for the creature (owner: "the computer, while all are alive").
  const fallen = g.players.filter((o) => o.out);
  if (fallen.length) {
    const picker = fallen.reduce((a, b) => (b.creaturePicks < a.creaturePicks ? b : a));
    picker.creaturePicks++;
    const a = yield { k: 'creature', seat: picker.seat, hero: p.seat, beast: { ...beast }, fallback: itsPick };
    if (a.k === 'stat' && a.stat >= 0 && a.stat <= 3) itsPick = a.stat;
    g.log.push({ t: 'creaturePicked', seat: picker.seat });
  }
  const stats: Stat[] = pick === itsPick ? [pick] : [pick, itsPick];
  const rows: Row[] = stats.map((s) => {
    const you = yourStat(p, d.card, s, d.double && s === pick);
    const it = beastStat(g, beast, s);
    return { stat: s, you, it, res: you > it ? 'W' : you < it ? 'L' : 'T' };
  });
  const w = rows.filter((r) => r.res === 'W').length;
  const l = rows.filter((r) => r.res === 'L').length;
  let outcome: Outcome = w > l ? 'win' : l > w ? 'lose' : 'standoff';
  // In the final storm only a win saves you: a standoff hurts like a loss.
  if (outcome === 'standoff' && g.storm && p.power !== 'lucky') outcome = 'lose';
  const lucky = outcome === 'standoff' && p.power === 'lucky';
  if (lucky) outcome = 'win';
  // QA v7 H4: a creature fought on a space that already holds ANOTHER creature (an unleashed beast, a sprung trap) never takes
  // that space: it stays only on an empty space, else it slinks back into the jungle. The resident is never touched by it.
  const here = g.nodes[p.node]!;
  const resident = here.beast === beast;
  const stays = outcome !== 'win' && (resident || !here.beast);
  g.log.push({
    t: 'duel',
    seat: p.seat,
    node: p.node,
    card: d.card,
    beast: beast.card,
    grow: beast.grow,
    pick,
    itsPick,
    rows,
    outcome,
    double: d.double,
    lucky,
    resident,
    stays,
  });
  const n = g.nodes[p.node]!;
  if (outcome === 'win') {
    if (d.card !== 'hands') p.deck.push(p.deck.shift()!);
    p.deck.push(beast.card);
    p.tamed++;
    g.log.push({ t: 'tamed', seat: p.seat, card: beast.card });
    if (resident) {
      n.beast = null;
      if (n.kind === 'lair') n.kind = 'empty';
    }
    gainItem(g, p, 'tame');
  } else if (outcome === 'lose') {
    if (d.card !== 'hands') {
      p.deck.shift();
      g.log.push({ t: 'lostCard', seat: p.seat, card: d.card });
    }
    if (stays) n.beast = beast;
    else g.log.push({ t: 'leaves', node: n.id, card: beast.card });
    hurt(g, p);
  } else {
    if (d.card !== 'hands') p.deck.push(p.deck.shift()!);
    if (stays) {
      n.beast = beast;
      beast.grow += TUNE.grow;
      g.log.push({ t: 'grow', node: n.id, card: beast.card, grow: beast.grow });
    } else g.log.push({ t: 'leaves', node: n.id, card: beast.card });
  }
}

function hurt(g: Game, p: Player): void {
  if (g.turns < TUNE.protect) {
    g.log.push({ t: 'heart', seat: p.seat, hearts: p.hearts, blocked: 'safe' });
    return;
  }
  p.hearts--;
  g.log.push({ t: 'heart', seat: p.seat, hearts: p.hearts, blocked: null });
  if (p.hearts <= 0) {
    p.out = true;
    p.items = [];
    g.log.push({ t: 'out', seat: p.seat });
  }
}

// ---------- the jungle (knocked-out players, owner #32/#52) ----------
function* jungleTurn(g: Game, p: Player): Generator<Ask, void, Answer> {
  const opts = alive(g).map((o) => o.seat);
  const a = yield { k: 'jungle', seat: p.seat, options: opts };
  const target = g.players[a.k === 'jungle' && opts.includes(a.target) ? a.target : opts[0]!]!;
  if (a.k === 'jungle' && a.act === 'trap') {
    // Two steps ahead of the target on their path: they will likely walk into it.
    let at = target.node;
    for (let i = 0; i < 2; i++) at = g.nodes[at]!.next[0]!;
    g.nodes[at]!.trap = { card: spawnCard(g, Math.min(3, spawnTier(g) + 1) as 1 | 2 | 3), by: p.seat };
    g.log.push({ t: 'trapSet', seat: p.seat, node: at });
    return;
  }
  yield* hunt(g, p.seat, target, TUNE.hunt);
}

/** The nearest creature walks toward the target; reaching them starts a duel. */
function* hunt(g: Game, by: number, target: Player, steps: number): Generator<Ask, void, Answer> {
  let from = nearestBeast(g, target.node);
  const spawned = from === null;
  if (from === null) {
    const fog = g.nodes.filter((n) => !n.beast && !g.players.some((o) => !o.out && o.node === n.id));
    const n = pickOne(g, fog.length ? fog : g.nodes);
    n.beast = { card: spawnCard(g, spawnTier(g)), grow: 0 };
    from = n.id;
  }
  const path = route(g, from, target.node).slice(0, steps + 1);
  const src = g.nodes[from]!;
  const beast = src.beast!;
  src.beast = null;
  if (src.kind === 'lair') src.kind = 'empty';
  const end = path[path.length - 1]!;
  g.log.push({ t: 'hunt', by, target: target.seat, card: beast.card, grow: beast.grow, path, spawned });
  const dst = g.nodes[end]!;
  for (const id of path) g.nodes[id]!.seen = true;
  if (end === target.node) {
    g.active = target.seat;
    yield* duel(g, target, beast, 'hunt', by);
  } else if (!dst.beast) dst.beast = beast;
  else dst.beast.grow += TUNE.grow;
}

/** Undirected shortest path (BFS) over the map. */
function route(g: Game, a: number, b: number): number[] {
  const prev = new Map<number, number>([[a, -1]]);
  const q = [a];
  while (q.length) {
    const x = q.shift()!;
    if (x === b) break;
    for (const y of g.nodes[x]!.adj) {
      if (prev.has(y)) continue;
      prev.set(y, x);
      q.push(y);
    }
  }
  const out: number[] = [];
  for (let x = b; x !== -1; x = prev.get(x) ?? -1) out.unshift(x);
  return out[0] === a ? out : [a];
}

function nearestBeast(g: Game, at: number): number | null {
  let best: number | null = null;
  let dist = Infinity;
  for (const n of g.nodes) {
    if (!n.beast) continue;
    const d = route(g, n.id, at).length;
    if (d < dist) {
      dist = d;
      best = n.id;
    }
  }
  return best;
}

// ---------- the end of a round: flips, anger, the storm ----------
function* endRound(g: Game): Generator<Ask, void, Answer> {
  g.round++;
  g.log.push({ t: 'round', round: g.round });
}

/** One notch on the Jungle Meter after every turn: the omen, the flips and the storm all hang off it, in plain sight. */
function* tick(g: Game): Generator<Ask, void, Answer> {
  g.turns++;
  g.log.push({ t: 'meter', turns: g.turns, anger: anger(g) });
  const fi = g.flipAt.indexOf(g.turns);
  if (fi >= 0 && g.flips[fi]) {
    yield* flip(g, g.flips[fi]!);
    g.omen = null;
    checkWin(g);
    if (g.winner !== null) return;
  }
  const oi = g.flipAt.indexOf(g.turns + TUNE.omenAhead);
  if (oi >= 0 && g.flips[oi]) {
    g.omen = g.flips[oi]!;
    g.log.push({ t: 'omen', flip: g.omen });
  }
  if (g.turns === g.stormAt) {
    g.storm = true;
    g.log.push({ t: 'storm' });
  }
  if (g.turns >= TUNE.maxTurns && g.winner === null) {
    const best = alive(g).sort((a, b) => b.hearts - a.hearts || b.deck.length - a.deck.length)[0]!;
    g.winner = best.seat;
    g.log.push({ t: 'win', seat: best.seat, why: 'time' });
  }
}

function* flip(g: Game, kind: FlipKind): Generator<Ask, void, Answer> {
  const live = alive(g);
  const moves: { seat: number; from: number; to: number }[] = [];
  const passes: { from: number; to: number; best: string | null }[] = [];
  if (kind === 'shift') {
    for (const n of g.nodes) n.seen = false;
    const beasts = g.nodes.filter((n) => n.beast).map((n) => n.beast!);
    for (const n of g.nodes) n.beast = null;
    const spots = shuffled(
      g,
      g.nodes.map((n) => n.id),
    );
    for (const p of live) {
      const to = spots.pop()!;
      moves.push({ seat: p.seat, from: p.node, to });
      p.node = to;
    }
    for (const b of beasts) {
      const to = spots.pop();
      if (to !== undefined) g.nodes[to]!.beast = b;
    }
  } else if (kind === 'decks') {
    const decks = live.map((p) => p.deck);
    live.forEach((p, i) => {
      const from = live[(i + live.length - 1) % live.length]!;
      const deck = decks[(i + decks.length - 1) % decks.length]!;
      const best = deck.length ? deck.reduce((a, b) => (sum(b) > sum(a) ? b : a)) : null;
      passes.push({ from: from.seat, to: p.seat, best });
      p.deck = deck;
    });
  }
  for (const p of live) {
    const n = g.nodes[p.node]!;
    for (const id of n.next.length > 1 ? [p.node] : [p.node, ...n.next]) g.nodes[id]!.seen = true;
  }
  if (kind === 'wake') for (const n of g.nodes) if (n.beast) n.seen = true;
  g.log.push({ t: 'flip', flip: kind, moves, board: g.nodes.map(spot), passes });
  // Every flip re-deals the hero powers (owner #51).
  const powers = shuffled(g, POWERS);
  g.players.forEach((p, i) => {
    p.power = powers[i % powers.length]!;
  });
  g.log.push({ t: 'powers', powers: g.players.map((p) => p.power) });
  if (kind === 'wake') {
    for (const p of live) {
      if (p.out) continue;
      g.active = p.seat;
      yield* hunt(g, -1, p, 2);
      if (alive(g).length < 2) return;
    }
  }
}
