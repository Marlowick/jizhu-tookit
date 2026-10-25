import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /打开\s*二维码生成/ }).click()
await page.waitForTimeout(500)

const canvas = page.locator('.qr-canvas')
assert.equal(await canvas.count(), 1)
const before = await canvas.evaluate((element) => ({
  width: element.width,
  height: element.height,
  data: element.toDataURL(),
}))
assert.ok(before.width >= 240 && before.height >= 240)
assert.ok(before.data.startsWith('data:image/png'))

await page.locator('.qr-textarea').fill('https://example.com/hello?from=jizhu')
await page.waitForTimeout(500)
const after = await canvas.evaluate((element) => element.toDataURL())
assert.notEqual(after, before.data)
console.log('• QR preview updates with input')

await page.locator('.qr-settings select').first().selectOption('H')
await page.locator('.qr-settings select').nth(1).selectOption('400')
await page.waitForTimeout(500)
const sized = await canvas.evaluate((element) => element.width)
assert.equal(sized, 400)
assert.match(await page.locator('.qr-preview-pane .qr-pane-head').innerText(), /H 级 · 400px/)
console.log('• level and size controls ok')

await page.locator('.qr-textarea').fill('x'.repeat(3000))
await page.waitForTimeout(400)
assert.equal(await page.locator('.qr-error').count(), 1)
assert.match(await page.locator('.qr-error').innerText(), /超过 QR 最大容量/)
assert.equal(await canvas.evaluate((element) => element.classList.contains('is-hidden')), true)
console.log('• capacity error shown')

await page.locator('.qr-textarea').fill('https://example.com/recovered')
await page.waitForTimeout(500)
assert.equal(await page.locator('.qr-error').count(), 0)
assert.equal(await canvas.evaluate((element) => element.classList.contains('is-hidden')), false)
assert.equal(await page.getByRole('button', { name: '导出 PNG' }).isEnabled(), true)
assert.equal(await page.getByRole('button', { name: '导出 SVG' }).isEnabled(), true)
console.log('• error recovery and export buttons enabled')
await page.locator('.qr-preview-card').hover()
await page.locator('.qr-zoom-btn').click()
await page.waitForTimeout(350)
assert.equal(await page.locator('.qr-zoom-dialog').count(), 1)
assert.match(await page.locator('.qr-zoom-dialog img').getAttribute('src'), /^data:image\/png/)
assert.equal(await page.locator('.qr-zoom-dialog img').evaluate((element) => element.naturalWidth), 720)
await page.screenshot({ path: '/tmp/jizhu-qr-zoom.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
assert.equal(await page.locator('.qr-zoom-dialog').count(), 0)
console.log('• QR zoom preview opens and closes')
await page.screenshot({ path: '/tmp/jizhu-qr-tool.png' })

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('QR UI checks passed')
