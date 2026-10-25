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

// URL 解析
await page.getByRole('button', { name: /打开\s*URL 解析/ }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '示例', exact: true }).click()
await page.waitForTimeout(300)
const rawUrl = await page.locator('.url-input').inputValue()
assert.match(rawUrl, /filter=%7B/)
assert.equal(await page.locator('.url-param-row').count(), 3)
assert.match(await page.locator('.url-structure').innerText(), /https:\/\//)
assert.match(await page.locator('.url-structure').innerText(), /api\.example\.com/)
assert.equal(await page.getByRole('button', { name: /JSON · 2 键/ }).count(), 1)
await page.getByLabel('参数 1 值').fill('hello world')
await page.waitForTimeout(200)
assert.match(await page.locator('.url-input').inputValue(), /q=hello\+world/)
await page.getByRole('button', { name: '添加参数' }).click()
await page.waitForTimeout(200)
assert.equal(await page.locator('.url-param-row').count(), 4)
const newKeyInput = page.locator('.url-param-input.key').last()
await newKeyInput.click()
await newKeyInput.pressSequentially('abc')
assert.equal(await newKeyInput.inputValue(), 'param1abc')
assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('url-param-input')), true)
assert.equal(await page.locator('.url-updated.show').count(), 1)
await page.locator('.url-param-delete').last().click()
await page.waitForTimeout(200)
assert.equal(await page.locator('.url-param-row').count(), 3)
await page.getByRole('button', { name: /JSON · 2 键/ }).click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.url-json-preview').count(), 1)
assert.match(await page.locator('.url-json-preview pre').innerText(), /"active": true/)
console.log('• URL parse, edit, add/delete and JSON preview ok')
await page.screenshot({ path: '/tmp/jizhu-url-tool.png' })
await page.getByRole('button', { name: 'JSON 编辑' }).click()
await page.locator('.url-json-editor').fill('{"active":false,"role":"admin"}')
await page.getByRole('button', { name: '应用', exact: true }).click()
await page.waitForTimeout(300)
assert.match(await page.locator('.url-input').inputValue(), /active%22%3Afalse/)
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('dark')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.waitForTimeout(250)
assert.match(
  await page.locator('.url-add-param').evaluate((element) => getComputedStyle(element).backgroundColor),
  /22, 27, 34/,
)
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('light')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
console.log('• URL JSON parameter edit and dark add-param button ok')

// 时间转换
await page.getByRole('tab', { name: '欢迎' }).click()
await page.getByRole('button', { name: /打开\s*时间转换/ }).click()
await page.waitForTimeout(300)
await page.locator('#time-input').fill('1718092800')
await page.waitForTimeout(300)
assert.match(await page.locator('.time-cards').innerText(), /2024-06-11T08:00:00Z/)
assert.match(await page.locator('.time-hint').innerText(), /检测为秒/)
await page.getByRole('button', { name: '时间 → 时间戳' }).click()
await page.waitForTimeout(200)
await page.locator('#time-input').fill('2025-06-11T16:00:00')
await page.waitForTimeout(300)
assert.match(await page.locator('.time-cards').innerText(), /1749628800/)
assert.match(await page.locator('.time-cards').innerText(), /1749628800000/)
await page.getByRole('button', { name: '时间戳 → 时间' }).click()
await page.locator('#time-input').fill('1718092800')
await page.waitForTimeout(300)
console.log('• timestamp ↔ date conversion ok')
await page.screenshot({ path: '/tmp/jizhu-time-tool.png' })

// 编码 / 解码
await page.getByRole('tab', { name: '欢迎' }).click()
await page.getByRole('button', { name: /打开\s*编码 \/ 解码/ }).click()
await page.waitForTimeout(300)
assert.match(await page.locator('.codec-output').innerText(), /^[A-Za-z0-9_-]+$/)
const encoded = await page.locator('.codec-output').innerText()
await page.screenshot({ path: '/tmp/jizhu-codec-tool.png' })
assert.equal(await page.locator('.codec-swap').count(), 0)
await page.locator('.codec-arrow').click()
await page.waitForTimeout(300)
assert.match(await page.locator('.codec-output').innerText(), /你好，机杼/)
assert.equal(await page.locator('.codec-output').innerText(), '你好，机杼工具箱。一段需要编码的文本。')
await page.getByRole('button', { name: '编码', exact: true }).click()
await page.locator('.codec-protocol select').selectOption('hex')
await page.waitForTimeout(300)
assert.match(await page.locator('.codec-output').innerText(), /^[0-9a-f]+$/)

await page.locator('.codec-protocol select').selectOption('url')
await page.locator('.codec-input').fill('你好 world')
await page.waitForTimeout(250)
assert.equal(await page.locator('.codec-output').innerText(), '%E4%BD%A0%E5%A5%BD%20world')

await page.locator('.codec-protocol select').selectOption('html')
await page.locator('.codec-input').fill('<b>&"</b>')
await page.waitForTimeout(250)
assert.equal(await page.locator('.codec-output').innerText(), '&lt;b&gt;&amp;&quot;&lt;/b&gt;')

await page.locator('.codec-protocol select').selectOption('unicode')
await page.locator('.codec-input').fill('你')
await page.waitForTimeout(250)
assert.equal(await page.locator('.codec-output').innerText(), '\\u4f60')
console.log('• Base64 roundtrip, Hex, URL, HTML and Unicode ok', encoded.slice(0, 12))

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('M4 UI checks passed')
