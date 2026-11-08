import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const CHROME = process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = path.resolve('ui/tool-screens-20261031')
fs.mkdirSync(OUT, { recursive: true })

const MOCK = () => {
  const fallback = () => import('/src/core/fallback.ts')
  const lineDiff = (a, b) => {
    const A = a.split('\n')
    const B = b.split('\n')
    const dp = Array.from({ length: A.length + 1 }, () => Array(B.length + 1).fill(0))
    for (let i = 1; i <= A.length; i++) {
      for (let j = 1; j <= B.length; j++) {
        dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
    const rows = []
    let i = A.length
    let j = B.length
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) {
        rows.push({ kind: 'equal', a: A[i - 1], b: B[j - 1] })
        i--
        j--
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        rows.push({ kind: 'add', a: null, b: B[j - 1] })
        j--
      } else {
        rows.push({ kind: 'remove', a: A[i - 1], b: null })
        i--
      }
    }
    rows.reverse()
    let an = 1
    let bn = 1
    let added = 0
    let removed = 0
    let changed = 0
    const out = rows.map((row) => {
      if (row.kind === 'remove') removed++
      if (row.kind === 'add') added++
      return {
        kind: row.kind,
        a: row.a == null ? null : { number: an++, text: row.a },
        b: row.b == null ? null : { number: bn++, text: row.b },
      }
    })
    return { rows: out, stats: { added, removed, changed, differences: added + removed } }
  }
  const pretty = (text) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }
  window.__TAURI_INTERNALS__ = {
    transformCallback: (callback) => callback,
    unregisterCallback: () => {},
    convertFileSrc: (value) => value,
    invoke: async (cmd, args) => {
      if (cmd === 'ui_ready' || cmd === 'copy_text') return null
      if (cmd === 'json_analyze') {
        const mod = await fallback()
        return mod.analyzeLocally(args.text, args.maxNodes)
      }
      if (cmd === 'json_format') {
        const mod = await fallback()
        return mod.formatLocally(args.text, args.indent, args.sortKeys)
      }
      if (cmd === 'json_minify') {
        const mod = await fallback()
        return mod.minifyLocally(args.text)
      }
      if (cmd === 'jq_run') {
        const lines = args.input.split('\n').filter((line) => line.trim())
        let output = args.input
        if (args.program.includes('select(.score > 80)')) {
          output = lines
            .map((line) => JSON.parse(line))
            .filter((doc) => doc.score > 80)
            .map((doc) => JSON.stringify({ user: doc.user, score: doc.score }, null, 2))
            .join('\n')
        } else if (args.program.includes('.events[].payload')) {
          output = lines
            .flatMap((line) => JSON.parse(line).events.map((event) => event.payload))
            .join('\n')
        }
        return { engine: 'jaq', engineLabel: '内置 jaq 3.1', version: '3.1', output, count: output ? output.split('\n').length : 0, durationMs: 4, error: null, truncated: false }
      }
      if (cmd === 'regex_run') {
        const flags = `${args.flags.global ? 'g' : ''}${args.flags.ignoreCase ? 'i' : ''}${args.flags.multiLine ? 'm' : ''}`
        const regex = new RegExp(args.pattern, flags)
        const matches = []
        for (const match of args.text.matchAll(regex)) {
          matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], groups: match.slice(1).map((group) => group ?? null) })
        }
        return { matches, count: matches.length, unique: new Set(matches.map((match) => match.text)).size, durationMs: 2, error: null, truncated: false }
      }
      if (cmd === 'diff_text') return lineDiff(args.a, args.b)
      if (cmd === 'diff_json') return lineDiff(pretty(args.a), pretty(args.b))
      if (cmd === 'diff_url') {
        return {
          rows: [
            { section: '协议', name: 'scheme', a: 'https', b: 'https', kind: 'equal', depth: 0 },
            { section: '域名', name: 'host', a: 'api.example.com', b: 'api.example.com', kind: 'equal', depth: 0 },
            { section: '参数', name: 'page', a: '1', b: '2', kind: 'change', depth: 0 },
          ],
          stats: { added: 0, removed: 0, changed: 1, differences: 1 },
        }
      }
      if (cmd === 'curl_request') {
        const url = args.request.url
        const b = url.includes('b.example')
        return {
          status: 200,
          statusText: 'OK',
          headers: [
            ['content-type', 'application/json'],
            ['x-request-id', b ? 'req_b' : 'req_a'],
            ['server', 'example'],
          ],
          body: b ? '{"ok":false,"value":2}' : '{"ok":true,"value":1}',
          durationMs: 38,
          size: b ? 22 : 21,
          truncated: false,
        }
      }
      throw new Error(`unmocked command: ${cmd}`)
    },
  }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await context.newPage()
  await page.addInitScript(MOCK)
  await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(350)
  await page.evaluate(() => {
    if (document.querySelector('.traffic')) return
    const bar = document.querySelector('.titlebar')
    if (!bar) return
    const traffic = document.createElement('div')
    traffic.className = 'traffic'
    traffic.innerHTML = '<span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span>'
    bar.prepend(traffic)
  })
  return { page, context }
}

