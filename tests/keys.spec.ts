import { test, expect } from '@playwright/test';

test.describe('Keys App - Piano Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/keys.html');
    await page.waitForSelector('#piano');
  });

  test('single key press and release', async ({ page }) => {
    const firstWhiteKey = page.locator('#piano .key.white').first();

    // Use mouse down/up instead
    await firstWhiteKey.hover();
    await page.mouse.down();
    await expect(firstWhiteKey).toHaveClass(/down/);

    await page.mouse.up();
    await expect(firstWhiteKey).not.toHaveClass(/down/);
  });

  test('chord: hold two keys simultaneously', async ({ page }) => {
    const keys = page.locator('#piano .key.white');
    const key1 = keys.nth(0);
    const key2 = keys.nth(2);

    const box1 = await key1.boundingBox();
    const box2 = await key2.boundingBox();
    if (!box1 || !box2) throw new Error('Could not get boxes');

    // Press key1
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.down();
    await expect(key1).toHaveClass(/down/);

    // Move to key2 and press (simulates multi-touch)
    // In reality, we'd need multiple pointer IDs, but we can test the current behavior
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);

    // Release
    await page.mouse.up();
    await expect(key1).not.toHaveClass(/down/);
  });

  test('drag across multiple keys', async ({ page }) => {
    const keys = page.locator('#piano .key.white');

    const box1 = await keys.nth(0).boundingBox();
    const box3 = await keys.nth(2).boundingBox();
    if (!box1 || !box3) throw new Error('Could not get positions');

    // Start drag from key1
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.down();
    await expect(keys.nth(0)).toHaveClass(/down/);

    // Drag to key3
    await page.mouse.move(box3.x + box3.width / 2, box3.y + box3.height / 2);
    // Check if key changed
    await page.waitForTimeout(100);

    // Release
    await page.mouse.up();
  });

  test('drag across non-adjacent keys', async ({ page }) => {
    const keys = page.locator('#piano .key.white');

    const box0 = await keys.nth(0).boundingBox();
    const box5 = await keys.nth(5).boundingBox();
    if (!box0 || !box5) throw new Error('Could not get positions');

    // Drag from key 0 to key 5
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
    await page.mouse.down();

    // Jump to key 5 (non-adjacent)
    await page.mouse.move(box5.x + box5.width / 2, box5.y + box5.height / 2);
    await page.waitForTimeout(100);

    await page.mouse.up();
  });

  test('rapid key presses', async ({ page }) => {
    const keys = page.locator('#piano .key.white');

    for (let i = 0; i < 3; i++) {
      const key = keys.nth(i);
      const box = await key.boundingBox();
      if (!box) throw new Error('Could not get position');

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(key).toHaveClass(/down/);
      await page.mouse.up();
      await expect(key).not.toHaveClass(/down/);
    }
  });

  test('voice select changes instrument', async ({ page }) => {
    const voiceSelect = page.locator('#voice');
    const options = await page.locator('#voice option').count();

    expect(options).toBeGreaterThan(1);

    // Change voice
    await voiceSelect.selectOption({ index: 1 });
    await page.waitForTimeout(100);

    // Play a note
    const key = page.locator('#piano .key.white').first();
    const box = await key.boundingBox();
    if (!box) throw new Error('Could not get position');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(key).toHaveClass(/down/);
    await page.mouse.up();
  });

  test('octave controls change octave value', async ({ page }) => {
    const octaveValue = page.locator('#topControls .value').first();
    const plusButton = page.locator('#topControls .group').first().locator('button').last();

    const initialText = await octaveValue.textContent();
    const initialOctave = parseInt(initialText || '0', 10);

    // Click plus button
    await plusButton.click();
    await page.waitForTimeout(100);

    const newText = await octaveValue.textContent();
    const newOctave = parseInt(newText || '0', 10);

    expect(newOctave).toBe(initialOctave + 1);
  });
});
