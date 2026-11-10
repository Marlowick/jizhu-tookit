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
await page.waitForTimeout(250)
assert.equal(await page.locator('.settings-dialog').count(), 1)
await page.getByRole('button', { name: '编辑器', exact: true }).click()
await page.locator('.settings-row select').first().selectOption('14')
await page.locator('.settings-row select').nth(1).selectOption('4')
await page.locator('.settings-switch').click()
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.waitForTimeout(250)

await page.locator('.status-mode').click()
await page.getByRole('option', { name: /JSON/ }).click()
await page.locator('.cm-content').click()
await page.keyboard.insertText('{"alpha":"abcdefghij","beta":"klmnopqrst","gamma":"uvwxyz0123","delta":"4567890"}')
await page.waitForTimeout(500)
assert.match(await page.locator('.cm-editor').evaluate((el) => getComputedStyle(el).fontSize), /14px/)
assert.equal(
  await page.locator('.cm-content').evaluate((el) => el.classList.contains('cm-lineWrapping')),
  false,
)
await page.locator('.titlebar-command').click()
await page.locator('.palette-search input').fill('格式化 JSON')
await page.locator('.palette-item').first().click()
await page.waitForTimeout(500)
const formatted = await page.locator('.cm-content').innerText()
assert.match(formatted, /^\{\n    "alpha"/)
console.log('• editor font, word wrap and indent settings applied')

await page.locator('.titlebar-settings').click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.settings-dialog').count(), 1)
await page.getByRole('button', { name: '快捷键' }).click()
assert.match(await page.locator('.settings-shortcuts').innerText(), /命令面板/)
assert.match(await page.locator('.settings-shortcuts').innerText(), /⌘K/)
await page.getByRole('button', { name: '关于' }).click()
assert.match(await page.locator('.settings-about').innerText(), /本地运行/)
await page.screenshot({ path: '/tmp/jizhu-settings.png' })
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
console.log('• settings entry, shortcuts and about ok')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.locator('.titlebar-settings').click()
await page.getByRole('button', { name: '编辑器', exact: true }).click()
assert.equal(await page.locator('.settings-row select').first().inputValue(), '14')
console.log('• settings persisted across reload')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('settings UI checks passed')
