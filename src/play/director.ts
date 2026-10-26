/**
 * The director: runs the rules generator, plays every beat on screen in order (one subject at a time, each held for its reading
 * time), and only then shows the question the rules are asking. It keeps its own copy of what the table has SEEN (PV) because the
 * sim's state is already in the future while the beats play.
 */
import {
  OPEN_VERSE,
  CARD,
  FLIPS,
  ITEM_TEXT,
  POWER_TEXT,
  STATS,
  STORM_VERSE,
  fateText,
  type Item,
} from '../game/v7/cards.ts';
import { createGame, play, type Answer, type Ask, type Beat, type Game } from '../game/v7/rules.ts';
import { clock, deliberate, el, esc, hold, pop, readMs, tween, wait, EASE } from './anim.ts';
import type { Audio } from './audio.ts';
import { Board } from './board.ts';
import { DuelView, setAnger } from './duel.ts';
import type { Fx } from './fx.ts';
import { Hud, cardOfId, type PV } from './hud.ts';
import { ART, HERO_ART, SEAT, heroArt } from './look.ts';

export interface Story {
  /** Order of events (the recap reads in time order). */
  at?: number;
  kind: 'tame' | 'unleash' | 'ko' | 'close' | 'jungle' | 'flip' | 'steal';
  text: string;
  img?: string;
  weight: number;
}

export interface Result {
  winner: number;
  players: PV[];
  story: Story[];
  turns: number;
}

const name = (pv: PV) => pv.hero.toUpperCase();
/** Beats that continue the current subject (they never wipe its caption). */
const QUIET = new Set<Beat['t']>(['step', 'reveal', 'meter', 'round', 'picked', 'creaturePicked', 'tamed', 'lostCard', 'grow', 'heart', 'win']);
/** One verb per stat: "Grandmother outwits the Kraken!" */
const VERB = ['overpowers', 'outruns', 'outwits', 'out-weirds'];
const tag = (pv: PV) => `<b class="who" style="color:${SEAT[pv.seat]!.color}">${esc(name(pv))}</b>`;

export class Director {
  readonly g: Game;
  private readonly audio: Audio;
  private readonly fx: Fx;
  private readonly it: Generator<Ask, void, Answer>;
  private readonly board: Board;
  private readonly hud: Hud;
  private readonly duel: DuelView;
  private readonly pv: PV[];
  private cursor = 0;
  private readonly story: Story[] = [];
  private lastHeartWhy = '';
  private stormy = false;
  readonly root = el('div', 'match');
  private readonly overlay = el('div', 'overlay');
  /** For the review probe and the e2e tests. */
  readonly probe = { ask: null as Ask | null, beat: '' as string, time: {} as Record<string, number> };

  constructor(
    seed: number,
    seats: number,
    audio: Audio,
    fx: Fx,
  ) {
    this.audio = audio;
    this.fx = fx;
    this.g = createGame(seed, seats);
    this.board = new Board(this.g.nodes, fx);
    this.hud = new Hud();
    this.duel = new DuelView(audio, fx);
    this.pv = this.g.players.map((p) => ({
      seat: p.seat,
      hero: p.hero,
      power: p.power,
      hearts: p.hearts,
      deck: p.deck.length,
      items: [...p.items],
      out: false,
    }));
    this.root.append(this.board.root, this.duel.root, this.overlay, this.hud.root);
    this.fx.shakeOn(this.board.cam);
    this.board.setup(
      this.g.nodes.map((n) => ({
        id: n.id,
        seen: n.seen,
        kind: n.kind,
        beast: n.beast ? { ...n.beast } : null,
        item: n.item,
      })),
      this.g.players.map((p) => ({ seat: p.seat, hero: p.hero, node: p.node })),
    );
    this.hud.setupMeter(this.g.stormAt, this.g.flipAt);
    this.hud.setupPlates(this.pv);
    void this.hud.setMeter(0, null);
    this.it = play(this.g);
  }

  players(): PV[] {
    return this.pv;
  }

  // ---------- the loop ----------
  async run(): Promise<Result> {
    await this.board.whole(0);
    await wait(400);
    let r = this.it.next();
    for (;;) {
      await this.playBeats();
      if (r.done) break;
      this.probe.ask = r.value;
      const t0 = performance.now();
      const a = await this.ask(r.value);
      const k = `ask:${r.value.k}`;
      this.probe.time[k] = (this.probe.time[k] ?? 0) + (performance.now() - t0) * clock.speed;
      this.probe.ask = null;
      r = this.it.next(a);
    }
    await this.playBeats();
    this.story.forEach((x, i) => (x.at = i));
    return { winner: this.g.winner ?? 0, players: this.pv, story: this.story, turns: this.g.turns };
  }

