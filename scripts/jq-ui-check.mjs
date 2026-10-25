// UI-level jq check using a mocked Tauri IPC layer.
// 真实引擎由 Rust 测试与桌面端覆盖；这里验证面板交互与结果渲染。
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const step = (name) => console.log(`• ${name}`)

const browser = await chromium.launch({
  executablePath: process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })

await page.addInitScript(() => {
  const fallback = () => import('/src/core/fallback.ts')
  window.__TAURI_INTERNALS__ = {
    transformCallback: (callback) => callback,
    unregisterCallback: () => {},
    convertFileSrc: (path) => path,
    invoke: async (cmd, args) => {
      if (cmd === 'ui_ready' || cmd === 'copy_text') return null
      if (cmd === 'jq_engines') {
        return {
          system: { path: '/usr/bin/jq', version: 'jq-1.7.1', sha256: 'a'.repeat(64) },
          jaq: { version: '3.1' },
        }
      }
      if (cmd === 'jq_run') {
        const doc = JSON.parse(args.input)
        const results = args.program.includes('[0]')
          ? [doc.users[0]]
          : doc.users.filter((user) => user.age >= 18)
        return {
          engine: 'system',
          engineLabel: '系统 jq 1.7.1',
          version: 'jq-1.7.1',
          output: results.map((user) => JSON.stringify(user, null, 2)).join('\n'),
          count: results.length,
          durationMs: 3,
          error: null,
          truncated: false,
        }
      }
      if (cmd === 'json_analyze') {
        const mod = await fallback()
        return mod.analyzeLocally(args.text)
      }
      if (cmd === 'json_format') {
        const mod = await fallback()
        return mod.formatLocally(args.text, args.indent, args.sortKeys)
      }
      if (cmd === 'json_minify') {
        const mod = await fallback()
        return mod.minifyLocally(args.text)
      }
      throw new Error(`unmocked command: ${cmd}`)
    },
  }
})

const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /打开\s*JSON 编辑器/ }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /jq 面板/ }).click()
await page.waitForTimeout(400)
assert.equal(await page.locator('.data-step-chip').count(), 1)
assert.match(await page.locator('.data-step-chip').first().innerText(), /1 jq/)
assert.equal(await page.getByRole('button', { name: '后续处理' }).count(), 0)

step('jq panel height resizes by dragging top edge')
const panel = page.locator('.jq-panel')
const heightBefore = (await panel.boundingBox()).height
const handle = await page.locator('.jq-resize-handle').boundingBox()
await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
await page.mouse.down()
await page.mouse.move(handle.x + handle.width / 2, handle.y - 80, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(250)
const heightAfter = (await panel.boundingBox()).height
assert.ok(heightAfter > heightBefore + 50, `height ${heightBefore} -> ${heightAfter}`)

step('jq panel columns resize by dragging divider')
const controlsBefore = (await page.locator('.jq-controls').boundingBox()).width
const columnResizer = await page.locator('.jq-col-resizer').boundingBox()
await page.mouse.move(columnResizer.x + columnResizer.width / 2, columnResizer.y + columnResizer.height / 2)
await page.mouse.down()
await page.mouse.move(columnResizer.x + columnResizer.width / 2 + 60, columnResizer.y + columnResizer.height / 2, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(250)
const controlsAfter = (await page.locator('.jq-controls').boundingBox()).width
assert.ok(controlsAfter > controlsBefore + 40, `controls ${controlsBefore} -> ${controlsAfter}`)

assert.match(await page.locator('#jq-engine').inputValue(), /auto/)
await page.locator('#jq-expr').fill('.users[] | select(.age >= 18)')
await page.getByRole('button', { name: '运行' }).click()
await page.waitForTimeout(400)

const output = await page.locator('.jq-output').innerText()
assert.match(output, /Ada/)
assert.match(output, /Coco/)
assert.doesNotMatch(output, /Bob/)
assert.match(await page.locator('.jq-result-head').innerText(), /2 条/)

await page.screenshot({ path: '/tmp/jizhu-jq-result.png' })

step('jq panel adds a processing step after jq')
await page.locator('.data-step-add').selectOption('count')
await page.waitForTimeout(250)
assert.equal(await page.locator('.data-step-chip').count(), 2)
assert.match(await page.locator('.data-step-chip').nth(1).innerText(), /计数排序/)
await page.getByRole('button', { name: '运行' }).click()
await page.waitForTimeout(500)
assert.match(await page.locator('.jq-result-head').innerText(), /条/)
await page.locator('[aria-label="删除处理步骤"]').click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.data-step-chip').count(), 1)

step('jq syntax help opens')
await page.getByRole('button', { name: '语法', exact: true }).click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.syntax-help-dialog').count(), 1)
assert.match(await page.locator('.syntax-table').innerText(), /基础取值/)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

step('single result can replace document')
await page.locator('#jq-expr').fill('.users[0]')
await page.getByRole('button', { name: '运行' }).click()
await page.waitForTimeout(400)
assert.match(await page.locator('.jq-result-head').innerText(), /1 条/)
await page.getByRole('button', { name: '替换文档' }).click()
await page.waitForTimeout(500)
assert.match(await page.locator('.cm-content').innerText(), /Ada/)

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('jq UI checks passed')
