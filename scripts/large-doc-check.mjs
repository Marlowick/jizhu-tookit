import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { analysisPlan, docModeFor } from '../src/core/largeDoc.ts'

// 纯函数阈值
assert.equal(docModeFor(10), 'normal')
assert.equal(docModeFor(1_000_000), 'large')
assert.equal(docModeFor(5_000_000), 'huge')
assert.equal(analysisPlan('large').maxNodes, 25_000)
assert.equal(analysisPlan('huge').maxNodes, 10_000)
console.log('• doc mode thresholds ok')

const browser = await chromium.launch({
  executablePath: process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /打开\s*JSON 编辑器/ }).click()
await page.waitForTimeout(500)

// 生成 2000 个数组元素，验证树只渲染视口内的行
const items = Array.from({ length: 2000 }, (_, index) => index)
const json = JSON.stringify({ items })
await page.locator('.cm-content').click()
await page.keyboard.press('Meta+a')
await page.keyboard.insertText(json)
await page.waitForTimeout(700)

await page.locator('.tree-row', { hasText: 'items' }).first().click()
await page.waitForTimeout(500)

const domRows = await page.locator('.tree-row').count()
const scrollHeight = await page.locator('.tree-wrap').evaluate((element) => element.scrollHeight)
assert.ok(domRows < 100, `virtualized rows should be small, got ${domRows}`)
assert.ok(scrollHeight > 2000 * 28, `scroll height should cover all rows, got ${scrollHeight}`)
console.log(`• virtualization ok: ${domRows} DOM rows, scrollHeight=${scrollHeight}`)

await page.locator('.tree-wrap').evaluate((element) => {
  element.scrollTop = element.scrollHeight
})
await page.waitForTimeout(300)
const bottomRows = await page.locator('.tree-row').count()
assert.ok(bottomRows < 100)
const lastVisible = await page.locator('.tree-row').last().innerText()
assert.match(lastVisible, /1999/)
console.log(`• bottom rendered ${bottomRows} rows, last=${lastVisible.replace(/\n/g, ' ')}`)

// 大文件模式：1.05M 字符的 JSON，应降频、限制节点，并显示提示
const largeValue = 'x'.repeat(1_050_000)
await page.locator('.cm-content').click()
await page.keyboard.press('Meta+a')
await page.keyboard.insertText(`{"data":"${largeValue}"}`)
await page.waitForTimeout(1500)
const header = await page.locator('.pane-header').first().innerText()
assert.match(header, /大文件模式/)
assert.match(header, /25000|25,000|2.5 万/)
console.log('• large document mode ok')
await page.screenshot({ path: '/tmp/jizhu-large-doc.png' })

// 超大文件：暂停实时分析，手动触发一次快照
const hugeValue = 'y'.repeat(5_050_000)
await page.locator('.cm-content').click()
await page.keyboard.press('Meta+a')
await page.keyboard.insertText(`{"data":"${hugeValue}"}`)
await page.waitForTimeout(800)
assert.equal(await page.locator('.tree-placeholder').count(), 1)
assert.match(await page.locator('.tree-placeholder').innerText(), /超大文件/)
await page.screenshot({ path: '/tmp/jizhu-huge-doc.png' })
await page.getByRole('button', { name: /分析一次/ }).click()
await page.waitForTimeout(1500)
assert.equal(await page.locator('.tree-placeholder').count(), 0)
assert.ok((await page.locator('.tree-row').count()) >= 2)
console.log('• huge document manual analysis ok')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('large document checks passed')
