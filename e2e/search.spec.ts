import { test, expect } from './test-helpers';
import path from 'node:path';

async function uploadOne(page: import('@playwright/test').Page, name: string) {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
  await page.getByLabel('Document Name').fill(name);
  await page.getByLabel('Invoice Date').fill('2026-04-15');
  await page.getByLabel('Amount').fill('1.00');
  await page.getByRole('button', { name: /^Upload$/ }).click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible();
}

test('search filters by name', async ({ page }) => {
  await uploadOne(page, 'Alpha receipt');
  await uploadOne(page, 'Beta receipt');
  await uploadOne(page, 'Gamma receipt');

  await page.goto('/browse');
  await page.getByLabel('Search').fill('Beta');

  await expect(page.locator('text=Beta receipt')).toBeVisible();
  await expect(page.locator('text=Alpha receipt')).not.toBeVisible();
  await expect(page.locator('text=Gamma receipt')).not.toBeVisible();
});
