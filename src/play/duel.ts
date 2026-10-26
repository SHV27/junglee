/**
 * The duel on screen (GDD-v7 §4): the creature bursts in with its TELL (Read the Beast), the cover screen for the secret pick,
 * the clash row by row, and the verdict. The board stays visible but dimmed behind it: you never lose where you are.
 */
import { CARD, ITEM_TEXT, POWER_BONUS, STATS, type Card, type Item, type Stat } from '../game/v7/cards.ts';
import type { Answer, Ask, Beat } from '../game/v7/rules.ts';
import type { Audio } from './audio.ts';
import { EASE, countUp, deliberate, el, esc, pop, readMs, tween, wait, clock } from './anim.ts';
import type { Fx } from './fx.ts';
import { cardEl, cardOfId, type PV } from './hud.ts';
import { ART, SEAT, heroArt } from './look.ts';

type Emerge = Extract<Beat, { t: 'emerge' }>;
type DuelBeat = Extract<Beat, { t: 'duel' }>;
type PickAsk = Extract<Ask, { k: 'pick' }>;

const POWER_STAT: Record<string, number> = { might: 0, speed: 1, brains: 2, weird: 3 };
/** The creature's tell: its signature (biggest) stat. */
export const signature = (c: Card): Stat => c.stats.indexOf(Math.max(...c.stats)) as Stat;
const TELL = ['slams the ground', 'streaks in', 'stares, thinking', 'flickers strangely'];

export class DuelView {
  readonly root = el('div', 'duel');
  private readonly beastWrap = el('div', 'beast');
  private readonly beastImg = el('img');
  private readonly nameEl = el('div', 'beast-name');
  private readonly lineEl = el('div', 'beast-line');
  private readonly stageEl = el('div', 'clash');
  private readonly cover = el('div', 'cover');
  private beastCard: Card | null = null;
  private grow = 0;
  private revealed = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** When this duel's secret pick began (the 15 s timer never restarts when an item is used — QA v7 L6). */
  private pickStart = 0;

  private readonly audio: Audio;
  private readonly fx: Fx;

  constructor(audio: Audio, fx: Fx) {
    this.audio = audio;
    this.fx = fx;
    this.beastWrap.append(el('i', 'beast-glow'), this.beastImg);
    this.root.append(this.beastWrap, this.nameEl, this.lineEl, this.stageEl, this.cover);
  }

  get open(): boolean {
    return this.root.classList.contains('on');
  }

