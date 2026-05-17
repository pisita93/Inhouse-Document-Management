import { test, expect } from './test-helpers';
import path from 'node:path';

test('contract upload hides financial fields and detail page omits them', async ({ page }) => {
  await page.goto('/');

  await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));

  await page.getByLabel('Document Name').fill('NDA Acme');
  await page.getByLabel('Type').selectOption('contract');

  await expect(page.getByLabel('Invoice Date')).toBeHidden();
  await expect(page.getByLabel('Amount')).toBeHidden();
  await expect(page.getByLabel('Currency')).toBeHidden();

  await page.getByRole('button', { name: /^Upload$/ }).click();

  await expect(page.locator('h2', { hasText: 'NDA Acme' })).toBeVisible();
  await expect(page.locator('dt', { hasText: 'Document Date' })).toBeVisible();
  await expect(page.locator('dt', { hasText: 'Invoice Date' })).toHaveCount(0);
  await expect(page.locator('dt', { hasText: 'Amount' })).toHaveCount(0);
});
