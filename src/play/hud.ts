/**
 * The heads-up layer: only three things live on screen all the time (Boardroom v7, round 1): whose turn it is, the Jungle
 * Meter, and everyone's hearts. Plus the caption (one subject, one line) and the learn-while-playing hint.
 */
import { CARD, ITEM_TEXT, POWER_TEXT, STATS, type Card, type Item, type Power } from '../game/v7/cards.ts';
/** What the plates show: the director's copy, updated beat by beat (the sim's state is already in the future). */
export interface PV {
  seat: number;
  hero: string;
  power: Power;
  hearts: number;
  deck: number;
  items: Item[];
  out: boolean;
}
import { EASE, el, esc, pop, readMs, tween, wait } from './anim.ts';
import { ART, SEAT, cardBg, heroArt } from './look.ts';

export class Hud {
  readonly root = el('div', 'hud');
  private readonly meter = el('div', 'meter');
  private readonly notches = el('div', 'notches');
  private readonly meterLabel = el('div', 'meter-label');
  private readonly caption = el('div', 'caption');
  private readonly hintEl = el('div', 'hint');
  readonly plates = el('div', 'plates');
  private readonly plateBy = new Map<number, HTMLElement>();
  private readonly seenHints = new Set<string>();
  private stormAt = 20;
  private flipAt: number[] = [];

  constructor() {
    this.meter.append(el('div', 'meter-title', 'THE JUNGLE'), this.notches, this.meterLabel);
    this.root.append(this.meter, this.caption, this.hintEl, this.plates);
  }

  // ---------- the Jungle Meter ----------
  setupMeter(stormAt: number, flipAt: number[]): void {
    this.stormAt = stormAt;
    this.flipAt = flipAt;
    this.notches.innerHTML = '';
    for (let i = 1; i <= stormAt; i++) {
      const n = el('i', i === stormAt ? 'storm' : flipAt.includes(i) ? 'flip' : '');
      this.notches.append(n);
    }
    this.meterLabel.textContent = '';
  }

  async setMeter(turns: number, omen: string | null): Promise<void> {
    const ns = [...this.notches.children] as HTMLElement[];
    ns.forEach((n, i) => n.classList.toggle('on', i < turns));
    const lit = ns[turns - 1];
    if (lit) void pop(lit, 0.6);
    const nextFlip = this.flipAt.find((f) => f > turns);
    if (turns >= this.stormAt) this.meterLabel.innerHTML = '<b class="red">THE STORM</b>';
    else if (omen && nextFlip !== undefined)
      this.meterLabel.innerHTML = `<b class="red">${esc(omen)}</b> in ${nextFlip - turns}`;
    else if (nextFlip !== undefined && nextFlip - turns <= 5)
      this.meterLabel.textContent = `Something stirs in ${nextFlip - turns}`;
    else this.meterLabel.textContent = `The storm in ${this.stormAt - turns}`;
    this.meter.classList.toggle('omen', !!omen);
    this.meter.classList.toggle('stormy', turns >= this.stormAt);
  }

