import { test, expect } from '@playwright/test';
test('solo opening teaches a real dash landing after the vote', async ({ page }) => {
  await page.goto('/');
  await page.locator('.training-link').click();
  await expect(page.locator('.local-player')).toHaveText('إنت');
  await expect(page.locator('.reveal-overlay')).toBeVisible();
  await expect(page.locator('.arena-message')).toContainText('ناحية اليمين');
  await page.keyboard.press('Space');
  await expect(page.locator('.action-feedback')).toHaveText('عدّيت الفجوة!');
  await page.locator('.arena-panel').screenshot({ path: 'test-results/tile-arena.png' });
});
test('two guests finish all three games, save results and rematch', async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    }),
    host = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [];
  host.on('pageerror', (e) => errors.push(e.message));
  guest.on('pageerror', (e) => errors.push(e.message));
  await host.goto('/');
  await host.screenshot({ path: 'test-results/desktop-home.png', fullPage: true });
  await host.getByRole('button', { name: 'Switch language' }).click();
  await expect(host.getByRole('button', { name: 'Server connected' })).toBeVisible();
  await host.getByRole('button', { name: 'Create a room', exact: true }).click();
  await host.getByLabel('Your nickname').fill('Omar');
  await host.getByRole('button', { name: 'Let’s go' }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}/);
  const url = host.url();
  await guest.goto(url);
  await guest.getByLabel('اسمك في الأوضة').fill('نور');
  await guest.getByRole('button', { name: 'ادخل الأوضة', exact: true }).click();
  await expect(host.locator('.crew-slot.occupied')).toHaveCount(2);
  await host.getByRole('button', { name: 'I’m ready', exact: true }).click();
  await guest.getByRole('button', { name: 'أنا جاهز', exact: true }).click();
  await host.getByRole('button', { name: 'Start the chaos' }).click();
  await Promise.all([
    (async () => {
      await expect(host.locator('canvas')).toBeVisible();
      await expect(host.locator('.vote-readout')).toContainText('Abstaining');
      await host.keyboard.down('ArrowLeft');
      await host.waitForTimeout(500);
      await host.keyboard.up('ArrowLeft');
      await expect(host.locator('.vote-labels > [data-selected="true"]')).toContainText('A');
      await host.keyboard.press('Space');
      await expect(host.locator('.dash-status')).toContainText('s');
    })(),
    (async () => {
      await expect(guest.locator('canvas')).toBeVisible();
      await guest.locator('.joystick').scrollIntoViewIfNeeded();
      const touch = await b.newCDPSession(guest);
      const stick = (await guest.locator('.joystick').boundingBox())!;
      const dash = (await guest.locator('.touch-dash').boundingBox())!;
      const thumb = { id: 1, x: stick.x + stick.width * 0.8, y: stick.y + stick.height / 2 };
      expect(
        await guest.evaluate(
          ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.joystick')),
          thumb,
        ),
      ).toBe(true);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] });
      await expect(guest.locator('.vote-labels > [data-selected="true"]')).toContainText('B');
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [thumb, { id: 2, x: dash.x + dash.width / 2, y: dash.y + dash.height / 2 }],
      });
      await expect(guest.locator('.touch-dash small')).toHaveText(/^[1-4]s$/);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    })(),
  ]);
  await expect(host.getByRole('heading', { name: 'Battery bandits', exact: true })).toBeVisible({
    timeout: 65000,
  });
  await expect(guest.getByRole('heading', { name: 'خطف البطاريات', exact: true })).toBeVisible();
  await expect(guest.locator('.deposit-label').first()).toBeVisible();
  await guest.locator('.arena-panel').screenshot({ path: 'test-results/battery-arena.png' });
  await expect(guest.locator('.arena-message')).toContainText('معاك');
  await expect(host.getByRole('heading', { name: 'Fake door', exact: true })).toBeVisible({
    timeout: 70000,
  });
  await expect(host.locator('.clue-label')).toContainText('1 / 3');
  await host.locator('.arena-panel').screenshot({ path: 'test-results/door-arena.png' });
  await expect(host.getByRole('heading', { name: 'Champions of chaos', exact: false })).toBeVisible(
    { timeout: 70000 },
  );
  await expect(guest.getByRole('heading', { name: 'أبطال الفوضى', exact: false })).toBeVisible();
  await expect(host.locator('.results-breakdown>div')).toHaveCount(3);
  await expect(host.locator('.save-status')).toContainText(/Saved|saved/);
  await host.screenshot({ path: 'test-results/match-results.png', fullPage: true });
  const download = host.waitForEvent('download');
  await host.getByRole('button', { name: 'Download result card' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.svg$/);
  await host.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(host.getByRole('heading', { name: 'Floor is falling', exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(host.getByRole('heading', { name: /Chaos is better/ })).toBeVisible();
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
test('mobile landing, language, cosmetics and settings', async ({ browser }) => {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /الفوضى أحلى/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.dash-flight')).toHaveCSS('animation-name', 'leap');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.dash-flight')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: 'test-results/mobile-home.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click();
  await page.getByRole('switch', { name: 'تقليل الحركة' }).check();
  await expect(page.locator('.dash-flight')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
  await page.getByRole('button', { name: 'Switch language' }).click();
  await expect(page.getByRole('heading', { name: /Chaos is better/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByText(/Account linking is unavailable/)).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Switch language' }).click();
  await expect(page.getByRole('heading', { name: /الفوضى أحلى/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await page.screenshot({ path: 'test-results/desktop-home.png', fullPage: true });
  await context.close();
});
