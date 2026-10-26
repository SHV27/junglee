/**
 * The painted board: the jungle seen from above, carved trails, stone spaces, mist over every space nobody has seen, creatures
 * standing on their spaces, the heroes' medallions, and a camera that stays close on whoever is acting (owner #56).
 * A pure view: it changes ONLY when the director plays a beat (nothing moves unless a player, a card or the meter caused it).
 */
import { CARD } from '../game/v7/cards.ts';
import { BOARD_H, BOARD_W, type MapNode } from '../game/v7/map.ts';
import type { Beast, Spot } from '../game/v7/rules.ts';
import { EASE, el, pop, tween, wait } from './anim.ts';
import type { Fx } from './fx.ts';
import { ART, HERO_ART, SEAT, heroArt } from './look.ts';

interface View {
  node: HTMLElement;
  beast: HTMLElement | null;
  beastData: Beast | null;
  mist: HTMLElement | null;
  chest: HTMLElement | null;
  seen: boolean;
}

export class Board {
  readonly root = el('div', 'world');
  readonly cam = el('div', 'cam');
  private readonly plane = el('div', 'plane');
  private readonly views: View[] = [];
  private readonly heroes = new Map<number, HTMLElement>();
  private readonly at = new Map<number, number>();
  private camX = BOARD_W / 2;
  private camY = BOARD_H / 2;
  private camS = 0.6;

  private readonly nodes: readonly MapNode[];
  private readonly fx: Fx;

  constructor(nodes: readonly MapNode[], fx: Fx) {
    this.nodes = nodes;
    this.fx = fx;
    this.plane.style.width = `${BOARD_W}px`;
    this.plane.style.height = `${BOARD_H}px`;
    this.plane.style.backgroundImage = `url(${ART}board.webp)`;
    this.plane.append(this.trails(), el('div', 'plane-vignette'));
    for (const n of nodes) {
      const v = el('div', `space${n.id === 26 ? ' heart' : ''}`);
      v.style.left = `${n.x}px`;
      v.style.top = `${n.y}px`;
      v.dataset.id = String(n.id);
      v.append(el('i', 'stone'));
      this.plane.append(v);
      this.views.push({ node: v, beast: null, beastData: null, mist: null, chest: null, seen: false });
    }
    this.cam.append(this.plane);
    this.root.append(this.cam);
    addEventListener('resize', () => this.applyCam());
  }