  // ---------- 1. the creature bursts in ----------
  async emerge(b: Emerge, hero: PV, cause: string, anger: number): Promise<void> {
    const card = CARD[b.card]!;
    this.beastCard = card;
    this.grow = b.grow;
    this.revealed = false;
    this.stageEl.innerHTML = '';
    this.cover.className = 'cover';
    this.root.className = 'duel on';
    this.root.style.setProperty('--seat', SEAT[hero.seat]!.color);
    this.beastImg.src = `${ART}${card.id}.webp`;
    this.beastWrap.className = `beast t${card.tier} tell${signature(card)}`;
    this.nameEl.innerHTML = `<small>${esc(cause)}</small>${esc(card.name.toUpperCase())}${anger > 0 ? `<em>ANGER +${anger}</em>` : ''}${b.grow > 0 ? `<em>GREW +${b.grow}</em>` : ''}`;
    this.lineEl.textContent = '';
    this.pickStart = 0;
    for (const e of [this.beastWrap, this.nameEl, this.lineEl]) {
      e.getAnimations().forEach((a) => a.cancel());
      e.style.opacity = '';
      e.style.transform = '';
      e.style.filter = '';
    }
    await tween(this.root, [{ opacity: 0 }, { opacity: 1 }], 300);
    this.audio.setMood('hunt');
    const tell = signature(card);
    // The tell IS the entrance (MIGHT slams, SPEED streaks, BRAINS glows, WEIRD glitches).
    if (tell === 0) {
      await tween(
        this.beastWrap,
        [{ transform: 'translateY(-120vh) scale(1.1)' }, { transform: 'translateY(0) scale(1)' }],
        420,
        EASE.in,
      );
      this.audio.sfx('slam');
      this.fx.shake(0.75);
      const r = this.beastWrap.getBoundingClientRect();
      this.fx.burst(r.left + r.width / 2, r.bottom - 20, {
        n: 50,
        color: ['#8a6b48', '#5a4630', '#c4a77d'],
        speed: 420,
        up: 120,
        g: 600,
        size: 6,
        life: 1,
      });
      await tween(
        this.beastWrap,
        [{ transform: 'scale(1.08, .9)' }, { transform: 'scale(1)' }],
        260,
        EASE.pop,
      );
    } else if (tell === 1) {
      this.audio.sfx('whoosh');
      await tween(
        this.beastWrap,
        [
          { transform: 'translateX(120vw) skewX(-25deg)', filter: 'blur(14px)' },
          { transform: 'translateX(-4vw) skewX(10deg)', filter: 'blur(0)', offset: 0.8 },
          { transform: 'translateX(0) skewX(0)' },
        ],
        520,
        EASE.out,
      );
      const r = this.beastWrap.getBoundingClientRect();
      this.fx.burst(r.right, r.bottom - 30, {
        n: 30,
        color: ['#c4a77d', '#e8d5b0'],
        speed: 300,
        spread: 0.3,
        g: 100,
        size: 4,
        life: 0.7,
      });
    } else if (tell === 2) {
      await tween(
        this.beastWrap,
        [
          { opacity: 0, filter: 'brightness(0)' },
          { opacity: 1, filter: 'brightness(.25)', offset: 0.5 },
          { opacity: 1, filter: 'brightness(1)' },
        ],
        1100,
        'ease-in',
      );
      this.beastWrap.classList.add('eyes');
      this.audio.sfx('reveal');
    } else {
      this.audio.sfx('portal');
      await tween(
        this.beastWrap,
        [
          { opacity: 0, transform: 'skewX(30deg) scaleY(.2)', filter: 'hue-rotate(180deg)' },
          { opacity: 1, transform: 'skewX(-20deg) scaleY(1.2)', filter: 'hue-rotate(90deg)', offset: 0.3 },
          { opacity: 0.4, transform: 'translateX(-30px) skewX(10deg)', offset: 0.5 },
          {
            opacity: 1,
            transform: 'translateX(24px) skewX(-6deg)',
            filter: 'hue-rotate(40deg)',
            offset: 0.7,
          },
          { opacity: 1, transform: 'none', filter: 'none' },
        ],
        800,
        'steps(8, end)',
      );
    }
    this.audio.grunt(card.grunt);
    document.querySelector('.hud .hint')?.classList.remove('on');
    this.lineEl.innerHTML = `“${esc(card.line)}”`;
    void tween(
      this.lineEl,
      [
        { opacity: 0, transform: 'translate(-50%, 10px)' },
        { opacity: 1, transform: 'translate(-50%, 0)' },
      ],
      300,
    );
    await wait(readMs(card.line, 1500));
    this.lineEl.innerHTML = `<span class="tellnote">It ${TELL[tell]}…</span>`;
  }

