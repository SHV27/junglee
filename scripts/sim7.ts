/**
 * The v7 sim gate (GDD-v7 §2): plays whole matches with scripted hands and reports pace, drama and the luck/skill split.
 *   node scripts/sim7.ts [matches=2000] [seats=4]
 * Hands: SMART reads the creature (guesses its best stat from what it is), uses items well; FOOL picks at random.
 */
import {
  cardOf,
  beastStat,
  createGame,
  play,
  yourStat,
  type Answer,
  type Ask,
  type Game,
} from '../src/game/v7/rules.ts';
import type { Stat } from '../src/game/v7/cards.ts';
import { TUNE } from '../src/game/v7/tune.ts';

const N = Number(process.argv[2] ?? 2000);
const SEATS = Number(process.argv[3] ?? 4);

type Hand = 'smart' | 'fool';
/** FOOL=naive (default): picks its own card's biggest number, ignores the creature. FOOL=random: clicks anything. */
const FOOL = process.env.FOOL ?? 'naive';
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('T_')) (TUNE as Record<string, unknown>)[k.slice(2)] = JSON.parse(v!);
let r = 12345;
const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff), r / 0x7fffffff);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;

function answer(g: Game, a: Ask, hand: Hand): Answer {
  switch (a.k) {
    case 'fork':
      return { k: 'fork', node: pick(a.options) };
    case 'target': {
      // Smart hits the leader (most hearts, then the biggest deck); fools pick anyone.
      const by = [...a.options].sort((x, y) => {
        const p = g.players[x]!;
        const q = g.players[y]!;
        return q.hearts - p.hearts || q.deck.length - p.deck.length;
      });
      return { k: 'target', seat: hand === 'smart' ? by[0]! : pick(a.options) };
    }
    case 'jungle': {
      const by = [...a.options].sort((x, y) => g.players[y]!.hearts - g.players[x]!.hearts);
      return {
        k: 'jungle',
        act: rnd() < 0.5 ? 'hunt' : 'trap',
        target: hand === 'smart' ? by[0]! : pick(a.options),
      };
    }
    case 'creature': {
      // The fallen read the creature like anyone: its best stat, sometimes its second.
      const its = [0, 1, 2, 3].map((s) => beastStat(g, a.beast, s as Stat));
      const order = [0, 1, 2, 3].sort((x, y) => its[y]! - its[x]!);
      return { k: 'stat', stat: (hand === 'fool' ? Math.floor(rnd() * 4) : rnd() < 0.6 ? order[0] : order[1]) as Stat };
    }
    case 'pick': {
      const p = g.players[a.seat]!;
      const d = a.duel;
      if (hand === 'fool') {
        if (p.items.length && rnd() < 0.3) return { k: 'use', item: pick(p.items) };
        if (FOOL === 'random') return { k: 'stat', stat: Math.floor(rnd() * 4) as Stat };
        const mine = [0, 1, 2, 3].map((s) => yourStat(p, d.card, s as Stat, false));
        return { k: 'stat', stat: mine.indexOf(Math.max(...mine)) as Stat };
      }
      // Smart: knows roughly what a creature is good at (its true card ± noise unless it peeked).
      const noise = d.peek ? 0 : 18;
      const est = [0, 1, 2, 3].map((s) => beastStat(g, d.beast, s as Stat) + (rnd() - 0.5) * noise);
      const itsBest = est.indexOf(Math.max(...est)) as Stat;
      if (!d.peek && p.items.includes('peek')) return { k: 'use', item: 'peek' };
      const mine = (s: Stat, dbl: boolean) => yourStat(p, d.card, s, dbl);
      const score = (s: Stat, dbl: boolean) => {
        // Expected result: with prob ~0.7 the creature picks its best.
        const row = (t: Stat, dd: boolean) => Math.sign(mine(t, dd && t === s) - est[t]!);
        const same = row(s, dbl);
        const other = row(s, dbl) + row(itsBest, dbl);
        return TUNE.creatureBest * (s === itsBest ? same * 2 : other) + (1 - TUNE.creatureBest) * same;
      };
      const stats = [0, 1, 2, 3] as Stat[];
      const best = stats.reduce((x, y) => (score(y, d.double) > score(x, d.double) ? y : x));
      if (score(best, d.double) < 0 && !d.redrawn && p.items.includes('redraw') && p.deck.length > 1)
        return { k: 'use', item: 'redraw' };
      if (!d.double && p.items.includes('double') && score(best, true) > score(best, false))
        return { k: 'use', item: 'double' };
      return { k: 'stat', stat: best };
    }
  }
}

