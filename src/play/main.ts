/**
 * JUNGLEE v7 — THE CURSED GAME. Boot, the lobby (how many players?), the luck deal of heroes and powers, the match, the crowning
 * with the story recap, and AGAIN. Hot-seat: everything is a big button with its key on it (mouse, touch and keyboard).
 * Review hooks (never on the default path): ?seed=N · ?speed=N · ?players=N (skip the lobby) · ?auto=1 (the review hand presses
 * the keys itself, for the 1× watch and e2e) · ?mute=1.
 */
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/700.css';
import './style.css';
import { POWER_TEXT } from '../game/v7/cards.ts';
import { createGame } from '../game/v7/rules.ts';
import { EASE, clock, el, esc, pop, tween, wait } from './anim.ts';
import { Audio } from './audio.ts';
import { Director, type Result } from './director.ts';
import { Fx } from './fx.ts';
import { ART, SEAT, heroArt } from './look.ts';
import { startAuto } from './auto.ts';

const q = new URLSearchParams(location.search);
clock.speed = Math.max(0.25, Number(q.get('speed') ?? 1));
const app = document.getElementById('app')!;
const fxCanvas = el('canvas', 'fx') as HTMLCanvasElement;
document.body.append(fxCanvas);
const fx = new Fx(fxCanvas);
const audio = new Audio();
let muted = q.get('mute') === '1' || localStorageGet('junglee-mute') === '1';
audio.setMuted(muted);

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function localStorageSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

// Sound unlocks on the first gesture; SPACE / a tap also skips a beat once its reading time has passed.
const unlock = () => audio.unlock();
addEventListener('pointerdown', unlock);
addEventListener('keydown', (e) => {
  unlock();
  if (e.code === 'Space') clock.skipAt = performance.now();
  if (e.code === 'KeyM' && !e.repeat && !document.body.classList.contains('typing')) toggleMute();
});
addEventListener('pointerdown', (e) => {
  // A tap skips a beat once it has been read — but never the sound button (QA v7 L6).
  if (!(e.target as HTMLElement | null)?.closest?.('.mute')) clock.skipAt = performance.now();
});

const muteBtn = el('button', 'mute', '♪');
muteBtn.title = 'Sound on/off (M)';
muteBtn.onclick = (e) => {
  e.stopPropagation();
  toggleMute();
};
document.body.append(muteBtn);
function toggleMute(): void {
  muted = !muted;
  audio.setMuted(muted);
  muteBtn.classList.toggle('off', muted);
  localStorageSet('junglee-mute', muted ? '1' : '0');
}
muteBtn.classList.toggle('off', muted);

const probe: Record<string, unknown> = { screen: 'boot' };
(window as unknown as { __junglee: typeof probe }).__junglee = probe;

// ---------- preload the art ----------
async function preload(): Promise<void> {
  const bar = document.querySelector<HTMLElement>('#loading .bar i');
  const ids = [
    'key',
    'board',
    'back',
    'bg-1',
    'bg-2',
    'bg-3',
    'hero-explorer',
    'hero-hunter',
    'hero-pilot',
    'hero-scientist',
  ];
  let done = 0;
  await Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((ok) => {
          const i = new Image();
          i.onload = i.onerror = () => {
            done++;
            if (bar) bar.style.transform = `scaleX(${done / ids.length})`;
            ok();
          };
          i.src = `${ART}${id}.webp`;
        }),
    ),
  );
}

// ---------- the lobby ----------
function lobby(): Promise<number> {
  probe.screen = 'lobby';
  audio.setMood('calm');
  return new Promise((resolve) => {
    const l = el('section', 'lobby');
    l.innerHTML = `
      <div class="key" style="background-image:url(${ART}key.webp)"></div>
      <div class="lobby-in">
        <h1 class="logo">JUNGLEE</h1>
        <p class="sub">The cursed game. One laptop. Last one alive wins.</p>
        <ol class="howto">
          <li><b>Draw a fate card</b> and obey it.</li>
          <li><b>Step into the fog.</b> Something lives there.</li>
          <li><b>Duel it, trump-card style:</b> pick MIGHT, SPEED, BRAINS or WEIRD in secret.</li>
          <li><b>Three hearts.</b> No healing. The fallen become the jungle.</li>
        </ol>
        <p class="ask">How many players?</p>
        <div class="seats">${[2, 3, 4].map((n) => `<button class="seatbtn" data-n="${n}"><kbd>${n}</kbd>${n} players</button>`).join('')}</div>
        <p class="fine">Pass the laptop for secret picks. Sound on, lights low.</p>
      </div>`;
    app.append(l);
    void tween(
      l.querySelector('.lobby-in')!,
      [
        { opacity: 0, transform: 'translateY(20px)' },
        { opacity: 1, transform: 'none' },
      ],
      700,
      EASE.out,
    );
    const done = (n: number) => {
      removeEventListener('keydown', key);
      audio.sfx('choose');
      void tween(l, [{ opacity: 1 }, { opacity: 0 }], 350).then(() => l.remove());
      resolve(n);
    };
    for (const b of l.querySelectorAll<HTMLButtonElement>('.seatbtn'))
      b.onclick = () => done(Number(b.dataset.n));
    const key = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 2 && n <= 4) done(n);
    };
    addEventListener('keydown', key);
  });
}

