/**
 * The hard creatures (anatomy SDXL gets wrong: three heads on one body, one eye, snake hair) with FLUX.1 [schnell] (Apache-2.0)
 * on a public Hugging Face Space. Uses the owner's own Hugging Face login if HF_TOKEN is set in the shell (never printed or stored).
 *   HF_TOKEN=... node scripts/gen-flux.mjs id[:seed] ...   → assets/art-src/<id>-<take>.webp (takes 0 and 1 overwritten)
 */
import fs from 'node:fs';

const S = 'https://evalstate-flux1-schnell.hf.space';
const H = {
  'Content-Type': 'application/json',
  ...(process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {}),
};
const STYLE =
  'fantasy trading card creature art, dramatic rim light, rich oil painting texture, highly detailed, cinematic, isolated on a plain flat light grey background, whole body visible, centered, no text';
export const FLUX_PROMPTS = {
  fenrir:
    'Full body painting of Fenrir, a colossal grey wolf from Norse myth on all four paws, a real wolf animal, glowing yellow eyes, broken iron chains hanging from its neck, snarling',
  cerberus:
    'Full body painting of Cerberus, a single huge black hound with exactly three snarling dog heads growing from one body, fiery eyes, spiked collars, chains',
  medusa:
    'Full body painting of Medusa the gorgon, her hair is made of many live green snakes writhing and hissing, pale green skin, glowing golden eyes, ancient Greek robes',
  cyclops:
    'Full body painting of a cyclops giant with one single huge eye in the centre of his forehead, a brutish muscular giant in a loincloth holding a boulder',
  yali: 'Full body painting of a yali, a mythical temple guardian beast from South Indian temples, a lion body on four legs with an elephant trunk and tusks, ornate golden jewellery',
  makara:
    'Full body painting of a makara, a mythical sea beast from Indian legend, front half a crocodile with a curled elephant trunk, back half a huge fish tail, splashing water',
};

async function gen(prompt, seed) {
  const r = await fetch(`${S}/gradio_api/call/infer`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ data: [`${prompt}, ${STYLE}`, seed, false, 768, 1024, 4] }),
  });
  const { event_id } = await r.json();
  const t = await (await fetch(`${S}/gradio_api/call/infer/${event_id}`, { headers: H })).text();
  const u = t.match(/"url": "([^"]+)"/)?.[1];
  if (!u) throw new Error(t.slice(0, 160));
  return Buffer.from(await (await fetch(u, { headers: H })).arrayBuffer());
}

for (const arg of process.argv.slice(2)) {
  const [id, s = '7'] = arg.split(':');
  for (const take of [0, 1]) {
    fs.writeFileSync(
      `assets/art-src/${id}-${take}.webp`,
      await gen(FLUX_PROMPTS[id], Number(s) + take * 101),
    );
    console.log('flux', id, take);
  }
  const flux = new Set(
    JSON.parse(
      fs.existsSync('assets/art-src/flux.json')
        ? fs.readFileSync('assets/art-src/flux.json', 'utf8')
        : '["key"]',
    ),
  );
  flux.add(id);
  fs.writeFileSync('assets/art-src/flux.json', JSON.stringify([...flux]));
}
