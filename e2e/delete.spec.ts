import { test, expect } from '@playwright/test';
import path from 'node:path';

test('delete removes receipt from list and detail URL 404s', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
  await page.getByLabel('Document Name').fill('To Delete');
  await page.getByLabel('Invoice Date').fill('2026-04-15');
  await page.getByLabel('Amount').fill('1.00');
  await page.getByRole('button', { name: /Upload to NAS/ }).click();

  await expect(page.locator('h2', { hasText: 'To Delete' })).toBeVisible();
  const detailUrl = page.url();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Delete/ }).click();

  await expect(page).toHaveURL(/\/browse$/);
  await expect(page.locator('text=To Delete')).not.toBeVisible();

  await page.goto(detailUrl);
  await expect(page.locator('text=/not found|NOT_FOUND/i')).toBeVisible();
});
