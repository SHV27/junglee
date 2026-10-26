/**
 * The review hand (?auto=1 only — never on the default path; the owner's law #70 is NO BOTS in the game). It presses the same
 * keys a person would, with a person's pauses, so the 1× watch and the e2e journeys exercise the real UI.
 */
import { clock } from './anim.ts';

const press = (code: string, key = code.replace(/^Key|^Digit/, '')) => {
  dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }));
  dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
};
const visible = (sel: string) => {
  const e = document.querySelector<HTMLElement>(sel);
  return !!e && e.offsetParent !== null;
};

export function startAuto(probe: Record<string, unknown>): void {
  let busyUntil = 0;
  setInterval(() => {
    const now = performance.now();
    if (now < busyUntil) return;
    const later = (ms: number, fn: () => void) => {
      busyUntil = now + ms / clock.speed + 200;
      setTimeout(fn, ms / clock.speed);
    };
    if (probe.screen === 'lobby') return later(2500, () => press('Digit4', '4'));
    if (visible('.deal .go.on')) return later(1800, () => press('Space', ' '));
    if (visible('.crown .again')) return later(6000, () => press('Space', ' '));
    if (visible('.gate .go') || visible('.handoff .go')) return later(1400, () => press('Space', ' '));
    if (visible('.cover.open .stat-btn')) {
      const n = 1 + Math.floor(Math.random() * 4);
      // Sometimes use an item first (like a person would).
      if (visible('.cover.open .use:not([disabled])') && Math.random() < 0.35)
        return later(2200, () => press('KeyZ', 'z'));
      return later(2800 + Math.random() * 2500, () => press(`Digit${n}`, String(n)));
    }
    if (visible('.chooser .face')) return later(1600, () => press('Digit1', '1'));
    if (visible('.forkbtn'))
      return later(1300, () => press(Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight'));
  }, 120);
}
