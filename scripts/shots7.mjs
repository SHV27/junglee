/**
 * README screenshots of the real build: a browser plays with the review hand and snaps each moment the first time it appears.
 *   node scripts/shots7.mjs [seed=7] [players=4]    (dev server on :5173, or URL=...) → docs/screenshots/*.jpg
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [seed = 7, players = 4] = process.argv.slice(2).map(Number);
const url = process.env.URL ?? 'http://localhost:5173/';
const out = 'docs/screenshots';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
if (!ONLY) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();

// Laptop: the lobby by hand, then a match with the review hand.
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${url}?mute=1`);
await p.waitForSelector('.lobby .seatbtn');
await p.waitForTimeout(1200);
if (!ONLY || ONLY.has('lobby')) await p.screenshot({ path: `${out}/lobby.jpg`, quality: 82, type: 'jpeg' });

const moments = [
  ['deal', '.deal .go.on'],
  ['turn', '.turnbanner'],
  ['fate', '.fatecard.flipped'],
  ['fork', '.forkbtn'],
  ['creature', '.duel.on:not(.clashing) .beast-line:has-text("“")'],
  ['handoff', '.cover .handoff .go'],
  ['secret', '.cover.open .stat-btn'],
  ['clash', '.clash .stats li.won'],
  ['verdict', '.verdict'],
  ['flip', '.bigcard .verse h2'],
  ['storm', 'body.stormy .board, body.stormy .plates'],
  ['crowning', '.crown .recap li:nth-child(4)'],
];
await p.goto(`${url}?auto=1&seed=${seed}&speed=${process.env.SPEED ?? 1.5}&players=${players}&mute=1`);
const taken = new Set(ONLY ? moments.map(([n]) => n).filter((n) => !ONLY.has(n)) : []);
const t0 = Date.now();
while (taken.size < moments.length && Date.now() - t0 < 25 * 60_000) {
  for (const [name, sel] of moments) {
    if (taken.has(name)) continue;
    if (
      await p
        .locator(sel)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await p.waitForTimeout(name === 'crowning' ? 1500 : name === 'clash' ? 250 : 450);
      await p.screenshot({ path: `${out}/${name}.jpg`, quality: 82, type: 'jpeg' });
      taken.add(name);
      console.log('shot', name, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  await p.waitForTimeout(150);
}

// Phone: the board mid-match.
const ph = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ph.goto(`${url}?auto=1&seed=${seed + 1}&speed=2&players=3&mute=1`);
await ph.waitForSelector('.fatecard.flipped', { timeout: 60_000 });
await ph.waitForTimeout(500);
await ph.screenshot({ path: `${out}/phone.jpg`, quality: 80, type: 'jpeg' });
console.log(errors.length ? errors.join('\n') : 'no errors', `· ${taken.size}/${moments.length} moments`);
await b.close();
