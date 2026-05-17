import { test, expect } from './test-helpers';
import path from 'node:path';

test('upload → browse → detail → download (invoice)', async ({ page }) => {
  await page.goto('/');

  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));

  await page.getByLabel('Document Name').fill('E2E Test Doc');
  await page.getByLabel('Invoice Date').fill('2026-04-15');
  await page.getByLabel('Amount').fill('199.99');

  await page.getByRole('button', { name: /^Upload$/ }).click();

  await expect(page.locator('h2', { hasText: 'E2E Test Doc' })).toBeVisible();
  await expect(page.locator('text=199.99 THB')).toBeVisible();

  await page.goto('/browse');
  await expect(page.locator('text=E2E Test Doc')).toBeVisible();

  const detailLink = page.getByRole('link', { name: 'View' });
  await detailLink.click();
  const dl = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download original/ }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/sample\.pdf/);
});
