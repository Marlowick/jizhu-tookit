import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })

await page.addInitScript(() => {
  const line = (number, text) => ({ number, text })
  window.__TAURI_INTERNALS__ = {
    transformCallback: (callback) => callback,
    unregisterCallback: () => {},
    convertFileSrc: (path) => path,
    invoke: async (cmd, args) => {
      if (cmd === 'ui_ready') return null
      if (cmd === 'copy_text') {
        window.__copied = args.text
        return null
      }
      if (cmd === 'json_analyze') {
        return {
          valid: true,
          issue: null,
          root: 0,
          nodes: [
            {
              id: 0,
              depth: 0,
              key: 'root',
              path: '',
              kind: 'object',
              preview: 'object · 1 keys',
              start: 0,
              end: 20,
              keyStart: null,
              keyEnd: null,
              children: [],
            },
          ],
          stats: { nodes: 1, bytes: 20, depth: 1, maxDepth: 1 },
          truncated: false,
        }
      }
      if (cmd === 'diff_text') {
        return {
          rows: Array.from({ length: 3000 }, (_, index) => ({
            kind: index >= 500 && index < 1500 ? 'equal' : index % 3 === 0 ? 'change' : 'equal',
            a: line(index + 1, `line ${index + 1} before`),
            b: line(
              index + 1,
              index % 3 === 0 ? `line ${index + 1} after` : `line ${index + 1} before`,
            ),
          })),
          stats: { added: 1000, removed: 1000, changed: 1000, differences: 1000 },
        }
      }
      if (cmd === 'diff_json') {
        return {
          rows: [
            { kind: 'equal', a: line(1, '{2 keys}'), b: line(1, '{2 keys}') },
            { kind: 'change', a: line(2, '  "debug": true'), b: line(2, '  "debug": false') },
            {
              kind: 'equal',
              a: line(3, '  "tags": [2 items]'),
              b: line(3, '  "tags": [2 items]'),
            },
            { kind: 'equal', a: line(3, '    [0]: "a"'), b: line(3, '    [0]: "a"') },
            { kind: 'change', a: line(3, '    [1]: "b"'), b: line(3, '    [1]: "c"') },
          ],
          stats: { added: 2, removed: 2, changed: 2, differences: 2 },
        }
      }
      if (cmd === 'diff_url') {
        if (args.options.parseJsonParams === false) {
          return {
            rows: [
              { section: '协议', name: 'scheme', a: 'https', b: 'https', kind: 'equal', depth: 0 },
              { section: '域名', name: 'host', a: 'api.example.com', b: 'api.example.com', kind: 'equal', depth: 0 },
              { section: '路径', name: 'path', a: '/v1/users', b: '/v1/users', kind: 'equal', depth: 0 },
              { section: '参数', name: 'filter', a: '{"status":"active"}', b: '{"status":"inactive"}', kind: 'change', depth: 0 },
              { section: '参数', name: 'legacy', a: '1', b: '— 已删除', kind: 'remove', depth: 0 },
            ],
            stats: { added: 1, removed: 2, changed: 1, differences: 2 },
          }
        }
        return {
          rows: [
            { section: '协议', name: 'scheme', a: 'https', b: 'https', kind: 'equal', depth: 0 },
            { section: '域名', name: 'host', a: 'api.example.com', b: 'api.example.com', kind: 'equal', depth: 0 },
            { section: '路径', name: 'path', a: '/v1/users', b: '/v1/users', kind: 'equal', depth: 0 },
            { section: '参数', name: 'filter', a: 'JSON · 2 keys', b: 'JSON · 2 keys', kind: 'equal', depth: 0 },
            { section: '参数', name: 'filter.status', a: '"active"', b: '"inactive"', kind: 'change', depth: 1 },
            { section: '参数', name: 'filter.tags', a: '[2 items]', b: '[3 items]', kind: 'equal', depth: 1 },
            { section: '参数', name: 'filter.tags[0]', a: '"a"', b: '"a"', kind: 'equal', depth: 2 },
            { section: '参数', name: 'filter.tags[+1]', a: '— 新增', b: '"x"', kind: 'add', depth: 2 },
            { section: '参数', name: 'filter.tags[1→2]', a: '"b"', b: '"b"', kind: 'equal', depth: 2 },
            { section: '参数', name: 'legacy', a: '1', b: '— 已删除', kind: 'remove', depth: 0 },
          ],
          stats: { added: 2, removed: 2, changed: 1, differences: 3 },
        }
      }
      if (cmd === 'jq_engines') {
        return { system: { path: '/usr/bin/jq', version: 'jq-1.7.1', sha256: 'a'.repeat(64) }, jaq: { version: '3.1' } }
      }
      throw new Error(`unmocked command: ${cmd} ${JSON.stringify(args).slice(0, 80)}`)
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

// 从命令面板以当前 JSON Tab 作为 A 侧打开 Diff
await page.keyboard.press('Meta+k')
await page.waitForTimeout(250)
await page.locator('.palette-search input').fill('Diff 对比')
await page.waitForTimeout(250)
await page.locator('.palette-item').first().click()
await page.waitForTimeout(500)
assert.equal(await page.locator('.diff-tool').count(), 1)
const aSelected = await page.locator('[aria-label="A 侧来源"] option:checked').innerText()
assert.match(aSelected, /Untitled-1\.json/)
console.log('• diff opened with current tab as A')

// B 侧手动输入并对比
await page.getByRole('button', { name: /编辑 B 侧/ }).click()
await page.waitForTimeout(200)
await page.locator('.diff-modal-input').fill('{\n  "debug": false,\n  "tags": ["a", "c"]\n}')
assert.equal(await page.getByRole('button', { name: '应用', exact: true }).count(), 1)
await page.getByRole('button', { name: '应用', exact: true }).click()
await page.waitForTimeout(800)
assert.equal(await page.locator('.diff-line-row').count(), 5)
assert.equal(await page.locator('.diff-inline').count() > 0, true)
assert.match(await page.locator('.diff-footer').innerText(), /2 处差异/)
await page.screenshot({ path: '/tmp/jizhu-diff-json.png' })
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('dark')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.waitForTimeout(250)
assert.match(
  await page.locator('.diff-result-area').evaluate((element) => getComputedStyle(element).backgroundColor),
  /13, 17, 23/,
)
await page.screenshot({ path: '/tmp/jizhu-diff-dark.png' })
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('light')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.getByRole('button', { name: /复制 patch/ }).click()
await page.waitForTimeout(250)
const patch = await page.evaluate(() => window.__copied)
assert.match(patch, /^--- Untitled-1\.json/m)
assert.match(patch, /@@ -1,5 \+1,5 @@/)
await page.getByRole('button', { name: '以 B 覆盖 A' }).click()
assert.equal(await page.getByRole('button', { name: '确认覆盖 A' }).count(), 1)
await page.getByRole('button', { name: '确认覆盖 A' }).click()
await page.waitForTimeout(700)
assert.match(await page.locator('.toast').innerText(), /覆盖 A/)
console.log('• JSON diff rows, inline highlight, patch copy and overwrite-A ok')

// URL 模式（等 JSON patch 的 toast 消失后再截图）
await page.waitForTimeout(2200)
await page.getByRole('tab', { name: 'URL 结构化' }).click()
await page.waitForTimeout(800)
assert.equal(await page.locator('.url-diff-row').count(), 10)
assert.equal(await page.locator('.url-diff-row.change').count(), 1)
assert.match(await page.locator('.diff-footer').innerText(), /3 处差异/)
assert.match(
  await page.locator('.url-diff-row', { hasText: 'filter.tags[+1]' }).innerText(),
  /— 新增/,
)
assert.match(await page.locator('.diff-option-note').innerText(), /JSON 参数会展开为子行/)

// 关闭 JSON 参数解析后，参数按字符串比较，不产生嵌套行
await page.getByRole('checkbox', { name: '解析 JSON 参数' }).uncheck()
await page.waitForTimeout(700)
assert.equal(await page.locator('.url-diff-row').count(), 5)
assert.equal(await page.locator('.url-diff-row', { hasText: 'filter.status' }).count(), 0)
assert.match(await page.locator('.diff-option-note').innerText(), /按字符串比较/)
await page.getByRole('checkbox', { name: '解析 JSON 参数' }).check()
await page.waitForTimeout(700)
assert.equal(await page.locator('.url-diff-row').count(), 10)
assert.match(await page.locator('.diff-option-note').innerText(), /JSON 参数会展开为子行/)
console.log('• JSON parameter toggle ok')
await page.screenshot({ path: '/tmp/jizhu-diff-url.png' })
await page.getByRole('button', { name: /复制 表格/ }).click()
await page.waitForTimeout(250)
const table = await page.evaluate(() => window.__copied)
assert.match(table, /^部分\t参数/m)
assert.match(table, /filter\.status\t"active"\t"inactive"/)
console.log('• URL diff table ok')

// 文本模式
await page.getByRole('tab', { name: '文本对比' }).click()
await page.waitForTimeout(900)
assert.match(await page.locator('.diff-line-head').innerText(), /A — Untitled-1\.json/)
const virtualRows = await page.locator('.diff-line-row').count()
const virtualHeight = await page.locator('.diff-line-scroll').evaluate((element) => element.scrollHeight)
assert.ok(virtualRows < 120, `diff should virtualize, got ${virtualRows}`)
assert.ok(virtualHeight > 40_000, `diff scroll height ${virtualHeight}`)
await page.getByRole('button', { name: '下一处差异' }).click()
await page.waitForTimeout(250)
assert.match(await page.locator('.diff-nav-count').innerText(), /^1\/\d+/)
assert.equal(await page.locator('.diff-line-row.focused').count(), 1)
await page.keyboard.press('Alt+ArrowDown')
await page.waitForTimeout(250)
assert.match(await page.locator('.diff-nav-count').innerText(), /^2\/\d+/)
await page.locator('.diff-line-scroll').evaluate((element) => {
  element.scrollTop = 480 * 22
})
await page.waitForTimeout(300)
assert.equal(await page.locator('.diff-gap-row').count(), 1)
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('dark')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.waitForTimeout(250)
assert.match(
  await page.locator('.diff-gap-row').evaluate((element) => getComputedStyle(element).backgroundColor),
  /22, 27, 34/,
)
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('light')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.locator('.diff-gap-button').click()
await page.waitForTimeout(1000)
assert.equal(await page.locator('.diff-gap-row').count(), 0)
console.log(`• text diff virtualized: ${virtualRows} DOM rows, ${virtualHeight}px; collapse + jump ok`)

// 交换 A/B
await page.getByRole('button', { name: '交换 A / B' }).click()
await page.waitForTimeout(800)
const bSelected = await page.locator('[aria-label="B 侧来源"] option:checked').innerText()
assert.match(bSelected, /Untitled-1\.json/)
console.log('• swap ok')
await page.screenshot({ path: '/tmp/jizhu-diff-swapped.png' })

// 创建第二个 Diff tab，名称自动区分
await page.keyboard.press('Meta+k')
await page.waitForTimeout(250)
await page.locator('.palette-search input').fill('Diff 对比')
await page.waitForTimeout(250)
await page.locator('.palette-item').first().click()
await page.waitForTimeout(400)
const diffTabs = await page.locator('.tab-label').allInnerTexts()
assert.ok(diffTabs.includes('Diff 对比'))
assert.ok(diffTabs.includes('Diff 对比 2'))
console.log('• second Diff tab gets a unique name')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('diff UI checks passed')
