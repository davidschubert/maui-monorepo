import { test, expect } from '@playwright/test'

/**
 * Auth-Guard: geschützte Dashboard-Routen leiten unangemeldet auf /login um.
 * Verifiziert die Auth-Middleware ohne echten Login.
 */
const PROTECTED = ['/dashboard', '/dashboard/users', '/dashboard/admin/changelog', '/dashboard/settings']

for (const path of PROTECTED) {
  test(`${path} leitet unangemeldet auf /login`, async ({ page }) => {
    await page.goto(path)
    // localePath: englischer Default ohne Prefix → /login
    await expect(page).toHaveURL(/\/login(\?|$)/)
  })
}