  // ---------- 2. the cover screen and the secret pick ----------
  pick(ask: PickAsk, hero: PV, firstTime: boolean): Promise<Answer> {
    const d = ask.duel;
    const card = cardOfId(d.card);
    return new Promise((resolve) => {
      const done = (a: Answer) => {
        if (this.keyHandler) removeEventListener('keydown', this.keyHandler);
        this.keyHandler = null;
        clearInterval(timer);
        resolve(a);
      };
      let timer = 0;
      let shownAt = 0;
      let openedAt = performance.now();
      const showCard = () => {
        this.revealed = true;
        shownAt = performance.now();
        this.audio.setMood('pick');
        this.cover.className = 'cover on open';
        const bonus = POWER_STAT[hero.power];
        const c = cardEl(card, { mine: true, bonus: POWER_BONUS, bonusStat: bonus });
        if (d.double) c.classList.add('doubled');
        const peek =
          d.peek && this.beastCard
            ? cardEl({
                ...this.beastCard,
                stats: this.beastCard.stats.map((v) =>
                  Math.min(100, v + this.grow + angerNow()),
                ) as unknown as Card['stats'],
              })
            : null;
        const items = hero.items
          .map((it, i) => {
            const used =
              (it === 'peek' && d.peek) || (it === 'double' && d.double) || (it === 'redraw' && d.redrawn);
            return `<button class="use ${it}" data-item="${it}" ${used ? 'disabled' : ''}><kbd>${'ZXC'[i]}</kbd>${ITEM_TEXT[it].name}<small>${ITEM_TEXT[it].text}</small></button>`;
          })
          .join('');
        this.cover.innerHTML = `
          <div class="secret-head"><img src="${heroArt(hero.hero)}" alt=""><span><b>${hero.hero.toUpperCase()}</b>, your card.</span><span class="timer"><i></i></span></div>
          <div class="secret-body"><div class="mine-slot"></div><div class="versus-slot">${peek ? '<small>PEEK: its real card</small>' : `<img src="${ART}${this.beastCard?.id}.webp" alt=""><b>${esc(this.beastCard?.name ?? '')}</b><span>It ${this.beastCard ? TELL[signature(this.beastCard)] : ''}…</span>`}</div></div>
          <div class="pickrow">${STATS.map((s, i) => `<button class="stat-btn" data-stat="${i}"><kbd>${i + 1}</kbd>${s}</button>`).join('')}</div>
          <div class="items-row">${items}</div>
          <p class="secret-hint">${firstTime ? 'Beat it twice to tame it.' : 'Pick a stat. It picks too.'}</p>`;
        this.cover.querySelector('.mine-slot')!.append(c);
        if (peek) this.cover.querySelector('.versus-slot')!.append(peek);
        void tween(
          c,
          [{ transform: 'rotateY(90deg) scale(.8)' }, { transform: 'rotateY(0) scale(1)' }],
          380,
          EASE.pop,
        );
        this.audio.sfx('flip');
        for (const b of this.cover.querySelectorAll<HTMLButtonElement>('.stat-btn'))
          b.onclick = () => choose(Number(b.dataset.stat) as Stat);
        for (const b of this.cover.querySelectorAll<HTMLButtonElement>('.use'))
          b.onclick = () => !b.disabled && performance.now() - shownAt > 400 && done({ k: 'use', item: b.dataset.item as Item });
        // The soft 15 s timer: the drums speed up; at zero the card's biggest stat is played (owner #60).
        if (!this.pickStart) this.pickStart = performance.now();
        const t0 = this.pickStart;
        const bar = this.cover.querySelector<HTMLElement>('.timer i')!;
        timer = window.setInterval(() => {
          const k = Math.min(1, ((performance.now() - t0) * clock.speed) / (firstTime ? 25000 : 15000));
          bar.style.transform = `scaleX(${1 - k})`;
          this.audio.urgency = k;
          if (k >= 1) {
            const vals = card.stats.map((v, i) => v + (i === bonus ? POWER_BONUS : 0));
            choose(vals.indexOf(Math.max(...vals)) as Stat);
          }
        }, 100);
      };
      const choose = (s: Stat) => {
        this.audio.sfx('choose');
        const b = this.cover.querySelector<HTMLElement>(`.stat-btn[data-stat="${s}"]`);
        b?.classList.add('chosen');
        done({ k: 'stat', stat: s });
      };
      const hand = () => {
        this.cover.className = 'cover on';
        this.cover.innerHTML = `
          <div class="handoff">
            <img src="${heroArt(hero.hero)}" alt="">
            <h2><b style="color:var(--seat)">${hero.hero.toUpperCase()}</b>, only you look.</h2>
            <p>Everyone else: look away!</p>
            <button class="go"><kbd>SPACE</kbd> Show my card</button>
          </div>`;
        const go = this.cover.querySelector<HTMLButtonElement>('.go')!;
        go.classList.add('arming');
        setTimeout(() => go.classList.remove('arming'), 900 / clock.speed);
        go.onclick = () => performance.now() - openedAt > 900 / clock.speed && showCard();
        openedAt = performance.now();
        this.cover.style.opacity = '';
      };
      this.keyHandler = (e: KeyboardEvent) => {
        if (e.repeat) return;
        if (!this.revealed && (e.code === 'Space' || e.code === 'Enter')) {
          e.preventDefault();
          if (deliberate(e, openedAt)) showCard();
          return;
        }
        if (!this.revealed) return;
        // Keys pressed in the instant the card appears belong to the previous screen (a mash), not to this pick.
        if (performance.now() - shownAt < 400) return;
        const n = Number(e.key);
        if (n >= 1 && n <= 4) return choose((n - 1) as Stat);
        const idx = ['KeyZ', 'KeyX', 'KeyC'].indexOf(e.code);
        if (idx >= 0) {
          const b = this.cover.querySelectorAll<HTMLButtonElement>('.use')[idx];
          if (b && !b.disabled) b.click();
        }
      };
      addEventListener('keydown', this.keyHandler);
      if (this.revealed) showCard();
      else hand();
    });
  }

