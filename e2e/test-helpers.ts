import { test as base, expect, request } from '@playwright/test';

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post('/api/test/reset');
    if (!res.ok()) {
      throw new Error(`test reset failed: ${res.status()} ${await res.text()}`);
    }
    await ctx.dispose();
    await use(page);
  },
});

export { expect };
