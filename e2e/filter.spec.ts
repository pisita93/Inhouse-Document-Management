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
  await page.getByRole('button', { name: /^Upload$/ }).click();
  await expect(page.locator('h2', { hasText: name })).toBeVisible();
}

test('filter by type and invoice-date range', async ({ page }) => {
  await uploadOne(page, 'Inv-A', 'invoice', '2026-01-10');
  await uploadOne(page, 'Inv-B', 'invoice', '2026-06-10');
  await uploadOne(page, 'Rec-A', 'receipt', '2026-06-10');

  await page.goto('/browse');
  await page.getByLabel('Type').selectOption('invoice');
  await page.getByLabel('Invoice Date from').fill('2026-05-01');
  await page.getByLabel('Invoice Date to').fill('2026-12-31');
  await page.getByRole('button', { name: 'Apply' }).first().click();

  await expect(page.locator('text=Inv-B')).toBeVisible();
  await expect(page.locator('text=Inv-A')).not.toBeVisible();
  await expect(page.locator('text=Rec-A')).not.toBeVisible();
});

test('filter by multiple tags with AND match', async ({ page }) => {
  async function uploadTagged(name: string, tags: string[]) {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
    await page.getByLabel('Document Name').fill(name);
    await page.getByLabel('Type').selectOption('other');
    for (const t of tags) {
      await page.getByPlaceholder('Add tag…').fill(t);
      await page.getByPlaceholder('Add tag…').press('Enter');
    }
    await page.getByRole('button', { name: /^Upload$/ }).click();
    await expect(page.locator('h2', { hasText: name })).toBeVisible();
  }

  await uploadTagged('Both', ['alpha', 'beta']);
  await uploadTagged('OnlyAlpha', ['alpha']);

  await page.goto('/browse');
  await page.getByLabel('Tags').selectOption([{ label: 'alpha' }, { label: 'beta' }]);
  await page.getByRole('radio', { name: 'All' }).check();
  await page.getByRole('button', { name: 'Apply' }).first().click();

  await expect(page.locator('text=Both')).toBeVisible();
  await expect(page.locator('text=OnlyAlpha')).not.toBeVisible();
});
