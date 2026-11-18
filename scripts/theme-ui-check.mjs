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
await page.waitForTimeout(300)

assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
assert.equal(await page.locator('html').getAttribute('data-theme-variant'), 'sublime')
assert.equal(
  await page.locator('.app').evaluate((element) => getComputedStyle(element).backgroundColor),
  'rgb(39, 40, 34)',
)
console.log('• Sublime dark is the only theme')

await page.locator('.titlebar-settings').click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.settings-dialog').count(), 1)
assert.equal(await page.locator('.settings-dialog .settings-row').filter({ hasText: '主题' }).count(), 0)
await page.getByRole('button', { name: '关闭', exact: true }).last().click()

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
assert.equal(await page.locator('html').getAttribute('data-theme-variant'), 'sublime')
assert.equal(
  await page.locator('.app').evaluate((element) => getComputedStyle(element).backgroundColor),
  'rgb(39, 40, 34)',
)
console.log('• theme is stable across reload')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('theme UI checks passed')
