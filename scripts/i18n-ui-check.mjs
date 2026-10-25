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
await page.locator('.settings-row select').nth(1).selectOption('en-US')
await page.waitForTimeout(250)
assert.match(await page.locator('.settings-nav').innerText(), /General/)
assert.match(await page.locator('.settings-row').first().innerText(), /Theme/)
await page.screenshot({ path: '/tmp/jizhu-i18n-settings.png' })
await page.getByRole('button', { name: 'Close', exact: true }).last().click()
await page.waitForTimeout(250)
assert.match(await page.locator('.welcome .subtitle').innerText(), /developer toolbox/)
assert.match(await page.locator('.tool-card').first().innerText(), /JSON Editor/)
assert.equal(await page.locator('.tab.active .tab-label').innerText(), 'Welcome')
await page.keyboard.press('Meta+k')
await page.waitForTimeout(200)
assert.match(await page.locator('.palette-search input').getAttribute('placeholder'), /Search commands/)
assert.match(await page.locator('.palette').innerText(), /Global/)
await page.keyboard.press('Escape')
await page.screenshot({ path: '/tmp/jizhu-i18n-welcome.png' })
console.log('• English settings, welcome, tab and palette labels ok')

await page.locator('.statusbar-settings').click()
await page.waitForTimeout(200)
await page.locator('.settings-row select').nth(1).selectOption('zh-CN')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.waitForTimeout(250)
assert.match(await page.locator('.welcome .subtitle').innerText(), /极简开发工具箱/)
console.log('• language switches back to Chinese')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
assert.match(await page.locator('.welcome .subtitle').innerText(), /极简开发工具箱/)
console.log('• language persists across reload')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('i18n UI checks passed')
