import { test, expect } from './test-helpers';
import path from 'node:path';

async function uploadOne(
  page: import('@playwright/test').Page,
  name: string,
  type: 'invoice' | 'receipt' | 'quotation' | 'other',
  date: string,
) {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
  await page.getByLabel('Document Name').fill(name);
  await page.getByLabel('Type').selectOption(type);
  await page.getByLabel('Invoice Date').fill(date);
  await page.getByLabel('Amount').fill('1.00');
  await page.getByRole('button', { name: /Upload to NAS/ }).click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible();
}

test('filter by type and date range', async ({ page }) => {
  await uploadOne(page, 'Inv-A', 'invoice', '2026-01-10');
  await uploadOne(page, 'Inv-B', 'invoice', '2026-06-10');
  await uploadOne(page, 'Rec-A', 'receipt', '2026-06-10');

  await page.getByRole('link', { name: 'Browse' }).click();
  await page.getByLabel('Type').selectOption('invoice');
  await page.getByLabel('From').fill('2026-05-01');
  await page.getByLabel('To').fill('2026-12-31');

  await expect(page.locator('text=Inv-B')).toBeVisible();
  await expect(page.locator('text=Inv-A')).not.toBeVisible();
  await expect(page.locator('text=Rec-A')).not.toBeVisible();
});
