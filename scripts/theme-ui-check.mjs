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
await page.locator('.statusbar-settings').click()
await page.waitForTimeout(200)
await page.locator('.settings-row select').first().selectOption('dark')
await page.waitForTimeout(250)
assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
assert.match(
  await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
  /13, 17, 23/,
)
await page.screenshot({ path: '/tmp/jizhu-dark-settings.png' })
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: /打开\s*JSON 编辑器/ }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/jizhu-dark-json.png' })
assert.match(
  await page.locator('.cm-editor').evaluate((element) => getComputedStyle(element).color),
  /230, 237, 243/,
)
console.log('• dark theme applies to shell and editor')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
console.log('• theme persists across reload')

await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('system')
await page.waitForTimeout(250)
const systemTheme = await page.locator('html').getAttribute('data-theme')
assert.ok(systemTheme === 'light' || systemTheme === 'dark')
await page.locator('.settings-row select').first().selectOption('light')
await page.waitForTimeout(250)
assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
console.log('• system and light modes switch ok')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('theme UI checks passed')
