import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })

await page.addInitScript(() => {
  const encoded = [
    'dXNlcjphZGE7c2NvcmU6OTE=',
    'dXNlcjpib2I7c2NvcmU6NzI=',
    'dXNlcjphZGE7c2NvcmU6ODg=',
  ]
  window.__TAURI_INTERNALS__ = {
    transformCallback: (callback) => callback,
    unregisterCallback: () => {},
    convertFileSrc: (path) => path,
    invoke: async (cmd, args) => {
      if (cmd === 'ui_ready' || cmd === 'copy_text') return null
      if (cmd === 'jq_run') {
        if (args.program.includes('bad')) {
          return {
            engine: 'system',
            engineLabel: '系统 jq',
            version: 'jq-1.7.1',
            output: '',
            count: 0,
            durationMs: 2,
            error: { message: 'jq 编译失败', kind: 'syntax' },
            truncated: false,
          }
        }
        return {
          engine: 'system',
          engineLabel: '系统 jq',
          version: 'jq-1.7.1',
          output: (args.raw ? encoded : encoded.map((line) => JSON.stringify(line))).join('\n'),
          count: encoded.length,
          durationMs: 2,
          error: null,
          truncated: false,
        }
      }
      if (cmd === 'regex_run') {
        if (args.pattern.includes('(') && !args.pattern.includes(')')) {
          return {
            matches: [],
            count: 0,
            unique: 0,
            durationMs: 1,
            error: { message: '第 21 列：未闭合的 (', kind: 'syntax' },
            truncated: false,
          }
        }
        const regex = new RegExp(args.pattern, args.flags.global ? 'g' : '')
        const matches = []
        for (const match of args.text.matchAll(regex)) {
          if (match.index == null) continue
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            groups: match.slice(1).map((group) => group ?? null),
          })
        }
        return {
          matches,
          count: matches.length,
          unique: new Set(matches.map((match) => match.text)).size,
          durationMs: 1,
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
await page.getByRole('button', { name: /打开\s*管道处理/ }).click()
await page.waitForTimeout(500)
assert.equal(await page.locator('.pipeline-step-card').count(), 4)
const stepBoxes = await page.locator('.pipeline-step-card').evaluateAll((cards) =>
  cards.map((card) => card.getBoundingClientRect().top),
)
assert.ok(stepBoxes[1] > stepBoxes[0] && stepBoxes[2] > stepBoxes[1])
const layout = await page.evaluate(() => {
  const input = document.querySelector('.pipeline-input-section')?.getBoundingClientRect()
  const steps = document.querySelector('.pipeline-steps-section')?.getBoundingClientRect()
  const result = document.querySelector('.pipeline-result')?.getBoundingClientRect()
  return { input, steps, result }
})
assert.ok(layout.input && layout.steps && layout.result)
assert.ok(layout.input.bottom <= layout.steps.top + 1)
assert.ok(layout.steps.left < layout.result.left)
assert.ok(Math.abs(layout.steps.top - layout.result.top) < 4)
const stepsBefore = layout.steps.width
const splitter = await page.locator('.pipeline-splitter').boundingBox()
assert.ok(splitter)
await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 80)
await page.mouse.down()
await page.mouse.move(splitter.x - 90, splitter.y + 80, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(200)
const stepsAfter = await page.locator('.pipeline-steps-section').boundingBox()
assert.ok(stepsAfter && stepsAfter.width < stepsBefore - 40)
await page.getByRole('button', { name: '运行' }).click()
await page.waitForTimeout(1400)
assert.equal(await page.locator('.pipeline-step-card.success').count(), 4)
assert.match(await page.locator('.pipeline-result-pre').innerText(), /2\tuser:ada/)
assert.match(await page.locator('.pipeline-result-pre').innerText(), /1\tuser:bob/)
assert.match(await page.locator('.small-tool-foot').innerText(), /已完成 4\/4/)
console.log('• pipeline 4-step success and count sort ok')
await page.screenshot({ path: '/tmp/jizhu-pipeline-tool.png' })

// 关闭 jq raw 后，Base64 收到带引号内容，错误应给出可操作提示
const jqCard = page.locator('.pipeline-step-card', { hasText: 'jq 提取' })
await jqCard.click()
await page.waitForTimeout(200)
await page.locator('.pipeline-config-panel .pipeline-flags input').uncheck()
await page.getByRole('button', { name: '完成' }).click()
await page.getByRole('button', { name: '运行' }).click()
await page.waitForTimeout(1000)
assert.match(await page.locator('.pipeline-error-card').innerText(), /原始字符串/)
await page.locator('.pipeline-config-panel').count()
await page.locator('.pipeline-step-card', { hasText: 'jq 提取' }).click()
await page.locator('.pipeline-config-panel .pipeline-flags input').check()
await page.getByRole('button', { name: '完成' }).click()
console.log('• jq raw warning is actionable')

// 正则步骤失败：后续步骤跳过，结果保留步骤 2 快照
const regexCard = page.locator('.pipeline-step-card', { hasText: '正则匹配' })
await regexCard.click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.pipeline-config-panel').count(), 1)
await page.screenshot({ path: '/tmp/jizhu-pipeline-config.png' })
await page.locator('.pipeline-config-panel .pipeline-field input').fill('(')
await page.getByRole('button', { name: '完成' }).click()
await page.getByRole('button', { name: '运行' }).click()
await page.waitForTimeout(1000)
assert.equal(await page.locator('.pipeline-step-card.failed').count(), 1)
assert.equal(await page.locator('.pipeline-step-card.skipped').count(), 1)
assert.match(await page.locator('.pipeline-error-card').innerText(), /未闭合/)
assert.match(await page.locator('.pipeline-result-pre').innerText(), /user:ada;score:91/)
assert.match(await page.locator('.small-tool-foot').innerText(), /在第 3 步中断/)
console.log('• failure stop, skip and last-success snapshot ok')
await page.screenshot({ path: '/tmp/jizhu-pipeline-failed.png' })

// 添加步骤
await page.locator('.pipeline-add').selectOption('count')
await page.waitForTimeout(300)
assert.equal(await page.locator('.pipeline-step-card').count(), 5)
assert.equal(await page.locator('.pipeline-config-panel').count(), 1)
await page.getByRole('button', { name: '完成' }).click()
console.log('• add step and config panel ok')

// 文本导入 / 导出，不触碰本地文件
await page.getByRole('button', { name: '导出', exact: true }).click()
await page.waitForTimeout(250)
const exported = await page.locator('.pipeline-io-text').inputValue()
assert.match(exported, /"steps"/)
await page.locator('.pipeline-io-dialog footer').getByRole('button', { name: '关闭' }).click()
await page.getByRole('button', { name: '导入工作流' }).click()
await page.screenshot({ path: '/tmp/jizhu-pipeline-io.png' })
await page.locator('.pipeline-io-text').fill('{bad')
await page.getByRole('button', { name: '应用', exact: true }).click()
await page.waitForTimeout(200)
assert.equal(await page.locator('.pipeline-io-error').count(), 1)
await page.locator('.pipeline-io-text').fill(
  JSON.stringify({ version: 1, name: 'one-step', input: 'a\nb\na', steps: [{ id: 's1', type: 'count', sort: 'desc' }] }),
)
await page.getByRole('button', { name: '应用', exact: true }).click()
await page.waitForTimeout(300)
assert.equal(await page.locator('.pipeline-step-card').count(), 1)
console.log('• pipeline text import/export (no local files) ok')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('pipeline UI checks passed')