  /** A fallen player secretly picks the creature's stat (they see the creature's real card, never the hero's). */
  pickForCreature(a: Extract<Ask, { k: 'creature' }>, picker: PV, hero: PV): Promise<Stat> {
    const card = CARD[a.beast.card]!;
    return new Promise((resolve) => {
      let timer = 0;
      const done = (s: Stat) => {
        removeEventListener('keydown', key);
        clearInterval(timer);
        this.audio.sfx('choose');
        resolve(s);
      };
      this.audio.setMood('pick');
      this.cover.className = 'cover on open jungle';
      const shown = { ...card, stats: card.stats.map((v) => Math.min(100, v + a.beast.grow + angerNow())) as unknown as Card['stats'] };
      this.cover.innerHTML = `
        <div class="secret-head"><img src="${heroArt(picker.hero)}" alt=""><span><b style="color:${SEAT[picker.seat]!.color}">${picker.hero.toUpperCase()}</b>, pick for the ${esc(card.name)}.</span><span class="timer"><i></i></span></div>
        <div class="secret-body"><div class="mine-slot"></div></div>
        <div class="pickrow">${STATS.map((st, i) => `<button class="stat-btn" data-stat="${i}"><kbd>${i + 1}</kbd>${st}</button>`).join('')}</div>
        <p class="secret-hint">Beat ${esc(hero.hero.toUpperCase())}. You cannot see their card.</p>`;
      this.cover.querySelector('.mine-slot')!.append(cardEl(shown));
      for (const b of this.cover.querySelectorAll<HTMLButtonElement>('.stat-btn')) b.onclick = () => done(Number(b.dataset.stat) as Stat);
      const shownAt = performance.now();
      const key = (e: KeyboardEvent) => {
        if (e.repeat || performance.now() - shownAt < 400) return;
        const n = Number(e.key);
        if (n >= 1 && n <= 4) done((n - 1) as Stat);
      };
      addEventListener('keydown', key);
      const t0 = performance.now();
      const bar = this.cover.querySelector<HTMLElement>('.timer i')!;
      timer = window.setInterval(() => {
        const k = Math.min(1, ((performance.now() - t0) * clock.speed) / 15000);
        bar.style.transform = `scaleX(${1 - k})`;
        this.audio.urgency = k;
        if (k >= 1) done(a.fallback);
      }, 100);
    });
  }

  /** "Picked." — the card hides at once; the table may look again. */
  async picked(hero: PV, forCreature = false): Promise<void> {
    this.audio.setMood('silent');
    this.cover.className = 'cover on';
    this.cover.innerHTML = `<div class="handoff small"><h2><b style="color:${SEAT[hero.seat]!.color}">${hero.hero.toUpperCase()}</b> ${forCreature ? 'has picked for the creature' : 'has picked'}.</h2><p>Everyone, look!</p></div>`;
    await wait(750);
    await tween(this.cover, [{ opacity: 1 }, { opacity: 0 }], 200);
    this.cover.className = 'cover';
    this.revealed = false;
  }