  private async playBeats(): Promise<void> {
    while (this.cursor < this.g.log.length) {
      const b = this.g.log[this.cursor++]!;
      this.probe.beat = b.t;
      const t0 = performance.now();
      await this.beat(b);
      this.probe.time[b.t] = (this.probe.time[b.t] ?? 0) + (performance.now() - t0) * clock.speed;
    }
  }

  /** Peek at the consequence beats right after a duel (they become one verdict). */
  private takeWhile(pred: (b: Beat) => boolean): Beat[] {
    const out: Beat[] = [];
    while (this.cursor < this.g.log.length && pred(this.g.log[this.cursor]!))
      out.push(this.g.log[this.cursor++]!);
    return out;
  }

  // ---------- one beat ----------
  private async beat(b: Beat): Promise<void> {
    // One subject on screen (Chief v7 #1): a new subject clears the previous caption and hint before it draws.
    if (!QUIET.has(b.t)) {
      this.hud.clear();
      this.hud.hintOff();
    }
    switch (b.t) {
      case 'start':
        this.audio.sfx('omen');
        await this.overlayCard(
          `<div class="verse"><p>${esc(OPEN_VERSE[0])}</p><p>${esc(OPEN_VERSE[1])}</p><small>Last one alive wins.</small></div>`,
          4200,
        );
        return;
      case 'round':
        return;
      case 'meter': {
        setAnger(b.anger);
        this.anger = b.anger;
        this.turnsShown = b.turns;
        await this.hud.setMeter(b.turns, this.omen);
        return;
      }
      case 'turn': {
        this.freshFog.clear();
        const p = this.pv[b.seat]!;
        this.hud.active(b.seat);
        this.audio.setMood(this.stormy ? 'storm' : 'calm');
        // The camera glides WHILE the banner plays (one beat, not two).
        void this.board.follow(b.seat, 700);
        await this.banner(`${tag(p)}<span>'s turn</span>`, `${name(p)}'s turn`, b.seat);
        return;
      }
      case 'fate':
        return this.fate(b);
      case 'step': {
        this.audio.sfx('step', (this.stepN = (this.stepN + 1) % 8));
        void this.board.look(b.to, 1, 300);
        await this.board.hop(b.seat, b.to);
        return;
      }
      case 'reveal': {
        let creature = false;
        for (const s of b.nodes) {
          this.freshFog.add(s.id);
          void this.board.paint(s, true);
          if (s.beast) creature = true;
        }
        this.audio.sfx('fog');
        if (creature) this.hud.hint('fog', 'Fog lifts one step ahead.');
        await wait(creature ? 450 : 220);
        return;
      }
      case 'land':
        return this.land(b);
      case 'item': {
        const p = this.pv[b.seat]!;
        p.items.push(b.item);
        this.audio.sfx('item');
        const why =
          b.why === 'chest' ? 'opens a chest' : b.why === 'find' ? 'finds something' : 'is rewarded';
        await this.flyIcon(b.seat, `item ${b.item}`, b.why === 'tame' ? null : this.g.players[b.seat]!.node);
        this.hud.update(this.pv);
        await this.hud.say(
          `${tag(p)} ${why}: <b class="gold">${ITEM_TEXT[b.item].name.toUpperCase()}</b>`,
          `${name(p)} ${why}: ${ITEM_TEXT[b.item].name}`,
          { min: 1500 },
        );
        this.hud.hint('item', 'Use items on your secret card.');
        return;
      }
      case 'portal': {
        const p = this.pv[b.seat]!;
        this.audio.sfx('portal');
        await this.hud.say(`${tag(p)} falls through the ground…`, `${name(p)} falls through`, { min: 1000 });
        await this.board.throw(b.seat, b.to);
        return;
      }
      case 'steal': {
        const p = this.pv[b.seat]!;
        const from = this.pv[b.from]!;
        p.deck++;
        from.deck--;
        this.audio.sfx('steal');
        await this.cardFly(b.from, b.seat, b.card);
        this.hud.update(this.pv);
        this.story.push({
          kind: 'steal',
          text: `${name(p)} stole the ${CARD[b.card]?.name ?? 'card'} from ${name(from)}`,
          img: b.card,
          weight: 2,
        });
        await this.hud.say(
          `${tag(p)} steals ${tag(from)}'s <b class="gold">${esc(CARD[b.card]?.name ?? '')}</b>!`,
          `steals the card`,
          { min: 1800 },
        );
        return;
      }
      case 'trapSet': {
        const p = this.pv[b.seat]!;
        this.audio.sfx('trap');
        if (p.out) {
          await this.hud.say(
            `<b class="green">The jungle</b> hides a trap somewhere…`,
            'The jungle hides a trap',
            { min: 1600 },
          );
        } else {
          await this.hud.say(`${tag(p)} hides a trap here.`, `${name(p)} hides a trap`, { min: 1400 });
          this.hud.hint('trap', 'Traps spring on the next friend.');
        }
        return;
      }
      case 'swap': {
        const p = this.pv[b.seat]!;
        const o = this.pv[b.with]!;
        this.audio.sfx('swap');
        await this.hud.say(`${tag(p)} swaps places with ${tag(o)}!`, 'swap places', { min: 1200 });
        await this.board.frame([b.a, b.b]);
        await Promise.all([this.board.throw(b.seat, b.b), this.board.throw(b.with, b.a)]);
        return;
      }
      case 'unleash': {
        const p = this.pv[b.seat]!;
        const o = this.pv[b.target]!;
        this.story.push({
          kind: 'unleash',
          text: `${name(p)} unleashed the ${CARD[b.card]?.name} on ${name(o)}`,
          img: b.card,
          weight: 3,
        });
        this.audio.sfx('omen');
        await this.hud.say(`${tag(p)} unleashes a beast on ${tag(o)}!`, 'unleashes a beast', { min: 1600 });
        await this.board.frame([this.g.players[b.seat]!.node, b.node]);
        await this.runner(this.g.players[b.seat]!.node, b.node, b.card);
        this.hud.hint('unleash', 'Nobody is hit twice running.');
        return;
      }
      case 'hunt': {
        const o = this.pv[b.target]!;
        const by = b.by >= 0 ? this.pv[b.by]! : null;
        const count = b.by < 0 && this.wakeTotal ? ` <span class="dim">(${++this.wakeN} of ${this.wakeTotal})</span>` : '';
        this.audio.grunt(CARD[b.card]?.grunt ?? 'roar');
        await this.hud.say(
          by
            ? `The ${esc(CARD[b.card]?.name ?? '')} hunts ${tag(o)} <span class="dim">· sent by the jungle</span>`
            : `The ${esc(CARD[b.card]?.name ?? '')} hunts ${tag(o)}${count}`,
          'hunt',
          { min: 1600 },
        );
        await this.board.frame([b.path[0]!, b.path[b.path.length - 1]!, this.g.players[b.target]!.node]);
        await this.board.walkBeast(b.path, { card: b.card, grow: b.grow });
        return;
      }
      case 'emerge':
        return this.emerge(b);
      case 'picked':
        return this.duel.picked(this.pv[b.seat]!);
      case 'creaturePicked':
        return this.duel.picked(this.pv[b.seat]!, true);
      case 'duel':
        return this.clash(b);
      case 'tamed':
      case 'lostCard':
      case 'grow':
      case 'leaves':
      case 'heart':
        return; // folded into the duel's verdict
      case 'out':
        return this.out(b.seat);
      case 'omen': {
        this.omen = FLIPS[b.flip].name;
        void this.hud.setMeter(this.turnsSeen(), this.omen);
        this.audio.setMood('silent');
        this.audio.sfx('omen');
        await this.overlayCard(
          `<div class="omen"><small>The drums grow louder…</small><h2>${FLIPS[b.flip].name.toUpperCase()}</h2><p>in 3 turns</p></div>`,
          2600,
        );
        this.hud.hint('omen', 'A flip comes. Watch the meter.');
        return;
      }
      case 'flip':
        return this.flip(b);
      case 'powers': {
        b.powers.forEach((pw, i) => (this.pv[i]!.power = pw));
        this.hud.update(this.pv);
        for (const pv of this.pv)
          if (!pv.out) void pop(this.hud.plate(pv.seat)!.querySelector('.power')!, 0.5);
        await this.hud.say(`New powers, dealt by luck`, 'New powers', { min: 1600 });
        return;
      }
      case 'storm':
        return this.storm();
      case 'win':
        return;
    }
  }
  private stepN = 0;
  /** Who sent the creature now fighting (a fallen player = the jungle gets the credit in the recap). */
  private lastEmergeBy = -1;
  private wakeN = 0;
  private wakeTotal = 0;
  /** Seats that have made their first secret pick (the first one gets 25 s). */
  private readonly picked = new Set<number>();
  /** Spaces whose fog lifted this turn (a creature there is a surprise, not one that was waiting). */
  private readonly freshFog = new Set<number>();
  private anger = 0;
  private omen: string | null = null;
  private turnsShown = 0;
  private turnsSeen(): number {
    return this.turnsShown;
  }

