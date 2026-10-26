import { expect, test, type Page } from '@playwright/test';

/** Journeys on the production build with real key presses and real taps. Zero console errors is part of every journey. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));
  return errors;
}
const screen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __junglee?: { screen?: string } }).__junglee?.screen);

test('a person opens the link, picks 2 players by key, the heroes are dealt, the game opens on the board', async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  await page.goto('/?mute=1');
  await expect(page.locator('.lobby .logo')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.howto li')).toHaveCount(4);
  await page.screenshot({ path: `tests/artifacts/v7/e2e/${info.project.name}-lobby.png` });
  if (info.project.name === 'laptop') await page.keyboard.press('2');
  else await page.locator('.seatbtn[data-n="2"]').tap();
  await expect(page.locator('.herocard')).toHaveCount(2);
  await expect(page.locator('.deal .go.on')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `tests/artifacts/v7/e2e/${info.project.name}-deal.png` });
  if (info.project.name === 'laptop') await page.keyboard.press('Space');
  else await page.locator('.deal .go').tap();
  await expect(page.locator('.meter')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.plate')).toHaveCount(2);
  await expect(page.locator('.fatecard')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `tests/artifacts/v7/e2e/${info.project.name}-fate.png` });
  // Nothing is wider than the screen (no horizontal scroll at any size).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('the secret pick by hand: the cover screen hides the card until SPACE, then a number key picks', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'laptop', 'keyboard journey');
  const errors = watchErrors(page);
  // Seed 7, 4 players: the very first turn walks into a creature.
  await page.goto('/?players=4&seed=7&mute=1&speed=3');
  await expect(page.locator('.deal .go.on')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Space');
  // QA v7 H1: someone mashes SPACE (every 150 ms) all the way into the cover screen and for 2 s on it — the card never opens.
  let onGate = 0;
  for (let i = 0; i < 400 && onGate < 14; i++) {
    if (await page.locator('.forkbtn').first().isVisible()) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    if (await page.locator('.cover .handoff .go').isVisible()) onGate++;
    await page.waitForTimeout(150);
  }
  await expect(page.locator('.cover .handoff')).toContainText('only you look');
  await expect(page.locator('.cover .tcard')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.keyboard.press('Space');
  await expect(page.locator('.cover .tcard.mine')).toBeVisible();
  await page.screenshot({ path: 'tests/artifacts/v7/e2e/secret-pick.png' });
  await page.waitForTimeout(600);
  await page.keyboard.press('1');
  await expect(page.locator('.clash .side.it')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.verdict')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'tests/artifacts/v7/e2e/verdict.png' });
  expect(errors).toEqual([]);
});

test('a whole match plays to the crowning (review hand), and AGAIN deals a new game', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'tablet', 'covered by laptop and phone');
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await page.goto('/?players=2&seed=11&mute=1&auto=1&speed=6');
  await expect.poll(() => screen(page), { timeout: 840_000, intervals: [2000] }).toBe('crown');
  await expect(page.locator('.crown h1')).toBeVisible();
  await expect(page.locator('.recap li').first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `tests/artifacts/v7/e2e/${info.project.name}-crown.png` });
  await expect.poll(() => screen(page), { timeout: 60_000 }).toBe('deal');
  expect(errors).toEqual([]);
});