async function shot(page, name) {
  await page.waitForTimeout(180)
  await page.screenshot({ path: path.join(OUT, name), animations: 'disabled' })
  console.log(`✓ ${name}`)
}

async function openCommand(page, name) {
  await page.keyboard.press('Meta+k')
  await page.locator('.palette-search input').waitFor({ state: 'visible' })
  await page.locator('.palette-search input').fill(name)
  await page.waitForTimeout(150)
  await page.locator('.palette-item').first().click()
  await page.waitForTimeout(350)
}

async function chooseMode(page, label) {
  await openCommand(page, 'mode')
  await page.getByRole('option', { name: new RegExp(label) }).click()
  await page.waitForTimeout(350)
}

async function setText(page, text) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.insertText(text)
  await page.waitForTimeout(250)
}

async function closeSide(page) {
  const control = page.locator('.workspace-qr-preview button[aria-label="关闭二维码预览"], .side-tool-shell-head button[aria-label^="关闭"]').first()
  if (await control.count()) {
    await control.click()
    await page.waitForTimeout(250)
  }
}

const scenarios = [
  ['01-plain-workspace.png', async (page) => {}],
  ['02-json-mode.png', async (page) => {
    await chooseMode(page, 'JSON')
    await setText(page, JSON.stringify({ project: 'jizhu', version: '1.0.0', features: ['JSON', 'Diff', 'URL', 'Calc'], config: { theme: 'ghostty-dark', indent: 2, wrap: true }, active: true, users: [{ name: 'Ada', score: 91 }, { name: 'Bob', score: 72 }] }, null, 2))
    await page.waitForTimeout(500)
  }],
  ['03-calc-help.png', async (page) => {
    await chooseMode(page, 'Calc')
    await page.waitForTimeout(300)
  }],
  ['04-calc-results.png', async (page) => {
    await chooseMode(page, 'Calc')
    const close = page.getByRole('button', { name: '关闭 Calc 示例' })
    if (await close.count()) await close.click()
    await setText(page, 'price = 2\ncount = 8\nprice * count\nsqrt(16)\nround(1.234, 2)\ntotal = price + count\ntotal / 3')
    await page.waitForTimeout(700)
  }],
  ['05-command-palette.png', async (page) => {
    await page.keyboard.press('Meta+Shift+P')
    await page.waitForTimeout(250)
  }],
  ['06-mode-picker.png', async (page) => {
    await openCommand(page, 'mode')
  }],
  ['07-url-inspector.png', async (page) => {
    await setText(page, 'https://api.example.com/v1/search?query=jizhu&tags=json&meta=%7B%22page%22%3A1%7D&next=https%3A%2F%2Fexample.com%2Fdocs')
    await openCommand(page, 'URL 解析')
  }],
  ['08-encode-decode.png', async (page) => {
    await setText(page, 'hello 机杼')
    await openCommand(page, '编码 / 解码')
  }],
  ['09-time-converter.png', async (page) => {
    await setText(page, '1718092800')
    await openCommand(page, '时间转换')
    await page.waitForTimeout(350)
  }],
  ['10-jq-query.png', async (page) => {
    await setText(page, '{"user":"ada","score":91,"role":"admin"}\n{"user":"bob","score":72,"role":"user"}\n{"user":"coco","score":88,"role":"admin"}')
    await openCommand(page, 'jq 查询')
    await page.locator('.jq-expr').fill('select(.score > 80) | {user, score}')
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: '运行', exact: true }).click()
    await page.waitForTimeout(500)
  }],
  ['11-regex-match.png', async (page) => {
    await setText(page, 'owner ada@example.com\nadmin coco@example.com\nnoise 42')
    await openCommand(page, '正则匹配')
    await page.locator('.regex-pattern').fill('(\\w+)@([\\w.-]+)')
    await page.keyboard.press('Meta+f')
    await page.waitForTimeout(500)
    await page.locator('.regex-match-row').first().locator('.regex-match-main').click()
    await page.waitForTimeout(200)
  }],
  ['12-regex-aggregate.png', async (page) => {
    await setText(page, 'owner ada@example.com\nadmin coco@example.com\nnoise 42')
    await openCommand(page, '正则匹配')
    await page.locator('.regex-pattern').fill('(\\w+)@([\\w.-]+)')
    await page.keyboard.press('Meta+f')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '聚合' }).click()
    await page.waitForTimeout(250)
  }],
  ['13-regex-replace.png', async (page) => {
    await setText(page, 'owner ada@example.com\nadmin coco@example.com\nnoise 42')
    await openCommand(page, '正则匹配')
    await page.locator('.regex-pattern').fill('(\\w+)@([\\w.-]+)')
    await page.keyboard.press('Meta+f')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '替换', exact: true }).click()
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: '生成替换' }).click()
    await page.waitForTimeout(250)
  }],
  ['14-qr-preview.png', async (page) => {
    await setText(page, 'https://jizhu.dev/toolkit?from=ui-review&mode=dark')
    await openCommand(page, '二维码')
    await page.waitForTimeout(500)
  }],
  ['15-pipeline.png', async (page) => {
    await setText(page, '{"events":[{"payload":"dXNlcjphZGE7c2NvcmU6OTE="},{"payload":"dXNlcjpib2I7c2NvcmU6NzI="}]}')
    await openCommand(page, 'Pipeline 批处理')
    await page.getByRole('button', { name: '运行', exact: true }).click()
    await page.waitForTimeout(900)
  }],
  ['16-data-format.png', async (page) => {
    await setText(page, 'name: Ada\nage: 32\ntags:\n  - json\n  - yaml\n  - toml')
    await openCommand(page, '格式转换')
    await page.waitForTimeout(300)
  }],
  ['17-curl-request.png', async (page) => {
    await setText(page, "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}'")
    await openCommand(page, 'cURL 请求')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.waitForTimeout(500)
  }],
  ['18-diff-json.png', async (page) => {
    await setText(page, '{"name":"Ada","age":32,"role":"admin"}')
    await openCommand(page, 'Diff 对比')
    await page.locator('.diff-source').nth(1).getByRole('button', { name: '编辑' }).click()
    await page.locator('.diff-modal-input').fill('{"name":"Ada","age":31,"role":"admin"}')
    await page.getByRole('button', { name: '应用', exact: true }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '开始对比' }).click()
    await page.waitForTimeout(500)
  }],
  ['19-diff-curl.png', async (page) => {
    await setText(page, 'curl -X GET https://a.example/api')
    await openCommand(page, 'Diff 对比')
    await page.getByRole('tab', { name: 'cURL 响应' }).click()
    await page.locator('.diff-source').nth(1).getByRole('button', { name: '编辑' }).click()
    await page.locator('.diff-modal-input').fill('curl -X POST https://b.example/api')
    await page.getByRole('button', { name: '应用', exact: true }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '开始对比' }).click()
    await page.waitForTimeout(600)
  }],
  ['20-settings-shortcuts.png', async (page) => {
    await openCommand(page, 'settings')
    await page.getByRole('button', { name: '快捷键' }).click()
    await page.waitForTimeout(250)
  }],
  ['21-close-tool-confirm.png', async (page) => {
    await setText(page, 'https://api.example.com/users?id=42')
    await openCommand(page, 'URL 解析')
    await page.keyboard.press('Meta+w')
    await page.waitForTimeout(250)
  }],
  ['22-status-menu.png', async (page) => {
    await page.locator('.status-mode').click()
    await page.waitForTimeout(200)
  }],
]

try {
  for (const [name, setup] of scenarios) {
    const { page, context } = await newPage()
    await setup(page)
    await shot(page, name)
    await context.close()
  }
  console.log(`\nScreenshots saved to ${OUT}`)
} finally {
  await browser.close()
}