interface Stats {
  rounds: number[];
  turns: number[];
  secs: number[];
  duels: number;
  outcomes: Record<string, number>;
  firstKO: number[];
  wins: Record<Hand, number>;
  seatsBy: Record<Hand, number>;
  flips: number;
  timeouts: number;
  closeEnd: number;
  quiet: number;
  allTurns: number;
}
const S: Stats = {
  rounds: [],
  turns: [],
  secs: [],
  duels: 0,
  outcomes: { win: 0, lose: 0, standoff: 0 },
  firstKO: [],
  wins: { smart: 0, fool: 0 },
  seatsBy: { smart: 0, fool: 0 },
  flips: 0,
  timeouts: 0,
  closeEnd: 0,
  quiet: 0,
  allTurns: 0,
};

const MODE = process.env.MODE ?? 'mixed';
const storm = { plain: { n: 0, w: 0 }, dbl: { n: 0, w: 0 } };
for (let m = 0; m < N; m++) {
  const g = createGame(m + 1, SEATS);
  const hands: Hand[] = g.players.map((_, i) =>
    MODE === 'smart' ? 'smart' : MODE === 'fool' ? 'fool' : i === m % SEATS ? 'fool' : 'smart',
  );
  for (const h of hands) S.seatsBy[h]++;
  const it = play(g);
  let res = it.next();
  let guard = 0;
  while (!res.done && guard++ < 20000) res = it.next(answer(g, res.value, hands[res.value.seat]!));
  // Pace estimate (seconds, at 1×): every beat's hold as the presenter plays it, plus thinking time.
  let secs = 0;
  let turns = 0;
  let koRound = 0;
  let turnHadAction = false;
  let rnow = 1;
  let stormNow = false;
  for (const b of g.log) {
    if (b.t === 'round') rnow = b.round;
    if (b.t === 'storm') stormNow = true;
    if (b.t === 'turn') {
      if (turns && !turnHadAction) S.quiet++;
      turns++;
      turnHadAction = false;
      secs += 2.5 + 3;
    } else if (b.t === 'step') secs += 0.35;
    else if (b.t === 'emerge') ((secs += 3.5), (turnHadAction = true));
    else if (b.t === 'picked') secs += 9;
    else if (b.t === 'duel') {
      secs += 7;
      S.duels++;
      S.outcomes[b.outcome]!++;
      if (stormNow) {
        const k = b.double ? 'dbl' : 'plain';
        storm[k].n++;
        if (b.outcome === 'win') storm[k].w++;
      }
    } else if (b.t === 'land') secs += b.what === 'empty' ? 1.5 : 2.5;
    else if (b.t === 'item' || b.t === 'steal' || b.t === 'swap' || b.t === 'portal' || b.t === 'trapSet') {
      secs += 2.5;
      turnHadAction = true;
    } else if (b.t === 'hunt') secs += 6;
    else if (b.t === 'flip') ((secs += 12), S.flips++);
    else if (b.t === 'round') secs += 2;
    else if (b.t === 'out' && !koRound) koRound = rnow;
  }
  S.allTurns += turns;
  S.rounds.push(g.round);
  S.turns.push(turns);
  S.secs.push(secs);
  S.firstKO.push(koRound || g.round);
  if (g.log.some((b) => b.t === 'win' && b.why === 'time')) S.timeouts++;
  if (g.winner !== null) S.wins[hands[g.winner]!]++;
  // A close finish: the winner ends on 1 heart.
  if (g.winner !== null && g.players[g.winner]!.hearts === 1) S.closeEnd++;
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(0)}%`;
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)]!;
console.log(`${N} matches · ${SEATS} seats · mode ${MODE}`);
console.log(
  `minutes: median ${(med(S.secs) / 60).toFixed(1)} · p10 ${(q(S.secs, 0.1) / 60).toFixed(1)} · p90 ${(q(S.secs, 0.9) / 60).toFixed(1)}`,
);
console.log(
  `rounds: median ${med(S.rounds)} · first KO round median ${med(S.firstKO)} · timeouts ${pct(S.timeouts, N)}`,
);
console.log(
  `turns/match ${med(S.turns)} · duels/turn ${(S.duels / S.allTurns).toFixed(2)} · quiet turns ${pct(S.quiet, S.allTurns)}`,
);
console.log(
  `duel outcomes: win ${pct(S.outcomes.win!, S.duels)} · lose ${pct(S.outcomes.lose!, S.duels)} · standoff ${pct(S.outcomes.standoff!, S.duels)}`,
);
console.log(
  `flips/match ${(S.flips / N).toFixed(1)} · close finishes (winner on 1 heart) ${pct(S.closeEnd, N)}`,
);
if (MODE === 'mixed')
  console.log(
    `the fool (1 per table) wins ${pct(S.wins.fool, N)} (fair share ${pct(1, SEATS)}) · each smart wins ${pct(S.wins.smart / (SEATS - 1), N)}`,
  );
console.log(`storm duels won: no item ${pct(storm.plain.w, storm.plain.n)} (n=${storm.plain.n}) · with Double ${pct(storm.dbl.w, storm.dbl.n)} (n=${storm.dbl.n})`);
