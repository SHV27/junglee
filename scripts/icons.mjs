// Renders the PWA icons from the game's own procedural art: node scripts/icons.mjs
import { chromium } from '@playwright/test';
const m = await import('../src/client/art/icons.ts');
const url = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
const b = await chromium.launch();
for (const [size, pad, name] of [[192, 0.12, 'icon-192.png'], [512, 0.12, 'icon-512.png'], [512, 0.24, 'maskable-512.png'], [180, 0.12, 'apple-touch-icon.png']]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const inner = size * (1 - 2 * pad);
  await p.setContent(`<body style="margin:0;background:${m.INK.night};width:${size}px;height:${size}px;display:grid;place-items:center">
    <div style="position:relative;width:${inner}px;height:${inner}px">
      <img src="${url(m.tentSvg())}" style="position:absolute;inset:6% 14% 22% 14%;width:72%;height:72%"/>
      <img src="${url(m.climberSvg(0))}" style="position:absolute;left:0;bottom:0;width:38%"/>
      <img src="${url(m.climberSvg(1))}" style="position:absolute;right:0;bottom:0;width:38%"/>
    </div></body>`);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `public/icons/${name}` });
  await p.close();
}
await b.close();