  // ---------- beats with their own staging ----------
  private async banner(html: string, text: string, seat: number): Promise<void> {
    const b = el('div', 'turnbanner', `<img src="${heroArt(this.pv[seat]!.hero)}" alt=""><div>${html}</div>`);
    b.style.setProperty('--seat', SEAT[seat]!.color);
    this.overlay.append(b);
    this.audio.sfx('whoosh');
    await tween(
      b,
      [{ transform: 'translateX(-110%) skewX(-12deg)' }, { transform: 'translateX(0) skewX(0)' }],
      380,
      EASE.out,
    );
    await hold(950, 250);
    await tween(
      b,
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: 'translateX(40%)', opacity: 0 },
      ],
      260,
      EASE.in,
    );
    b.remove();
  }

  private async fate(b: Extract<Beat, { t: 'fate' }>): Promise<void> {
    const p = this.pv[b.seat]!;
    const f = fateText(b.fate);
    const c = el(
      'div',
      `fatecard ${b.fate.k}${b.underdog ? ' underdog' : ''}`,
      `<div class="fc-back" style="background-image:url(${ART}back.webp)"></div>
       <div class="fc-front">${b.underdog ? '<small class="ud">UNDERDOG LUCK</small>' : '<small>FATE</small>'}${b.fate.k === 'move' ? `<b class="num">${b.fate.n}</b>` : ''}<h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div>`,
    );
    this.overlay.append(c);
    this.audio.sfx('card');
    await tween(
      c,
      [
        { transform: 'translate(-50%, 60vh) rotate(-20deg) scale(.6)' },
        { transform: 'translate(-50%, -50%) rotate(0) scale(1)' },
      ],
      420,
      EASE.out,
    );
    c.classList.add('flipped');
    this.audio.sfx('flip');
    await wait(300);
    if (b.underdog) this.hud.hint('underdog', 'Last place draws wild luck.');
    if (b.fate.k === 'move') this.hud.hint('move', 'Draw fate. Obey it.');
    await hold(readMs(f.title + f.text, 1300) - 400, 400);
    await tween(
      c,
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: 'translate(-50%, -80%) scale(.7)', opacity: 0 },
      ],
      300,
      EASE.in,
    );
    c.remove();
    void p;
  }

  private async land(b: Extract<Beat, { t: 'land' }>): Promise<void> {
    const p = this.pv[b.seat]!;
    switch (b.what) {
      case 'empty':
        await this.hud.say(
          `Nothing here. <span class="dim">The jungle is watching.</span>`,
          'Nothing here. The jungle is watching.',
          { min: 1100 },
        );
        return;
      case 'item':
        return;
      case 'portal':
        this.hud.hint('portal', 'Portals throw you to their twin.');
        return;
      case 'ownTrap':
        await this.hud.say(`${tag(p)} steps around their own trap.`, 'own trap', { min: 1300 });
        return;
      case 'friend':
        await this.hud.say(
          `${tag(p)} meets a friend.`,
          'meets a friend',
          { min: 1200 },
        );
        return;
    }
  }

  /** A beast runs across the board from the unleasher to the target. */
  private async runner(from: number, to: number, card: string): Promise<void> {
    const a = this.board.nodeScreen(from);
    const z = this.board.nodeScreen(to);
    const r = el('img', 'runner');
    r.src = `${ART}${card}.webp`;
    this.overlay.append(r);
    this.audio.grunt(CARD[card]?.grunt ?? 'roar');
    await tween(
      r,
      [
        { left: `${a.x}px`, top: `${a.y}px`, transform: 'translate(-50%,-90%) scale(.5)' },
        {
          left: `${(a.x + z.x) / 2}px`,
          top: `${Math.min(a.y, z.y) - 120}px`,
          transform: 'translate(-50%,-90%) scale(.9)',
          offset: 0.5,
        },
        { left: `${z.x}px`, top: `${z.y}px`, transform: 'translate(-50%,-90%) scale(.7)' },
      ],
      1100,
      'ease-in-out',
    );
    this.fx.burst(z.x, z.y, { n: 30, color: ['#8a6b48', '#c4a77d'], speed: 260, up: 80, size: 4 });
    r.remove();
  }

  private async emerge(b: Extract<Beat, { t: 'emerge' }>): Promise<void> {
    const p = this.pv[b.seat]!;
    const by = b.by >= 0 ? this.pv[b.by] : undefined;
    // The cause, named before the creature appears (law #42): a creature already standing on the space was waiting for you.
    const waiting = (b.source === 'lair' || (b.source === 'hunt' && b.by < 0)) && !!this.board.beastEl(b.node) && !this.freshFog.has(b.node);
    const cause = waiting
      ? 'It was waiting for you…'
      : b.source === 'lair'
        ? 'Something lives here…'
        : b.source === 'trap'
          ? `${by ? (by.out ? 'The jungle' : name(by)) : 'A'}’s trap springs!`
          : b.source === 'unleash'
            ? `Unleashed by ${by ? name(by) : 'a friend'}`
            : b.source === 'storm'
              ? 'The storm wakes a monster'
              : b.source === 'wake'
                ? 'The jungle wakes'
                : `Sent by the jungle`;
    if (b.source === 'trap') {
      this.audio.sfx('trap');
      this.fx.shake(0.4);
    }
    this.hud.active(b.seat);
    await this.board.follow(b.seat, 400);
    this.lastEmergeBy = b.by;
    await this.duel.emerge(b, p, cause, this.anger);
    this.hud.hint('duel', 'Read its entrance. Guess its stat.');
  }

  private async clash(b: Extract<Beat, { t: 'duel' }>): Promise<void> {
    const p = this.pv[b.seat]!;
    await this.duel.clash(b, p);
    // The consequences, folded into one verdict with a one-line reason (audience: one line explains every lost heart).
    const after = this.takeWhile(
      (x) =>
        x.t === 'tamed' ||
        x.t === 'lostCard' ||
        x.t === 'grow' ||
        x.t === 'leaves' ||
        x.t === 'heart' ||
        (x.t === 'item' && x.why === 'tame'),
    );
    const its = CARD[b.beast]!;
    const mine = cardOfId(b.card);
    const lostRow = b.rows.find((r) => r.res === 'L');
    const wonRow = b.rows.find((r) => r.res === 'W' && r.stat === b.pick) ?? b.rows.find((r) => r.res === 'W');
    const why = lostRow ? `Its ${STATS[lostRow.stat]} ${lostRow.it} beat your ${lostRow.you}.` : '';
    const beats = (row: typeof lostRow, winner: string, loser: string) =>
      row ? `${winner} ${VERB[row.stat]} ${loser}` : `${winner} beats ${loser}`;
    const margin = Math.min(...b.rows.map((r) => Math.abs(r.you - r.it)));
    if (margin <= 3)
      this.story.push({
        kind: 'close',
        text: `${name(p)} vs the ${its.name}: decided by ${margin}`,
        img: its.id,
        weight: 2,
      });
    let dropped: Item | null = null;
    for (const x of after) {
      if (x.t === 'tamed') {
        p.deck++;
        this.story.push({
          kind: 'tame',
          text: `${name(p)} tamed the ${its.name}`,
          img: its.id,
          weight: its.tier + (b.lucky ? 1 : 0),
        });
        await this.duel.verdict(
          'tamed',
          b.lucky ? 'TAMED: LUCKY CHARM!' : 'TAMED!',
          b.lucky ? `One each — your Lucky Charm breaks the tie. The ${its.name} is yours.` : `${beats(wonRow, mine.name, `the ${its.name}`)}! It is yours.`,
        );
        if (b.resident) this.board.setBeast(b.node, null, false);
      } else if (x.t === 'item') {
        p.items.push(x.item);
        dropped = x.item;
      } else if (x.t === 'lostCard') {
        p.deck--;
      } else if (x.t === 'heart') {
        if (x.blocked === 'safe') {
          await this.duel.verdict('safe', 'SAFE.', `${beats(lostRow, `The ${its.name}`, `your ${mine.name}`)}. It takes your card.`);
          this.hud.hint('safe', 'From now on, losing costs hearts.');
        } else {
          p.hearts = x.hearts;
          this.lastHeartWhy = `the ${its.name}`;
          this.audio.grunt(its.grunt);
          this.story.push({ kind: 'close', text: `The ${its.name} to ${name(p)}: “${its.gloat}”`, img: its.id, weight: 2.5 });
          const v = this.duel.verdict(
            'lost',
            'A HEART LOST',
            lostRow ? `${beats(lostRow, `The ${its.name}`, `your ${mine.name}`)}.` : 'No winner. In the storm, only a win saves you.',
            its.gloat,
          );
          await wait(500);
          const at = await this.hud.breakHeart(b.seat, x.hearts);
          if (at)
            this.fx.burst(at.x, at.y, {
              n: 30,
              color: ['#e0442f', '#ff8a7a', '#6b0f0f'],
              speed: 260,
              g: 500,
              size: 5,
              kind: 'shard',
            });
          await v;
        }
      } else if (x.t === 'leaves') {
        await this.hud.say(`The ${esc(its.name)} slinks back into the fog.`, 'slinks back', { min: 1300 });
      } else if (x.t === 'grow') {
        await this.duel.verdict('standoff', 'STANDOFF', `One each. The ${its.name} stays — GREW +${x.grow}.`);
        this.board.setBeast(x.node, { card: x.card, grow: x.grow }, false);
      }
    }
    // A creature that beat you holds the space only if the rules say it stays (QA v7 H4: board == rules).
    if (b.outcome === 'lose' && b.stays) this.board.setBeast(b.node, { card: b.beast, grow: b.grow }, false);
    this.hud.update(this.pv);
    await this.duel.close();
    if (dropped)
      await this.hud.say(`${tag(p)} also finds a <b class="gold">${ITEM_TEXT[dropped].name.toUpperCase()}</b>`, 'also finds', { min: 1300 });
    this.audio.setMood(this.stormy ? 'storm' : 'calm');
  }

  private async out(seat: number): Promise<void> {
    const p = this.pv[seat]!;
    p.out = true;
    p.items = [];
    this.board.setOut(seat);
    this.hud.update(this.pv);
    const jungle = this.lastEmergeBy >= 0 && this.pv[this.lastEmergeBy]!.out && this.lastEmergeBy !== seat;
    this.story.push({
      kind: jungle ? 'jungle' : 'ko',
      text: jungle
        ? `The jungle (${name(this.pv[this.lastEmergeBy]!)}) took ${name(p)}`
        : `${name(p)} fell to ${this.lastHeartWhy || 'the jungle'}`,
      img: HERO_ART[p.hero],
      weight: 3,
    });
    this.audio.sfx('ko');
    this.fx.shake(0.6);
    await this.overlayCard(
      `<div class="ko" style="--seat:${SEAT[seat]!.color}"><img src="${heroArt(p.hero)}" alt=""><h2>${esc(name(p))} IS OUT</h2><p>…and becomes <b class="green">THE JUNGLE</b>.</p></div>`,
      3000,
    );
    this.hud.hint('jungle', 'The fallen now play the jungle.');
  }

  private async flip(b: Extract<Beat, { t: 'flip' }>): Promise<void> {
    const f = FLIPS[b.flip];
    this.omen = null;
    this.audio.setMood('silent');
    this.audio.sfx('omen');
    this.story.push({ kind: 'flip', text: f.name, img: 'back', weight: 2 });
    await this.board.whole(700);
    await this.overlayCard(
      `<div class="verse"><p>${esc(f.verse[0])}</p><p>${esc(f.verse[1])}</p><h2>${f.name.toUpperCase()}</h2></div>`,
      5200,
    );
    this.audio.sfx('quake');
    await this.board.quake();
    if (b.flip === 'shift') {
      await Promise.all(b.moves.map((m) => this.board.throw(m.seat, m.to)));
    } else if (b.flip === 'decks') {
      const counts = new Map(this.pv.map((p) => [p.seat, p.deck]));
      for (const pass of b.passes) this.pv[pass.to]!.deck = counts.get(pass.from)!;
      // Each deck's best card flies face-up to its new owner, one at a time: you SEE what changed hands.
      for (const pass of b.passes) {
        const best = pass.best ? CARD[pass.best] : null;
        void this.cardFly(pass.from, pass.to, pass.best);
        this.audio.sfx('steal');
        await this.hud.say(
          best ? `The <b class="gold">${esc(best.name)}</b> now serves ${tag(this.pv[pass.to]!)}.` : `${tag(this.pv[pass.to]!)} gets an empty deck.`,
          'now serves',
          { min: 1500 },
        );
      }
      this.hud.update(this.pv);
    } else if (b.flip === 'wake') {
      this.wakeN = 0;
      this.wakeTotal = this.pv.filter((p) => !p.out).length;
    }
    for (const s of b.board) void this.board.paint(s, true);
    await this.board.whole(500);
    void this.hud.setMeter(this.turnsShown, null);
    await this.hud.say(`${f.name}!`, f.name, { min: 1600 });
  }

  private async storm(): Promise<void> {
    this.stormy = true;
    this.audio.sfx('thunder');
    document.body.classList.add('stormy');
    this.fx.setAmbient(14);
    await this.overlayCard(
      `<div class="verse storm"><p>${esc(STORM_VERSE[0])}</p><p>${esc(STORM_VERSE[1])}</p><h2>THE STORM</h2><small>Every landing wakes a monster. Only a win saves you.</small></div>`,
      5600,
    );
    this.audio.setMood('storm');
  }

  private async overlayCard(html: string, ms: number): Promise<void> {
    this.hud.hintOff();
    this.hud.clear();
    const o = el('div', 'bigcard', html);
    this.overlay.append(o);
    await tween(
      o,
      [
        { opacity: 0, transform: 'scale(1.06)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      420,
      EASE.out,
    );
    await hold(ms * 0.7, ms * 0.3);
    await tween(o, [{ opacity: 1 }, { opacity: 0 }], 350);
    o.remove();
  }

  /** An icon flies from a space (or the duel) to the player's plate. */
  private async flyIcon(seat: number, cls: string, node: number | null): Promise<void> {
    const plate = this.hud.plate(seat);
    if (!plate) return;
    const from = node !== null ? this.board.nodeScreen(node) : { x: innerWidth / 2, y: innerHeight / 2 };
    const r = plate.querySelector('.items')!.getBoundingClientRect();
    const i = el('i', `flyer ${cls}`);
    this.overlay.append(i);
    await tween(
      i,
      [
        { left: `${from.x}px`, top: `${from.y}px`, transform: 'translate(-50%,-50%) scale(.4)' },
        {
          left: `${(from.x + r.left) / 2}px`,
          top: `${Math.min(from.y, r.top) - 140}px`,
          transform: 'translate(-50%,-50%) scale(1.6)',
          offset: 0.45,
        },
        { left: `${r.left + 12}px`, top: `${r.top + 12}px`, transform: 'translate(-50%,-50%) scale(.6)' },
      ],
      800,
      'ease-in-out',
    );
    i.remove();
  }

  /** A card flies from one plate to another (steal, decks swap). */
  private async cardFly(fromSeat: number, toSeat: number, card: string | null): Promise<void> {
    const a = this.hud.plate(fromSeat)?.getBoundingClientRect();
    const z = this.hud.plate(toSeat)?.getBoundingClientRect();
    if (!a || !z) return;
    const c = el('div', 'flycard');
    c.style.backgroundImage = card ? `url(${ART}${card}.webp), url(${ART}bg-1.webp)` : `url(${ART}back.webp)`;
    this.overlay.append(c);
    await tween(
      c,
      [
        {
          left: `${a.left + a.width / 2}px`,
          top: `${a.top}px`,
          transform: 'translate(-50%,-50%) rotate(-10deg) scale(.6)',
        },
        {
          left: `${(a.left + z.left) / 2 + a.width / 2}px`,
          top: `${a.top - 220}px`,
          transform: 'translate(-50%,-50%) rotate(8deg) scale(1.3)',
          offset: 0.5,
        },
        {
          left: `${z.left + z.width / 2}px`,
          top: `${z.top}px`,
          transform: 'translate(-50%,-50%) rotate(0) scale(.5)',
        },
      ],
      900,
      'ease-in-out',
    );
    c.remove();
  }

  // ---------- the questions ----------
  private ask(a: Ask): Promise<Answer> {
    switch (a.k) {
      case 'pick': {
        const first = !this.picked.has(a.seat);
        this.picked.add(a.seat);
        return this.duel.pick(a, this.pv[a.seat]!, first).then((ans) => {
          if (ans.k === 'use') {
            const p = this.pv[a.seat]!;
            const i = p.items.indexOf(ans.item);
            if (i >= 0) p.items.splice(i, 1);
            this.hud.update(this.pv);
            this.audio.sfx('item');
          }
          return ans;
        });
      }
      case 'fork':
        return this.askFork(a);
      case 'target':
        return this.askTarget(a);
      case 'jungle':
        return this.askJungle(a);
      case 'creature':
        return this.secretGate(this.pv[a.seat]!, `You are the jungle. Pick for the ${CARD[a.beast.card]?.name ?? 'creature'}.`).then(() =>
          this.duel.pickForCreature(a, this.pv[a.seat]!, this.pv[a.hero]!).then((stat) => {
            document.body.classList.remove('secret-on');
            return { k: 'stat', stat } as Answer;
          }),
        );
    }
  }

  private askFork(a: Extract<Ask, { k: 'fork' }>): Promise<Answer> {
    const here = this.g.players[a.seat]!.node;
    void this.board.frame([here, ...a.options], 500);
    this.hud.sayNow(`${tag(this.pv[a.seat]!)}: which way?`);
    this.hud.hint('fork', 'Choose a path. Fog hides both.');
    return new Promise((resolve) => {
      const btns: HTMLElement[] = [];
      let answered = false;
      const done = (node: number) => {
        if (answered) return;
        answered = true;
        removeEventListener('keydown', key);
        btns.forEach((b) => b.remove());
        this.hud.clear();
        this.audio.sfx('choose');
        resolve({ k: 'fork', node });
      };
      // Order the two ways left-to-right on screen, so ← and → mean what they show.
      const opts = [...a.options].sort((x, y) => this.board.nodeScreen(x).x - this.board.nodeScreen(y).x);
      setTimeout(() => {
        if (answered) return;
        opts.forEach((id, i) => {
          const p = this.board.nodeScreen(id);
          const b = el('button', 'forkbtn', `<kbd>${i ? '→' : '←'}</kbd>`);
          b.style.left = `${p.x}px`;
          b.style.top = `${p.y}px`;
          // Near the top edge the arrow sits BELOW its space, so it never covers the caption.
          if (p.y < 230) b.style.translate = '-50% 40%';
          b.onclick = () => done(id);
          this.overlay.append(b);
          btns.push(b);
          void pop(b, 0.5);
        });
      }, 520 / clock.speed);
      const key = (e: KeyboardEvent) => {
        if (e.code === 'ArrowLeft' || e.key === '1') done(opts[0]!);
        if (e.code === 'ArrowRight' || e.key === '2') done(opts[1] ?? opts[0]!);
      };
      addEventListener('keydown', key);
    });
  }

  private askTarget(a: Extract<Ask, { k: 'target' }>): Promise<Answer> {
    const verb =
      a.why === 'steal'
        ? 'Steal from whom?'
        : a.why === 'unleash'
          ? 'Unleash it on whom?'
          : 'Swap with whom?';
    return this.choosePlayer(a.seat, verb, a.options).then((seat) => ({ k: 'target', seat }));
  }

  private choosePlayer(seat: number, verb: string, options: number[], cover = false): Promise<number> {
    return new Promise((resolve) => {
      const box = el('div', `chooser${cover ? ' secret' : ''}`);
      box.innerHTML = `<h3>${tag(this.pv[seat]!)} — ${esc(verb)}</h3><div class="faces"></div>`;
      const faces = box.querySelector('.faces')!;
      let chosen = false;
      const done = (s: number) => {
        if (chosen) return;
        chosen = true;
        removeEventListener('keydown', key);
        this.audio.sfx('choose');
        void tween(box, [{ opacity: 1 }, { opacity: 0 }], 200).then(() => {
          box.remove();
          resolve(s);
        });
      };
      options.forEach((s, i) => {
        const pv = this.pv[s]!;
        const b = el(
          'button',
          'face',
          `<kbd>${i + 1}</kbd><img src="${heroArt(pv.hero)}" alt=""><b>${esc(name(pv))}</b><span>${'♥'.repeat(pv.hearts)} · ${pv.deck} cards</span>`,
        );
        b.style.setProperty('--seat', SEAT[s]!.color);
        b.onclick = () => done(s);
        faces.append(b);
      });
      const key = (e: KeyboardEvent) => {
        const n = Number(e.key);
        if (n >= 1 && n <= options.length) done(options[n - 1]!);
      };
      addEventListener('keydown', key);
      this.overlay.append(box);
      void tween(
        box,
        [
          { opacity: 0, transform: 'translate(-50%,-46%) scale(.95)' },
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
        ],
        280,
        EASE.out,
      );
    });
  }

  private async askJungle(a: Extract<Ask, { k: 'jungle' }>): Promise<Answer> {
    const p = this.pv[a.seat]!;
    // A secret: the cover screen first.
    await this.secretGate(p, 'You are the jungle.');
    const act = await new Promise<'hunt' | 'trap'>((resolve) => {
      const box = el(
        'div',
        'chooser secret',
        `<h3>${tag(p)} — the jungle's move</h3><div class="faces acts">
          <button class="face act" data-a="hunt"><kbd>1</kbd><b>SEND A BEAST</b><span>The nearest creature walks 3 steps at a friend.</span></button>
          <button class="face act" data-a="trap"><kbd>2</kbd><b>HIDE A TRAP</b><span>Two steps ahead of a friend. Secret.</span></button></div>`,
      );
      const done = (x: 'hunt' | 'trap') => {
        removeEventListener('keydown', key);
        box.remove();
        resolve(x);
      };
      for (const b of box.querySelectorAll<HTMLButtonElement>('.act'))
        b.onclick = () => done(b.dataset.a as 'hunt' | 'trap');
      const key = (e: KeyboardEvent) => {
        if (e.key === '1') done('hunt');
        if (e.key === '2') done('trap');
      };
      addEventListener('keydown', key);
      this.overlay.append(box);
    });
    const target = await this.choosePlayer(
      a.seat,
      act === 'hunt' ? 'Send it at whom?' : 'Trap whom?',
      a.options,
      true,
    );
    document.body.classList.remove('secret-on');
    return { k: 'jungle', act, target };
  }

  private secretGate(p: PV, line: string): Promise<void> {
    return new Promise((resolve) => {
      document.body.classList.add('secret-on');
      const g = el(
        'div',
        'gate',
        `<div class="handoff"><img src="${heroArt(p.hero)}" alt=""><h2><b style="color:${SEAT[p.seat]!.color}">${esc(name(p))}</b>, only you look.</h2><p>${esc(line)} Everyone else: look away!</p><button class="go"><kbd>SPACE</kbd> I'm ready</button></div>`,
      );
      const done = () => {
        removeEventListener('keydown', key);
        g.remove();
        resolve();
      };
      const openedAt = performance.now();
      const key = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (deliberate(e, openedAt)) done();
        }
      };
      const go = g.querySelector<HTMLButtonElement>('.go')!;
      go.classList.add('arming');
      setTimeout(() => go.classList.remove('arming'), 900 / clock.speed);
      go.onclick = () => performance.now() - openedAt > 900 / clock.speed && done();
      addEventListener('keydown', key);
      this.overlay.append(g);
    });
  }
}

export const itemLabel = (i: Item): string => ITEM_TEXT[i].name;
export const powerLabel = (p: keyof typeof POWER_TEXT): string => POWER_TEXT[p].name;