  /** The carved trails: a dark groove with a lighter worn centre; arrows show the way of travel. */
  private trails(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'trails');
    svg.setAttribute('viewBox', `0 0 ${BOARD_W} ${BOARD_H}`);
    const d: string[] = [];
    for (const n of this.nodes)
      for (const m of n.next) {
        const b = this.nodes[m]!;
        d.push(`M${n.x} ${n.y} L${b.x} ${b.y}`);
      }
    for (const [cls, w] of [
      ['groove', 34],
      ['worn', 18],
      ['dash', 3],
    ] as const) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d.join(' '));
      p.setAttribute('class', cls);
      p.setAttribute('stroke-width', String(w));
      svg.append(p);
    }
    for (const n of this.nodes)
      for (const m of n.next) {
        const b = this.nodes[m]!;
        const mx = (n.x + b.x) / 2;
        const my = (n.y + b.y) / 2;
        const ang = (Math.atan2(b.y - n.y, b.x - n.x) * 180) / Math.PI;
        const a = document.createElementNS(ns, 'path');
        a.setAttribute('d', 'M-7 -7 L5 0 L-7 7');
        a.setAttribute('class', 'arrow');
        a.setAttribute('transform', `translate(${mx} ${my}) rotate(${ang})`);
        svg.append(a);
      }
    return svg;
  }

  // ---------- the initial state ----------
  setup(spots: readonly Spot[], heroes: { seat: number; hero: string; node: number }[]): void {
    for (const s of spots) this.paint(s, false);
    for (const h of heroes) {
      const t = el('div', `token seat${h.seat}`);
      t.style.setProperty('--seat', SEAT[h.seat]!.color);
      const img = el('img');
      img.src = heroArt(h.hero);
      img.alt = h.hero;
      t.append(el('i', 'ring'), img);
      this.plane.append(t);
      this.heroes.set(h.seat, t);
      this.at.set(h.seat, h.node);
    }
    this.layoutTokens();
    void HERO_ART;
  }

  /** Paint one space as seen/unseen with its contents (no animation unless `animate`). */
  paint(s: Spot, animate: boolean): Promise<void> | void {
    const v = this.views[s.id]!;
    v.seen = s.seen;
    v.node.classList.toggle('portal', s.kind === 'portal' && s.seen);
    v.node.classList.toggle('lair', s.kind === 'lair' && s.seen);
    // Mist over the unseen.
    if (!s.seen && !v.mist) {
      v.mist = el('div', 'mist');
      v.mist.style.setProperty('--d', `${(s.id * 0.37) % 3}s`);
      v.node.append(v.mist);
      if (animate)
        void tween(
          v.mist,
          [
            { opacity: 0, scale: 0.6 },
            { opacity: 1, scale: 1 },
          ],
          700,
        );
    }
    if (s.seen && v.mist) {
      const m = v.mist;
      v.mist = null;
      if (animate)
        void tween(
          m,
          [
            { opacity: 1, scale: 1 },
            { opacity: 0, scale: 1.9 },
          ],
          650,
          EASE.out,
        ).then(() => m.remove());
      else m.remove();
    }
    // Chest.
    const wantChest = s.seen && s.kind === 'item' && !!s.item;
    if (wantChest && !v.chest) {
      v.chest = el('div', 'chest');
      v.node.append(v.chest);
      if (animate) void pop(v.chest, 0.5);
    } else if (!wantChest && v.chest) {
      v.chest.remove();
      v.chest = null;
    }
    // A creature waiting on its space (only once seen).
    this.setBeast(s.id, s.seen ? s.beast : null, animate);
  }

  setBeast(id: number, b: Beast | null, animate: boolean): void {
    const v = this.views[id]!;
    if (b && v.beast && v.beastData?.card === b.card) {
      v.beastData = b;
      v.beast.dataset.grow = String(b.grow);
      return;
    }
    if (v.beast) {
      v.beast.remove();
      v.beast = null;
      v.beastData = null;
    }
    if (!b) return;
    const card = CARD[b.card];
    const wrap = el('div', `dweller t${card?.tier ?? 1}`);
    const img = el('img');
    img.src = `${ART}${b.card}.webp`;
    img.alt = card?.name ?? b.card;
    wrap.append(el('i', 'shadow'), img);
    wrap.dataset.grow = String(b.grow);
    v.node.append(wrap);
    v.beast = wrap;
    v.beastData = b;
    if (animate)
      void tween(
        wrap,
        [
          { transform: 'translateY(30px) scale(.4)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        520,
        EASE.pop,
      );
  }

  beastEl(id: number): HTMLElement | null {
    return this.views[id]?.beast ?? null;
  }

  /** Remove a creature from its space with a flourish (tamed: it shrinks into a card; else it just leaves). */
  async removeBeast(id: number, how: 'tamed' | 'leave'): Promise<void> {
    const v = this.views[id]!;
    const b = v.beast;
    if (!b) return;
    v.beast = null;
    v.beastData = null;
    await tween(
      b,
      [
        { transform: 'none', opacity: 1 },
        {
          transform: how === 'tamed' ? 'translateY(-60px) scale(.2) rotate(20deg)' : 'scale(.6)',
          opacity: 0,
        },
      ],
      450,
      EASE.in,
    );
    b.remove();
  }

  // ---------- heroes ----------
  private layoutTokens(): void {
    const by = new Map<number, number[]>();
    for (const [seat, node] of this.at) by.set(node, [...(by.get(node) ?? []), seat]);
    for (const [node, seats] of by) {
      const n = this.nodes[node]!;
      seats.forEach((seat, i) => {
        const t = this.heroes.get(seat)!;
        const off = seats.length > 1 ? (i - (seats.length - 1) / 2) * 34 : 0;
        t.style.left = `${n.x + off}px`;
        t.style.top = `${n.y - 6}px`;
      });
    }
  }

  tokenOf(seat: number): HTMLElement | undefined {
    return this.heroes.get(seat);
  }

  /** One hop along a trail: anticipation squash, an arc, a landing squash and a puff of dust. */
  async hop(seat: number, to: number, ms = 300): Promise<void> {
    const t = this.heroes.get(seat)!;
    const from = this.nodes[this.at.get(seat)!]!;
    const n = this.nodes[to]!;
    this.at.set(seat, to);
    const dx = n.x - from.x;
    const dy = n.y - from.y;
    t.style.left = `${n.x}px`;
    t.style.top = `${n.y - 6}px`;
    await tween(
      t,
      [
        { translate: `${-dx}px ${-dy}px`, scale: '1.12 0.88' },
        { translate: `${-dx * 0.5}px ${-dy * 0.5 - 46}px`, scale: '0.95 1.1', offset: 0.5 },
        { translate: '0 0', scale: '1.2 0.8', offset: 0.85 },
        { translate: '0 0', scale: '1 1' },
      ],
      ms,
      'ease-out',
    );
    this.layoutTokens();
    const p = this.toScreen(n.x, n.y);
    this.fx.burst(p.x, p.y + 12, {
      n: 8,
      color: ['#bfa27a', '#8a6b48'],
      speed: 90,
      up: 30,
      g: 200,
      size: 3,
      life: 0.45,
    });
  }

  /** Thrown across the board (portal, swap, the board shifts): vanish, fly, reappear. */
  async throw(seat: number, to: number): Promise<void> {
    const t = this.heroes.get(seat)!;
    await tween(
      t,
      [
        { scale: '1', opacity: 1 },
        { scale: '0.1', opacity: 0, rotate: '200deg' },
      ],
      380,
      EASE.in,
    );
    this.at.set(seat, to);
    this.layoutTokens();
    await this.look(to, this.camS, 500);
    await tween(
      t,
      [
        { scale: '0.1', opacity: 0, rotate: '-200deg' },
        { scale: '1', opacity: 1, rotate: '0deg' },
      ],
      420,
      EASE.pop,
    );
  }

  setOut(seat: number): void {
    this.heroes.get(seat)?.classList.add('out');
  }

  // ---------- the camera ----------
  private applyCam(ms = 0): Promise<void> {
    const W = innerWidth;
    const H = innerHeight;
    // Phones (portrait) get a closer camera: the board is read space by space there, not all at once.
    const s = this.camS * Math.max(Math.min(W / 1280, H / 760), Math.min(W, H) / 640) * 1.25;
    let tx = W / 2 - this.camX * s;
    let ty = H / 2 - this.camY * s + H * 0.03;
    // Close up, keep the board filling the screen (no strip of empty wood beside it — Chief v7 build review).
    if (BOARD_W * s > W) tx = Math.min(24, Math.max(W - BOARD_W * s - 24, tx));
    if (BOARD_H * s > H * 0.8) ty = Math.min(70, Math.max(H - BOARD_H * s - 130, ty));
    const to = `translate(${tx}px, ${ty}px) scale(${s})`;
    if (!ms) {
      this.cam.style.transform = to;
      return Promise.resolve();
    }
    return tween(
      this.cam,
      [{ transform: getComputedStyle(this.cam).transform }, { transform: to }],
      ms,
      EASE.inOut,
    );
  }

  /** Look at a board point with a zoom (1 = close on a hero, ~0.55 = the whole board). */
  look(nodeOrX: number, zoom = 1, ms = 650, y?: number): Promise<void> {
    if (y === undefined) {
      const n = this.nodes[nodeOrX]!;
      this.camX = n.x;
      this.camY = n.y;
    } else {
      this.camX = nodeOrX;
      this.camY = y;
    }
    this.camS = zoom;
    return this.applyCam(ms);
  }

  /** Frame several spaces at once (an unleash crossing the board, a hunt's route). */
  frame(ids: number[], ms = 650): Promise<void> {
    const xs = ids.map((i) => this.nodes[i]!.x);
    const ys = ids.map((i) => this.nodes[i]!.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const zoom = Math.max(0.55, Math.min(1, Math.min(1100 / (maxX - minX + 300), 650 / (maxY - minY + 260))));
    return this.look((minX + maxX) / 2, zoom, ms, (minY + maxY) / 2);
  }

  whole(ms = 800): Promise<void> {
    // The whole board always fits the screen (a phone in portrait needs a smaller zoom than a laptop — QA v7 L8).
    const W = innerWidth;
    const H = innerHeight;
    const base = Math.max(Math.min(W / 1280, H / 760), Math.min(W, H) / 640) * 1.25;
    const fit = Math.min(0.55, (W * 0.96) / (BOARD_W * base), (H * 0.62) / (BOARD_H * base));
    return this.look(BOARD_W / 2, fit, ms, BOARD_H / 2);
  }

  follow(seat: number, ms = 650): Promise<void> {
    return this.look(this.at.get(seat)!, 1, ms);
  }

  /** Board units → screen pixels (for particles and floating labels). */
  toScreen(x: number, y: number): { x: number; y: number } {
    const r = this.plane.getBoundingClientRect();
    return { x: r.left + (x / BOARD_W) * r.width, y: r.top + (y / BOARD_H) * r.height };
  }
  nodeScreen(id: number): { x: number; y: number } {
    const n = this.nodes[id]!;
    return this.toScreen(n.x, n.y);
  }

  /** Walk a creature along a route (a hunt, a wake): it hops space to space. */
  async walkBeast(path: number[], b: Beast): Promise<void> {
    if (!path.length) return;
    let cur = this.views[path[0]!]!.beast;
    if (!cur) {
      this.setBeast(path[0]!, b, true);
      cur = this.views[path[0]!]!.beast;
      await wait(450);
    }
    this.views[path[0]!]!.beast = null;
    this.views[path[0]!]!.beastData = null;
    for (const id of path.slice(1)) {
      const a = this.nodes[Number(cur!.parentElement!.dataset.id)]!;
      const n = this.nodes[id]!;
      this.views[id]!.node.append(cur!);
      await tween(
        cur!,
        [
          { translate: `${a.x - n.x}px ${a.y - n.y}px` },
          { translate: `${(a.x - n.x) / 2}px ${(a.y - n.y) / 2 - 40}px`, offset: 0.5 },
          { translate: '0 0' },
        ],
        380,
        'ease-in-out',
      );
      this.views[id]!.node.classList.add('stomp');
      setTimeout(() => this.views[id]!.node.classList.remove('stomp'), 300);
    }
    const end = path[path.length - 1]!;
    const v = this.views[end]!;
    if (v.beast && v.beast !== cur) {
      v.beast.dataset.grow = String((v.beastData?.grow ?? 0) + 8);
      cur!.remove();
      void pop(v.beast, 0.5);
    } else {
      v.beast = cur;
      v.beastData = b;
    }
  }

  /** The whole board trembles (a flip): the plane shakes and every token jolts. */
  async quake(): Promise<void> {
    this.fx.shake(0.9);
    await tween(
      this.plane,
      [{ filter: 'brightness(1)' }, { filter: 'brightness(.55) saturate(.6)' }, { filter: 'brightness(1)' }],
      1400,
      'ease-in-out',
    );
  }
}