  // ---------- 3. the clash ----------
  async clash(b: DuelBeat, hero: PV): Promise<void> {
    const mine = cardOfId(b.card);
    const its = CARD[b.beast]!;
    const anger = angerNow();
    const mineEl = cardEl(mine, { mine: true, bonus: POWER_BONUS, bonusStat: POWER_STAT[hero.power] });
    if (b.double) mineEl.classList.add('doubled');
    const itsEl = cardEl(its, { hidden: true });
    this.stageEl.innerHTML = '';
    const left = el('div', 'side you');
    left.append(el('div', 'side-name', `<small style="color:${SEAT[hero.seat]!.color}">${hero.hero.toUpperCase()}'S</small>${esc(mine.name.toUpperCase())}`), mineEl);
    const right = el('div', 'side it');
    right.append(el('div', 'side-name', `<small>THE CREATURE</small>${esc(its.name.toUpperCase())}`), itsEl);
    const vs = el('div', 'vs', 'VS');
    this.stageEl.append(left, vs, right);
    this.root.classList.add('clashing');
    // QA v7 M2: the cards are the only subject now (inline, because the entrance animation left inline styles).
    this.beastWrap.style.opacity = '0';
    this.nameEl.style.opacity = '0';
    this.lineEl.style.opacity = '0';
    await Promise.all([
      tween(left, [{ transform: 'translateX(-60vw) rotate(-12deg)' }, { transform: 'none' }], 480, EASE.out),
      tween(right, [{ transform: 'translateX(60vw) rotate(12deg)' }, { transform: 'none' }], 480, EASE.out),
    ]);
    this.audio.sfx('slam');
    this.fx.shake(0.35);
    void pop(vs, 0.6);
    // The creature thinks, then slams its pick.
    await wait(400);
    const stamp = (cardNode: HTMLElement, s: number, who: string) => {
      const li = cardNode.querySelector(`li[data-s="${s}"]`);
      if (!li) return;
      li.classList.add('called');
      const tag = el('b', 'stamp', who);
      li.append(tag);
      void tween(
        tag,
        [
          { transform: 'scale(2.4) rotate(-14deg)', opacity: 0 },
          { transform: 'scale(1) rotate(-6deg)', opacity: 1 },
        ],
        260,
        EASE.in,
      );
    };
    stamp(mineEl, b.pick, 'YOU');
    this.audio.sfx('card');
    // A held breath: the creature's eyes go to its stat before the IT stamp lands.
    itsEl.querySelector(`li[data-s="${b.itsPick}"]`)?.classList.add('eyeing');
    await wait(750);
    stamp(itsEl, b.itsPick, 'IT');
    if (b.itsPick !== b.pick) {
      stamp(mineEl, b.itsPick, 'IT');
      stamp(itsEl, b.pick, 'YOU');
    }
    this.audio.sfx('slam');
    await wait(400);
    if (b.pick === b.itsPick) {
      await this.flash('SAME PICK!');
    }
    // Row by row: the numbers count up together; the winner swells, the loser cracks.
    this.audio.setMood('silent');
    for (const row of b.rows) {
      const mLi = mineEl.querySelector<HTMLElement>(`li[data-s="${row.stat}"]`)!;
      const iLi = itsEl.querySelector<HTMLElement>(`li[data-s="${row.stat}"]`)!;
      mLi.classList.add('live');
      iLi.classList.add('live');
      const mEm = mLi.querySelector('em') as HTMLElement;
      const iEm = iLi.querySelector('em') as HTMLElement;
      iLi.querySelector('i')!.setAttribute('style', `--v:${Math.min(1, row.it / 100)}`);
      await Promise.all([
        countUp(mEm, 0, row.you, 850, (i) => this.audio.sfx('count', i)),
        countUp(iEm, 0, row.it, 850),
      ]);
      if (row.res === 'W') {
        this.audio.sfx('win');
        mLi.classList.add('won');
        iLi.classList.add('lost');
        void pop(mLi, 0.5);
      } else if (row.res === 'L') {
        this.audio.sfx('heart');
        iLi.classList.add('won');
        mLi.classList.add('lost');
        void pop(iLi, 0.5);
      } else {
        mLi.classList.add('tie');
        iLi.classList.add('tie');
      }
      await wait(450);
    }
    void anger;
    // Reveal the rest of its card (what was it, really?).
    itsEl.querySelectorAll<HTMLElement>('li').forEach((li, i) => {
      const em = li.querySelector('em')!;
      if (em.textContent === '?') em.textContent = String(Math.min(100, its.stats[i]! + b.grow + angerNow()));
      li.querySelector('i')!.setAttribute('style', `--v:${Math.min(1, Number(em.textContent) / 100)}`);
    });
  }

