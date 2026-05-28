import { test, expect } from './test-helpers';
import path from 'node:path';

// The /api/test/reset endpoint only clears the documents table — categories, tags,
// and document_types persist within a Playwright run. Each test therefore stamps
// its own unique names so it does not collide with leftovers from earlier tests.
function stamp(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

test.describe('Phase 2 — tags, categories, document types', () => {
  test('admin creates a category, uploads with category + tag, sees both on browse', async ({
    page,
  }) => {
    const s = stamp();
    const categoryName = `Finance-${s}`;
    const tagName = `q2-${s}`;
    const docName = `Doc-cat-tag-${s}`;

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Categories' }).click();
    await page.getByRole('button', { name: '+ New' }).click();
    await page.getByLabel('new name').fill(categoryName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('tr', { hasText: categoryName })).toBeVisible();

    await page.goto('/');
    await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
    await page.getByLabel('Document Name').fill(docName);
    await page.getByLabel('Category').selectOption({ label: categoryName });
    await page.getByLabel('Invoice Date').fill('2026-04-15');
    await page.getByLabel('Amount').fill('1.00');
    await page.getByPlaceholder('Add tag…').fill(tagName);
    await page.getByPlaceholder('Add tag…').press('Enter');
    await page.getByRole('button', { name: /^Upload$/ }).click();
    await expect(page.locator('h2', { hasText: docName })).toBeVisible();

    await page.goto('/browse');
    const row = page.locator('tr', { hasText: docName });
    await expect(row).toBeVisible();
    await expect(row.locator('.fi-category-badge', { hasText: categoryName })).toBeVisible();
    await expect(row.locator('.fi-tag-chip', { hasText: tagName })).toBeVisible();
  });

  test('disabled category disappears from upload but stays on existing documents', async ({
    page,
  }) => {
    const s = stamp();
    const categoryName = `Legacy-${s}`;
    const docName = `Doc-legacy-${s}`;

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Categories' }).click();
    await page.getByRole('button', { name: '+ New' }).click();
    await page.getByLabel('new name').fill(categoryName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('tr', { hasText: categoryName })).toBeVisible();

    await page.goto('/');
    await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
    await page.getByLabel('Document Name').fill(docName);
    await page.getByLabel('Category').selectOption({ label: categoryName });
    await page.getByLabel('Invoice Date').fill('2026-04-15');
    await page.getByLabel('Amount').fill('1.00');
    await page.getByRole('button', { name: /^Upload$/ }).click();
    await expect(page.locator('h2', { hasText: docName })).toBeVisible();

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Categories' }).click();
    const settingsRow = page.locator('tr', { hasText: categoryName });
    // Button text is "Disable" but aria-label is "disable {generated-id}". Filter by text
    // content so we don't depend on the generated id.
    await settingsRow.locator('button').filter({ hasText: /^Disable$/ }).click();
    await expect(settingsRow.locator('td', { hasText: 'Disabled' })).toBeVisible();

    await page.goto('/');
    await expect(
      page.getByLabel('Category').locator('option', { hasText: categoryName }),
    ).toHaveCount(0);

    await page.goto('/browse');
    const browseRow = page.locator('tr', { hasText: docName });
    await expect(browseRow.locator('.fi-category-badge', { hasText: categoryName })).toBeVisible();
  });

  test('custom document type with requires_financial=true is immutable and drives the upload form', async ({
    page,
  }) => {
    const s = stamp();
    const typeId = `taxform_${s}`;
    const typeLabel = `Tax Form ${s}`;

    await page.goto('/settings');
    // Document Types is the default tab — no click needed.
    await page.getByRole('button', { name: '+ New' }).click();
    await page.getByLabel('new id').fill(typeId);
    await page.getByLabel('new label').fill(typeLabel);
    // exact:true disambiguates the form's "requires financial" checkbox from each row's
    // "requires financial for {id}" read-only checkbox.
    await page.getByLabel('requires financial', { exact: true }).check();
    await page.getByRole('button', { name: 'Create' }).click();

    const row = page.locator('tr', { hasText: typeId });
    await expect(row).toBeVisible();
    const reqCheckbox = row.getByLabel(`requires financial for ${typeId}`);
    await expect(reqCheckbox).toBeChecked();
    await expect(reqCheckbox).toBeDisabled();

    await page.goto('/');
    await page.getByLabel('Type').selectOption(typeId);
    await expect(page.getByLabel('Invoice Date')).toBeVisible();
    await expect(page.getByLabel('Amount')).toBeVisible();
    await expect(page.getByLabel('Currency')).toBeVisible();
  });

  test('search finds a document by its tag name', async ({ page }) => {
    const s = stamp();
    // No hyphen in the tag: FTS5's default tokenizer splits on hyphens and the query parser
    // treats a leading "-" as a NOT operator, which makes hyphenated tag queries unreliable.
    const tagName = `compliance${s}`;
    const docWithTag = `T4tagged${s}`;
    const docWithoutTag = `T4untagged${s}`;

    await page.goto('/');
    await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
    await page.getByLabel('Document Name').fill(docWithTag);
    await page.getByLabel('Invoice Date').fill('2026-04-15');
    await page.getByLabel('Amount').fill('1.00');
    await page.getByPlaceholder('Add tag…').fill(tagName);
    await page.getByPlaceholder('Add tag…').press('Enter');
    await page.getByRole('button', { name: /^Upload$/ }).click();
    await expect(page.locator('h2', { hasText: docWithTag })).toBeVisible();

    await page.goto('/');
    await page.setInputFiles('input[type=file]', path.resolve('e2e/fixtures/sample.pdf'));
    await page.getByLabel('Document Name').fill(docWithoutTag);
    await page.getByLabel('Invoice Date').fill('2026-04-15');
    await page.getByLabel('Amount').fill('1.00');
    await page.getByRole('button', { name: /^Upload$/ }).click();
    await expect(page.locator('h2', { hasText: docWithoutTag })).toBeVisible();

    await page.goto('/browse');
    await page.getByLabel('Search').fill(tagName);
    await page.getByRole('button', { name: 'Apply' }).first().click();

    await expect(page.locator('tr', { hasText: docWithTag })).toBeVisible();
    await expect(page.locator('tr', { hasText: docWithoutTag })).not.toBeVisible();
  });
});
