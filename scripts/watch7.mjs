/**
 * The v7 watch: a real browser plays a whole match with the review hand (?auto=1) pressing real keys, and saves a frame every
 * `every` seconds plus the console. A GATE (CLAUDE.md): look at every frame before reporting any test count.
 *   node scripts/watch7.mjs [seconds=120] [seed=7] [speed=1] [players=4] [every=2] [w=1366] [h=768]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [secs = 120, seed = 7, speed = 1, players = 4, every = 2, w = 1366, h = 768] = process.argv
  .slice(2)
  .map(Number);
const out = `tests/artifacts/v7/watch-s${seed}`;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const url = process.env.URL ?? 'http://localhost:5173/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const logs = [];
p.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
p.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`));
p.on('requestfailed', (r) => logs.push(`FAILED: ${r.url()}`));
await p.goto(`${url}?auto=1&seed=${seed}&speed=${speed}&players=${players}&mute=1`);
const t0 = Date.now();
let i = 0;
while ((Date.now() - t0) / 1000 < secs) {
  await p.waitForTimeout(every * 1000);
  const state = await p.evaluate(() => {
    const j = window.__junglee;
    return {
      screen: j?.screen,
      beat: j?.director?.beat,
      ask: j?.director?.ask?.k ?? null,
      turns: j?.game?.turns,
      winner: j?.game?.winner,
      time: j?.director?.time,
    };
  });
  await p.screenshot({ path: `${out}/${String(i).padStart(3, '0')}.jpg`, quality: 70, type: 'jpeg' });
  logs.push(`[${i}] t=${((Date.now() - t0) / 1000).toFixed(0)}s ${JSON.stringify(state)}`);
  i++;
  if (state.screen === 'crown' && i > 3) {
    const t = Object.entries(state.time ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}s`);
    logs.push(`TIME (1x seconds, ${state.turns} turns): ${t.join(' · ')}`);
    console.log(logs[logs.length - 1]);
    break;
  }
}
fs.writeFileSync(`${out}/log.txt`, logs.join('\n'));
console.log(
  logs
    .filter((l) => /error|FAILED/i.test(l))
    .slice(0, 20)
    .join('\n') || 'no errors',
);
console.log(`${i} frames → ${out}`);
await b.close();
