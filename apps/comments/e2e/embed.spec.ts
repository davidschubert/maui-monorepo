import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * Embed-Widget-Smoke (Plan E1-8): eine echte Drittseite (eigener node:http-
 * Server auf anderem Port = cross-origin) lädt embed.js, der Loader baut das
 * iframe, Kommentare rendern, Resize-postMessage greift. Dazu die E0-Header:
 * frame-ancestors-Split und noindex. Auth-frei wie die übrigen Smokes.
 */

// Port pro Worker — fullyParallel lässt beforeAll je Worker laufen, ein
// fester Port kollidierte (EADDRINUSE beim zweiten Worker).
let hostPort = 0
let hostServer: Server

test.beforeAll(async () => {
  hostPort = 4900 + test.info().workerIndex
  const htmlPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../packages/comments/.embed-test/index.html',
  )
  const html = readFileSync(htmlPath, 'utf8')
  hostServer = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html)
  })
  await new Promise<void>(done => hostServer.listen(hostPort, done))
})

test.afterAll(async () => {
  await new Promise<void>(done => hostServer.close(() => done()))
})

test.describe('Embed-Widget (cross-origin iframe)', () => {
  test('Drittseite lädt das Widget: iframe, Kommentar-Sektion, Resize', async ({ page, baseURL }) => {
    await page.goto(`http://localhost:${hostPort}/?widget=${baseURL}&target=e2e-embed-smoke`)

    const iframe = page.locator('#maui-comments iframe')
    await expect(iframe).toBeVisible()

    // Widget-Inhalt rendert im iframe (CommentSection SSR + Hydration)
    const frame = page.frameLocator('#maui-comments iframe')
    await expect(frame.locator('[data-comment-section]')).toBeVisible({ timeout: 15_000 })

    // Resize-Protokoll: das Widget meldet seine Höhe, der Loader setzt Pixel
    await expect.poll(async () => (await iframe.getAttribute('style')) ?? '', { timeout: 10_000 })
      .toMatch(/height:\s*\d+px/)
  })

  test('/embed validiert Params und trägt die E0-Security-Header', async ({ request, baseURL }) => {
    // Ohne targetId/targetType → 400 (Zod-Gate)
    const bad = await request.get(`${baseURL}/embed`)
    expect(bad.status()).toBe(400)

    // Mit Params → 200, framebar (Gate: allowedOrigins ['*']) + noindex
    const ok = await request.get(`${baseURL}/embed?targetId=e2e-embed-smoke&targetType=blog`)
    expect(ok.status()).toBe(200)
    expect(ok.headers()['content-security-policy']).toContain('frame-ancestors *')
    expect(await ok.text()).toContain('noindex')

    // Alle übrigen Seiten bleiben clickjacking-geschützt ('self')
    const login = await request.get(`${baseURL}/login`)
    expect(login.headers()['content-security-policy']).toContain(`frame-ancestors 'self'`)
  })
})
