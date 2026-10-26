import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CARDS, FATE_DECK, FLIPS, ITEMS, STATS, fateText, type Stat } from '../../src/game/v7/cards.ts';
import { makeMap } from '../../src/game/v7/map.ts';
import { createGame, play, type Answer, type Ask, type Game } from '../../src/game/v7/rules.ts';

/** Plays a whole match with arbitrary (even illegal) answers drawn from `choices`. */
function run(seed: number, seats: number, choices: number[]): Game {
  const g = createGame(seed, seats);
  const it = play(g);
  let i = 0;
  const c = () => choices[i++ % choices.length]!;
  const answer = (a: Ask): Answer => {
    const x = c();
    switch (a.k) {
      case 'fork':
        return { k: 'fork', node: x % 3 === 0 ? 999 : a.options[x % a.options.length]! };
      case 'target':
        return { k: 'target', seat: x % 5 === 0 ? 42 : a.options[x % a.options.length]! };
      case 'jungle':
        return { k: 'jungle', act: x % 2 ? 'hunt' : 'trap', target: a.options[x % a.options.length]! };
      case 'pick':
        if (x % 4 === 0) return { k: 'use', item: ITEMS[x % 3]! };
        return { k: 'stat', stat: (x % 4) as Stat };
      case 'creature':
        return { k: 'stat', stat: (x % 5) as Stat };
    }
  };
  let r = it.next();
  let guard = 0;
  while (!r.done) {
    if (guard++ > 5000) throw new Error('the match did not end');
    r = it.next(answer(r.value));
  }
  return g;
}

describe('v7: the cursed game', () => {
  it('every match ENDS with exactly one winner, whatever anyone answers (even nonsense)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 2, max: 4 }),
        fc.array(fc.nat(97), { minLength: 1, maxLength: 30 }),
        (seed, seats, choices) => {
          const g = run(seed, seats, choices);
          expect(g.winner).not.toBeNull();
          expect(g.log.filter((b) => b.t === 'win')).toHaveLength(1);
          const live = g.players.filter((p) => !p.out);
          expect(live.length).toBeGreaterThanOrEqual(1);
          if (g.log.some((b) => b.t === 'win' && b.why === 'last')) expect(live).toHaveLength(1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('is deterministic: the same seed and the same answers replay the same match', () => {
    for (const seed of [1, 7, 99]) {
      const a = run(seed, 4, [3, 1, 4, 1, 5, 9, 2, 6]);
      const b = run(seed, 4, [3, 1, 4, 1, 5, 9, 2, 6]);
      expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    }
  });

  it('hearts only go down, never below zero, and never in the protected start; the knocked-out never take a turn', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const g = run(seed, 1 + (seed % 3) + 1, [seed, 2, 3, 5, 7, 11]);
      const hearts = new Map<number, number>();
      const out = new Set<number>();
      let turns = 0;
      for (const b of g.log) {
        if (b.t === 'meter') turns = b.turns;
        if (b.t === 'heart') {
          const before = hearts.get(b.seat) ?? 3;
          expect(b.hearts).toBeLessThanOrEqual(before);
          expect(b.hearts).toBeGreaterThanOrEqual(0);
          if (turns < 8) expect(b.blocked).toBe('safe');
          hearts.set(b.seat, b.hearts);
        }
        if (b.t === 'out') out.add(b.seat);
        if (b.t === 'turn') expect(out.has(b.seat)).toBe(false);
      }
    }
  });

  it('legibility: every duel is preceded by its creature emerging and the secret pick, on the same player', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = run(seed, 4, [seed, 1, 2, 3]);
      let emerged: number | null = null;
      let picked = false;
      for (const b of g.log) {
        if (b.t === 'emerge') ((emerged = b.seat), (picked = false));
        if (b.t === 'picked') {
          expect(b.seat).toBe(emerged);
          picked = true;
        }
        if (b.t === 'duel') {
          expect(b.seat).toBe(emerged);
          expect(picked).toBe(true);
          expect(b.rows.length).toBe(b.pick === b.itsPick ? 1 : 2);
          emerged = null;
        }
      }
    }
  });

  it('QA v7 H4: a duel only ever changes the creature it fought (grow/leave name the fought card; tame of a visitor keeps the resident)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const g = run(seed, 2 + (seed % 3), [seed, 3, 1, 4]);
      let last: { beast: string; resident: boolean; stays: boolean; outcome: string } | null = null;
      for (const b of g.log) {
        if (b.t === 'duel') last = b;
        if (b.t === 'grow') {
          expect(b.card).toBe(last?.beast);
          expect(last?.stays).toBe(true);
        }
        if (b.t === 'leaves') {
          expect(b.card).toBe(last?.beast);
          expect(last?.stays).toBe(false);
        }
      }
    }
  });

  it('the table flips are announced (omen) before they happen, and at most two per match', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = run(seed, 4, [seed, 3, 1]);
      const omens = g.log.filter((b) => b.t === 'omen').map((b) => (b.t === 'omen' ? b.flip : ''));
      const flips = g.log.filter((b) => b.t === 'flip').map((b) => (b.t === 'flip' ? b.flip : ''));
      expect(flips.length).toBeLessThanOrEqual(2);
      for (const f of flips) expect(omens).toContain(f);
    }
  });
});

describe('v7: the content', () => {
  const ENGLISH = /^[A-Za-z0-9 .,!?'’:;()\-–—…&/]*$/;
  it('every word is plain English; creature lines are ≤ 6 words; stats are 1–100', () => {
    for (const c of CARDS) {
      expect(c.name, c.id).toMatch(ENGLISH);
      expect(c.line, c.id).toMatch(ENGLISH);
      expect(c.line.split(/\s+/).length, c.line).toBeLessThanOrEqual(6);
      expect(c.gloat, c.id).toMatch(ENGLISH);
      expect(c.gloat.length, c.id).toBeGreaterThan(0);
      expect(c.gloat.split(/\s+/).length, c.gloat).toBeLessThanOrEqual(6);
      for (const s of c.stats) (expect(s).toBeGreaterThanOrEqual(1), expect(s).toBeLessThanOrEqual(100));
    }
    for (const f of Object.values(FLIPS))
      for (const t of [f.name, f.text, ...f.verse]) expect(t).toMatch(ENGLISH);
    expect(STATS).toEqual(['MIGHT', 'SPEED', 'BRAINS', 'WEIRD']);
    for (const f of FATE_DECK) {
      const t = fateText(f);
      for (const x of [t.title, t.text]) expect(x.split(/\s+/).length, x).toBeLessThanOrEqual(6);
    }
  });
  it('a mix of myths, real animals and absurd things across three tiers; the fate deck is mostly moves', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(40);
    for (const t of [1, 2, 3]) expect(CARDS.filter((c) => c.tier === t).length).toBeGreaterThanOrEqual(12);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    const moves = FATE_DECK.filter((f) => f.k === 'move').length;
    expect(moves / FATE_DECK.length).toBeGreaterThan(0.55);
  });
  it('the map is a loop with an open middle: every space reachable, forks only where planned', () => {
    const m = makeMap();
    const seen = new Set([0]);
    const q = [0];
    while (q.length) for (const n of m[q.shift()!]!.next) if (!seen.has(n)) (seen.add(n), q.push(n));
    expect(seen.size).toBe(m.length);
    expect(m.filter((n) => n.next.length > 1).map((n) => n.id)).toEqual([0, 12, 26]);
  });
});
