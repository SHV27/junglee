/** Contact sheets for a watch folder: node scripts/sheet.mjs DIR [cols=3] [perSheet=9] [width=1800] → DIR/sheet-NN.jpg */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [dir, cols = 3, per = 9, W = 1800] = [process.argv[2], ...process.argv.slice(3).map(Number)];
const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d+\.jpg$/.test(f))
  .sort();
const tw = Math.floor(W / cols);
for (let s = 0; s * per < files.length; s++) {
  const chunk = files.slice(s * per, s * per + per);
  const first = await sharp(path.join(dir, chunk[0])).metadata();
  const th = Math.round((tw * first.height) / first.width);
  const rows = Math.ceil(chunk.length / cols);
  const tiles = await Promise.all(
    chunk.map(async (f, i) => ({
      input: await sharp(path.join(dir, f))
        .resize(tw - 6, th - 6)
        .jpeg()
        .toBuffer(),
      left: (i % cols) * tw + 3,
      top: Math.floor(i / cols) * th + 3,
    })),
  );
  const out = path.join(dir, `sheet-${String(s).padStart(2, '0')}.jpg`);
  await sharp({ create: { width: W, height: rows * th, channels: 3, background: '#fff' } })
    .composite(tiles)
    .jpeg({ quality: 78 })
    .toFile(out);
  console.log(out, chunk[0], '…', chunk[chunk.length - 1]);
}