  // ---------- caption + hint ----------
  /** One line, held for its reading time, then gone: a caption never lingers into the next beat. */
  async say(html: string, text: string, opts: { min?: number; big?: boolean; keep?: boolean } = {}): Promise<void> {
    this.caption.innerHTML = html;
    this.caption.classList.toggle('big', !!opts.big);
    this.caption.classList.add('on');
    this.caption.style.opacity = '';
    await tween(this.caption, [{ opacity: 0, transform: 'translate(-50%, -14px) scale(.96)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], 280, EASE.out);
    await wait(opts.min ?? readMs(text));
    if (!opts.keep) this.clear();
  }
  sayNow(html: string): void {
    this.caption.innerHTML = html;
    this.caption.classList.add('on');
    this.caption.style.opacity = '1';
  }
  clear(): void {
    this.caption.classList.remove('on');
    this.caption.style.opacity = '';
    this.caption.getAnimations().forEach((a) => a.cancel());
  }

  /** Learn while playing (owner #66): the first time each thing happens, one line. */
  hint(key: string, text: string): void {
    if (this.seenHints.has(key)) return;
    this.seenHints.add(key);
    this.hintEl.textContent = text;
    this.hintEl.style.opacity = '';
    this.hintEl.style.transform = '';
    this.hintEl.classList.add('on');
    clearTimeout((this.hintEl as unknown as { _t: number })._t);
    (this.hintEl as unknown as { _t: number })._t = window.setTimeout(
      () => this.hintEl.classList.remove('on'),
      6500,
    );
  }
  hintOff(): void {
    this.hintEl.classList.remove('on');
  }
  resetHints(): void {
    this.seenHints.clear();
  }

  // ---------- the plates ----------
  setupPlates(players: readonly PV[]): void {
    this.plates.innerHTML = '';
    this.plateBy.clear();
    for (const p of players) {
      const pl = el('div', 'plate');
      pl.style.setProperty('--seat', SEAT[p.seat]!.color);
      pl.innerHTML = `
        <img class="face" src="${heroArt(p.hero)}" alt="">
        <div class="who"><b>${p.hero.toUpperCase()}</b><span class="power"></span></div>
        <div class="hearts"></div>
        <div class="deck"><i></i><em></em></div>
        <div class="items"></div>`;
      this.plates.append(pl);
      this.plateBy.set(p.seat, pl);
    }
    this.update(players);
  }

  update(players: readonly PV[]): void {
    // "Ab main aage hun": a gold rim on the one clear leader (most hearts, then the biggest deck).
    const live = players.filter((p) => !p.out);
    const score = (p: PV) => p.hearts * 100 + p.deck;
    const top = Math.max(...live.map(score));
    const leaders = live.filter((p) => score(p) === top);
    for (const p of players) this.plateBy.get(p.seat)?.classList.toggle('lead', leaders.length === 1 && leaders[0] === p);
    for (const p of players) {
      const pl = this.plateBy.get(p.seat);
      if (!pl) continue;
      pl.classList.toggle('out', p.out);
      const hearts = pl.querySelector('.hearts')!;
      const want = p.out ? 0 : 3;
      if (hearts.children.length !== want) hearts.innerHTML = '<i></i>'.repeat(want);
      [...hearts.children].forEach((h, i) => h.classList.toggle('lost', i >= p.hearts));
      pl.querySelector('.deck em')!.textContent = String(p.deck);
      pl.querySelector('.power')!.textContent = p.out ? 'THE JUNGLE' : POWER_TEXT[p.power].name;
      pl.querySelector('.items')!.innerHTML = p.items
        .map((it) => `<i class="item ${it}" title="${ITEM_TEXT[it].name}"></i>`)
        .join('');
    }
  }

  active(seat: number | null): void {
    for (const [s, pl] of this.plateBy) pl.classList.toggle('active', s === seat);
  }

  plate(seat: number): HTMLElement | undefined {
    return this.plateBy.get(seat);
  }

  /** A heart cracks and shatters on the plate (1.5 s beat, Zathura's house). */
  async breakHeart(seat: number, hearts: number): Promise<{ x: number; y: number } | null> {
    const h = this.plateBy.get(seat)?.querySelectorAll('.hearts i')[hearts] as HTMLElement | undefined;
    if (!h) return null;
    h.classList.add('cracking');
    await tween(
      h,
      [{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1.5) rotate(-8deg)' }],
      500,
      EASE.pop,
    );
    const r = h.getBoundingClientRect();
    h.classList.remove('cracking');
    h.classList.add('lost');
    h.style.transform = '';
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}

// ---------- the Top Trumps card ----------
export function cardEl(
  card: Card,
  opts: { hidden?: boolean; bonus?: number; bonusStat?: number; mine?: boolean } = {},
): HTMLElement {
  const c = el('div', `tcard t${card.tier}${opts.mine ? ' mine' : ''}`);
  const rows = card.stats
    .map((v, i) => {
      const b = opts.bonusStat === i ? (opts.bonus ?? 0) : 0;
      return `<li data-s="${i}"><span>${STATS[i]}</span><em>${opts.hidden ? '?' : v + b}</em>${b ? `<sup>+${b}</sup>` : ''}<i style="--v:${opts.hidden ? 0 : Math.min(1, (v + b) / 100)}"></i></li>`;
    })
    .join('');
  const art =
    card.id === 'hands'
      ? `<div class="art hands"></div>`
      : `<div class="art" style="background-image:url(${cardBg(card.tier)})"><img src="${ART}${card.id}.webp" alt=""></div>`;
  c.innerHTML = `${art}<div class="plaque"><b>${esc(card.name)}</b><small>${'◆'.repeat(card.tier)}</small></div><ol class="stats">${rows}</ol>`;
  return c;
}

export const cardOfId = (id: string): Card =>
  CARD[id] ?? { id: 'hands', name: 'Bare Hands', stats: [10, 10, 10, 10], tier: 1, line: '', gloat: '', grunt: 'stomp' };

export const itemName = (i: Item): string => ITEM_TEXT[i].name;
export const powerName = (p: Power): string => POWER_TEXT[p].name;