  private async flash(text: string): Promise<void> {
    const f = el('div', 'flashword', text);
    this.root.append(f);
    await tween(
      f,
      [
        { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      ],
      280,
      EASE.in,
    );
    await wait(700);
    await tween(f, [{ opacity: 1 }, { opacity: 0 }], 250);
    f.remove();
  }

  // ---------- 4. the verdict ----------
  async verdict(kind: 'tamed' | 'lost' | 'safe' | 'standoff', title: string, why: string, gloat = ''): Promise<void> {
    const v = el(
      'div',
      `verdict ${kind}`,
      `<h2>${esc(title)}</h2>${gloat ? `<q>${esc(gloat)}</q>` : ''}<p>${esc(why)}</p>`,
    );
    this.root.append(v);
    // The punchline: on a loss or standoff the creature steps back in to gloat (the cards dim behind the verdict).
    if (kind === 'lost' || kind === 'standoff') {
      this.beastWrap.style.opacity = '1';
      this.stageEl.style.opacity = '0.3';
    }
    if (kind === 'tamed') {
      this.audio.sfx('tame');
      this.fx.burst(innerWidth / 2, innerHeight * 0.45, {
        n: 90,
        color: ['#ffd27a', '#f2a93b', '#fff4d6', '#3dff8a'],
        speed: 520,
        up: 160,
        g: 380,
        size: 5,
        life: 1.4,
      });
      void tween(
        this.beastWrap,
        [
          { transform: 'none', opacity: 1 },
          { transform: 'translate(-30vw, 40vh) scale(.1) rotate(-30deg)', opacity: 0 },
        ],
        800,
        EASE.in,
      );
    } else if (kind === 'lost') {
      this.audio.sfx('shatter');
      this.fx.shake(0.8);
      this.root.classList.add('hurt');
      void tween(
        this.beastWrap,
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.18) translateY(-10px)' },
          { transform: 'scale(1.05)' },
        ],
        500,
        EASE.pop,
      );
    } else if (kind === 'standoff') {
      this.audio.sfx('standoff');
      void tween(
        this.beastWrap,
        [
          { transform: 'scale(1)', filter: 'none' },
          { transform: 'scale(1.15)', filter: 'drop-shadow(0 0 30px #ff3b30)' },
        ],
        700,
        EASE.pop,
      );
    } else this.audio.sfx('item');
    await tween(
      v,
      [
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      ],
      420,
      EASE.out,
    );
    await wait(readMs(title + why + gloat, 1900) - 300);
    await tween(v, [{ opacity: 1 }, { opacity: 0 }], 250);
    v.remove();
    this.root.classList.remove('hurt');
    this.stageEl.style.opacity = '';
  }

  async close(): Promise<void> {
    await tween(this.root, [{ opacity: 1 }, { opacity: 0 }], 350);
    this.root.className = 'duel';
    this.root.classList.remove('clashing');
    this.stageEl.innerHTML = '';
    this.beastWrap.classList.remove('eyes');
  }
}

/** The jungle's anger right now (set by the director every meter notch). */
let ANGER = 0;
export const setAnger = (a: number): void => void (ANGER = a);
const angerNow = () => ANGER;
