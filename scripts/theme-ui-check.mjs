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
await page.locator('.titlebar-settings').click()
await page.waitForTimeout(200)
await page.locator('.settings-row select').first().selectOption('ghostty')
await page.waitForTimeout(250)
assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
assert.equal(
  await page.locator('.app').evaluate((element) => getComputedStyle(element).backgroundColor),
  'rgb(40, 44, 52)',
)
await page.screenshot({ path: '/tmp/jizhu-dark-settings.png' })
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.locator('.status-mode').click()
await page.getByRole('option', { name: /JSON/ }).click()
await page.locator('.cm-content').click()
await page.keyboard.insertText('{"dark":true}')
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/jizhu-dark-json.png' })
assert.equal(
  await page.locator('.cm-editor').evaluate((element) => getComputedStyle(element).color),
  'rgb(255, 255, 255)',
)
console.log('• Ghostty theme applies to shell and editor')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
console.log('• theme persists across reload')

await page.locator('.titlebar-settings').click()
await page.locator('.settings-row select').first().selectOption('solarized-light')
await page.waitForTimeout(250)
assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
assert.equal(await page.locator('html').getAttribute('data-theme-variant'), 'solarized-light')
await page.locator('.settings-row select').first().selectOption('light')
await page.waitForTimeout(250)
assert.equal(await page.locator('html').getAttribute('data-theme-variant'), 'light')
console.log('• Solarized and design light modes switch ok')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('theme UI checks passed')
