/** Cut out every picked take that is not in public/art yet: node scripts/cut-picks.mjs (needs python + scripts/cut-art.py). */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const picks = JSON.parse(fs.readFileSync('assets/art-src/picks.json', 'utf8'));
const args = [];
for (const [id, take] of Object.entries(picks)) {
  const out = `public/art/${id}.webp`;
  const src = `assets/art-src/${id}-${take}.webp`;
  if (!fs.existsSync(out) && fs.existsSync(src)) args.push(src, out);
}
if (args.length) execFileSync('python', ['scripts/cut-art.py', ...args], { stdio: 'inherit' });
console.log(`cut ${args.length / 2}`);
