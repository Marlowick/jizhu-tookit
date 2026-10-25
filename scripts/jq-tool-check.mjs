import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })

await page.addInitScript(() => {
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
        const values = args.input.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line))
        let selected = values
        if (args.program.includes('score > 80')) selected = selected.filter((value) => value.score > 80)
        if (args.program.includes('.user')) selected = selected.map((value) => value.user)
        return {
          engine: 'system',
          engineLabel: '系统 jq 1.7.1',
          version: 'jq-1.7.1',
          output: selected.map((value) => JSON.stringify(value, null, 2)).join('\n'),
          count: selected.length,
          durationMs: 4,
          error: null,
          truncated: false,
        }
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
assert.equal(await page.locator('.tool-card').count(), 9)
await page.getByRole('button', { name: /打开\s*jq 查询/ }).click()
await page.waitForTimeout(400)
assert.match(await page.locator('.jq-tool-head').innerText(), /jq 查询/)
await page.getByRole('button', { name: '语法', exact: true }).click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.syntax-help-dialog').count(), 1)
assert.match(await page.locator('.syntax-table').innerText(), /基础取值/)
await page.screenshot({ path: '/tmp/jizhu-jq-syntax.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
assert.equal(await page.locator('.syntax-help-dialog').count(), 0)
console.log('• jq tool opened and syntax help works')

await page.getByRole('button', { name: '示例' }).click()
await page.waitForTimeout(200)
assert.match(await page.locator('.jq-input').inputValue(), /"user":"ada"/)
assert.equal(await page.locator('#jq-tool-expr').inputValue(), 'select(.score > 80) | .user')
await page.locator('.jq-tool-bar .btn.primary').click()
await page.waitForTimeout(400)
const output = await page.locator('.jq-output').innerText()
assert.match(output, /"ada"/)
assert.doesNotMatch(output, /"bob"/)
assert.match(await page.locator('.jq-tool-pane-head').nth(1).innerText(), /2 条/)
console.log('• sample run ok')

// 编辑 expr 期间不清空旧结果；失焦后如果 expr 改过，再清空
await page.locator('#jq-tool-expr').fill('.score')
await page.waitForTimeout(200)
assert.match(await page.locator('.jq-output').innerText(), /"ada"/)
await page.locator('.jq-input').click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.jq-output').count(), 0)
assert.match(await page.locator('.jq-empty').innerText(), /输入 JSON Lines 和表达式后运行/)
console.log('• result clears only on expr blur')

await page.locator('.jq-input').fill('{"user":"ada"}\n{"user":"bob"}\n{"user":"coco"}')
await page.locator('#jq-tool-expr').fill('.user')
await page.locator('#jq-tool-expr').press('Meta+Enter')
await page.waitForTimeout(300)
assert.match(await page.locator('.jq-output').innerText(), /"coco"/)
assert.match(await page.locator('.jq-tool-pane-head').nth(1).innerText(), /3 条/)
console.log('• manual JSON Lines run ok')

await page.screenshot({ path: '/tmp/jizhu-jq-tool.png' })

await page.getByRole('button', { name: '清空' }).click()
await page.waitForTimeout(200)
assert.equal(await page.locator('.jq-input').inputValue(), '')
console.log('• clear ok')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('jq tool checks passed')