// ---------- the luck deal (owner #38: heroes with powers, but we don't choose; it's luck) ----------
async function deal(seed: number, seats: number): Promise<void> {
  probe.screen = 'deal';
  const g = createGame(seed, seats);
  const d = el('section', 'deal');
  d.innerHTML = `<h2>The game deals your heroes…</h2><div class="dealt"></div><button class="go"><kbd>SPACE</kbd> Open the game</button>`;
  app.append(d);
  const row = d.querySelector('.dealt')!;
  for (const p of g.players) {
    const c = el('div', 'herocard');
    c.style.setProperty('--seat', SEAT[p.seat]!.color);
    c.innerHTML = `<div class="hc-back" style="background-image:url(${ART}back.webp)"></div>
      <div class="hc-front"><img src="${heroArt(p.hero)}" alt=""><b>${esc(p.hero.toUpperCase())}</b>
      <span class="pw">${esc(POWER_TEXT[p.power].name)}</span><small>${esc(POWER_TEXT[p.power].text)}</small>
      <em>Player ${p.seat + 1}</em></div>`;
    row.append(c);
    audio.sfx('card');
    await tween(
      c,
      [
        { transform: 'translateY(-60vh) rotate(-25deg)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      480,
      EASE.out,
    );
    await wait(180);
    c.classList.add('flipped');
    audio.sfx('flip');
    await wait(520);
    void pop(c, 0.3);
  }
  await new Promise<void>((ok) => {
    const go = d.querySelector<HTMLButtonElement>('.go')!;
    go.classList.add('on');
    const done = () => {
      removeEventListener('keydown', key);
      ok();
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') done();
    };
    go.onclick = done;
    addEventListener('keydown', key);
  });
  audio.sfx('reveal');
  await tween(d, [{ opacity: 1 }, { opacity: 0 }], 400);
  d.remove();
}

// ---------- the match ----------
async function match(seed: number, seats: number): Promise<Result> {
  probe.screen = 'match';
  const dir = new Director(seed, seats, audio, fx);
  probe.director = dir.probe;
  probe.game = dir.g;
  app.append(dir.root);
  await tween(dir.root, [{ opacity: 0 }, { opacity: 1 }], 500);
  const r = await dir.run();
  await wait(600);
  dir.root.remove();
  document.body.classList.remove('stormy');
  fx.setAmbient(0);
  return r;
}

// ---------- the crowning + the story recap ----------
function crowning(r: Result): Promise<'again' | 'new'> {
  probe.screen = 'crown';
  audio.setMood('off');
  audio.sfx('crown');
  const w = r.players[r.winner]!;
  // The recap: the biggest moments (no repeats), told in the order they happened (QA v7 M5).
  const seen = new Set<string>();
  const story = [...r.story]
    .sort((a, b) => b.weight - a.weight)
    .filter((s) => !seen.has(s.text) && seen.add(s.text))
    .slice(0, 6)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return new Promise((resolve) => {
    const c = el('section', 'crown');
    c.style.setProperty('--seat', SEAT[w.seat]!.color);
    c.innerHTML = `
      <div class="crown-hero"><img src="${heroArt(w.hero)}" alt=""></div>
      <div class="crown-in">
        <small>The jungle releases…</small>
        <h1>${esc(w.hero.toUpperCase())}</h1>
        <p class="crown-sub">Player ${w.seat + 1} · ${w.hearts} ${w.hearts === 1 ? 'heart' : 'hearts'} left · ${w.deck} ${w.deck === 1 ? 'card' : 'cards'} · ${r.turns} turns</p>
        <ol class="recap">${story.map((s) => `<li>${s.img ? `<img src="${ART}${s.img}.webp" alt="">` : '<i></i>'}<span>${esc(s.text)}</span></li>`).join('')}</ol>
        <div class="crown-btns"><button class="again"><kbd>SPACE</kbd> Again</button><button class="new"><kbd>N</kbd> New table</button></div>
      </div>`;
    app.append(c);
    for (let i = 0; i < 6; i++)
      setTimeout(
        () =>
          fx.burst(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * 0.3, {
            n: 40,
            color: ['#ffd27a', '#f2a93b', SEAT[w.seat]!.color, '#fff4d6'],
            speed: 480,
            up: 200,
            g: 420,
            size: 5,
            life: 1.6,
          }),
        i * 350,
      );
    void tween(
      c.querySelector('.crown-in')!,
      [
        { opacity: 0, transform: 'translateY(30px)' },
        { opacity: 1, transform: 'none' },
      ],
      800,
      EASE.out,
    );
    c.querySelectorAll('.recap li').forEach(
      (li, i) =>
        void tween(
          li,
          [
            { opacity: 0, transform: 'translateX(-30px)' },
            { opacity: 1, transform: 'none' },
          ],
          450,
          EASE.out,
          900 + i * 450,
        ),
    );
    const done = (x: 'again' | 'new') => {
      removeEventListener('keydown', key);
      void tween(c, [{ opacity: 1 }, { opacity: 0 }], 400).then(() => c.remove());
      resolve(x);
    };
    const t0 = performance.now();
    const key = (e: KeyboardEvent) => {
      if (performance.now() - t0 < 2500 / clock.speed) return; // let the recap be read
      if (e.code === 'Space' || e.code === 'Enter') done('again');
      if (e.code === 'KeyN') done('new');
    };
    c.querySelector<HTMLButtonElement>('.again')!.onclick = () => done('again');
    c.querySelector<HTMLButtonElement>('.new')!.onclick = () => done('new');
    addEventListener('keydown', key);
  });
}

// ---------- boot ----------
async function boot(): Promise<void> {
  await preload();
  document.getElementById('loading')?.remove();
  if (q.get('auto') === '1') startAuto(probe);
  let seats = Number(q.get('players') ?? 0);
  let seed = Number(q.get('seed') ?? Date.now() % 1e9);
  for (;;) {
    if (!(seats >= 2 && seats <= 4)) seats = await lobby();
    await deal(seed, seats);
    const r = await match(seed, seats);
    const next = await crowning(r);
    seed = (seed * 7 + 13) % 1e9;
    if (next === 'new') seats = 0;
  }
}
void boot();
