// Full feature walkthrough with a mocked Tauri IPC layer.
// Native process isolation is covered by Rust tests; this checks UI flows.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const chrome = process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.addInitScript(() => {
  const fallback = () => import('/src/core/fallback.ts')
  window.__TAURI_INTERNALS__ = {
    transformCallback: (callback) => callback,
    unregisterCallback: () => {},
    convertFileSrc: (path) => path,
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
        let output = ''
        if (args.program.includes('.events[].payload')) {
          output = lines
            .map((line) => {
              const doc = JSON.parse(line)
              return doc.events.map((event) => event.payload).join('\n')
            })
            .join('\n')
        } else if (args.program.includes('select(.score > 80)')) {
          output = lines
            .map((line) => JSON.parse(line))
            .filter((doc) => doc.score > 80)
            .map((doc) => JSON.stringify(args.program.includes('.user') ? doc.user : doc))
            .join('\n')
        } else if (args.program.includes('.[0]')) {
          output = JSON.stringify(JSON.parse(args.input).users?.[0] ?? JSON.parse(args.input))
        } else {
          output = args.input
        }
        return {
          engine: 'jaq',
          engineLabel: '内置 jaq 3.1',
          version: '3.1',
          output,
          count: output ? output.split('\n').length : 0,
          durationMs: 3,
          error: null,
          truncated: false,
        }
      }
      if (cmd === 'curl_request') {
        const url = args.request.url
        const isB = url.includes('b.example')
        return {
          status: 200,
          statusText: 'OK',
          headers: [
            ['content-type', 'application/json'],
            ['x-test', isB ? 'b' : 'a'],
          ],
          body: isB ? '{"ok":false,"value":2}' : '{"ok":true,"value":1}',
          durationMs: 3,
          size: isB ? 22 : 21,
          truncated: false,
        }
      }
      if (cmd === 'regex_run') {
        const flags = `${args.flags.global ? 'g' : ''}${args.flags.ignoreCase ? 'i' : ''}${args.flags.multiLine ? 'm' : ''}`
        let regex
        try {
          regex = new RegExp(args.pattern, flags)
        } catch (error) {
          return {
            matches: [],
            count: 0,
            unique: 0,
            durationMs: 1,
            error: { message: String(error), kind: 'syntax' },
            truncated: false,
          }
        }
        const matches = []
        const seen = new Set()
        const add = (match) => {
          if (match.index == null) return
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            groups: match.slice(1).map((group) => group ?? null),
          })
          seen.add(match[0])
        }
        if (args.flags.global) for (const match of args.text.matchAll(regex)) add(match)
        else {
          const match = regex.exec(args.text)
          if (match) add(match)
        }
        return {
          matches,
          count: matches.length,
          unique: seen.size,
          durationMs: 2,
          error: null,
          truncated: false,
        }
      }
      if (cmd === 'diff_text' && args.a.startsWith('# request')) {
        const aFirst = args.a.split('\n').slice(0, 3).join('\n')
        const bFirst = args.b.split('\n').slice(0, 3).join('\n')
        return {
          rows: [
            { kind: 'change', a: { number: 1, text: aFirst }, b: { number: 1, text: bFirst } },
            { kind: 'equal', a: { number: 4, text: '# headers' }, b: { number: 4, text: '# headers' } },
              { kind: 'change', a: { number: 5, text: 'x-test: a' }, b: { number: 5, text: 'x-test: b' } },
          ],
          stats: { added: 0, removed: 0, changed: 2, differences: 2 },
        }
      }
      if (cmd === 'diff_text' || cmd === 'diff_json') {
        return {
          rows: [
            { kind: 'equal', a: { number: 1, text: '{' }, b: { number: 1, text: '{' } },
            { kind: 'change', a: { number: 2, text: '"a": 1' }, b: { number: 2, text: '"a": 2' } },
            { kind: 'equal', a: { number: 3, text: '}' }, b: { number: 3, text: '}' } },
          ],
          stats: { added: 1, removed: 1, changed: 1, differences: 1 },
        }
      }
      if (cmd === 'diff_url') {
        return {
          rows: [
            { section: '协议', name: 'scheme', a: 'https', b: 'https', kind: 'equal', depth: 0 },
            { section: '域名', name: 'host', a: 'example.com', b: 'example.com', kind: 'equal', depth: 0 },
            { section: '参数', name: 'a', a: '1', b: '2', kind: 'change', depth: 0 },
          ],
          stats: { added: 1, removed: 1, changed: 1, differences: 1 },
        }
      }
      throw new Error(`unmocked command: ${cmd}`)
    },
  }
})

const log = (message) => console.log(`• ${message}`)
async function openCommand(name) {
  await page.keyboard.press('Meta+Shift+P')
  await page.waitForTimeout(60)
  await page.keyboard.press('/')
  await page.waitForTimeout(60)
  await page.locator('.palette-search input').fill(name)
  await page.waitForTimeout(120)
  await page.locator('.palette-item').first().click()
  await page.waitForTimeout(300)
}
async function closePanels() {
  for (let i = 0; i < 8; i++) {
    const panels = await page.locator('.workspace-panel').count()
    const split = await page.locator('.workspace-qr-split').count()
    if (panels === 0 && split === 0) break
    const sideClose = page.locator(
      '.workspace-qr-preview button[aria-label="关闭二维码预览"], .side-tool-shell-head button[aria-label^="关闭"]',
    ).first()
    if (await sideClose.count()) {
      await sideClose.click()
      await page.waitForTimeout(160)
      continue
    }
    const panelClose = page.locator('.workspace-panel-head button[aria-label="关闭面板"]').first()
    if (await panelClose.count()) {
      await panelClose.click()
      await page.waitForTimeout(160)
      continue
    }
    break
  }
}
async function setText(text) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type(text)
  await page.waitForTimeout(250)
}

try {
  await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(350)

  log('startup / dark / empty plain workspace')
  assert.equal(await page.locator('.tiling-tab').count(), 1)
  assert.equal(await page.locator('.status-mode').innerText(), 'PLAIN')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  assert.equal(await page.locator('.workspace-editor').count(), 1)
  assert.equal(await page.locator('.tool-header').count(), 0)

  log('JSON mode, indent 2, tree, search, undo, error recovery')
  await openCommand('模式')
  await page.getByRole('option', { name: /JSON/ }).click()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.status-mode').innerText(), 'JSON')
  assert.equal(await page.locator('.json-tool .tree-pane').count(), 1)
  await setText('{"a":1,"b":[1,2]}')
  await page.waitForTimeout(600)
  assert.match(await page.locator('.tiling-statusbar').innerText(), /有效 JSON/)
  assert.match(await page.locator('.cm-content').innerText(), /"a":1/)
  await openCommand('格式化 JSON')
  await page.waitForTimeout(300)
  assert.match(await page.locator('.cm-content').innerText(), /\{"a": 1, "b": \[1, 2\]\}/)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+f')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.cm-search').count(), 1)
  await page.locator('.cm-search .cm-textfield').first().fill('"a"')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  assert.ok((await page.locator('.cm-searchMatch').count()) > 0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  assert.doesNotMatch(await page.locator('.cm-content').innerText(), /"a": 1/)
  await setText('{"a": }')
  await page.waitForTimeout(600)
  assert.match(await page.locator('.tiling-statusbar').innerText(), /语法错误/)
  assert.match(await page.locator('.pane-header').first().innerText(), /语法错误/)

  log('tree hide/show and minimum width')
  await page.getByRole('button', { name: '隐藏树形区域' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.json-tool .tree-pane').count(), 0)
  await page.getByRole('button', { name: '打开树形区域' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.json-tool .tree-pane').count(), 1)
  const treeBefore = await page.locator('.tree-pane').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  const box = await page.locator('.json-tool .resizer').boundingBox()
  assert.ok(box)
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(40, box.y + 200, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const treeAfter = await page.locator('.tree-pane').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  assert.ok(treeAfter >= 150 && treeAfter < treeBefore)

  log('settings: themes, indent default 2, wrap, shortcuts')
  await openCommand('设置')
  assert.equal(await page.locator('.settings-dialog').count(), 1)
  const themeSelect = page.locator('.settings-dialog .settings-row').filter({ hasText: '主题' }).first().locator('select')
  assert.equal(await themeSelect.inputValue(), 'ghostty')
  await themeSelect.selectOption('solarized-light')
  await page.waitForTimeout(250)
  assert.equal(await page.evaluate(() => document.documentElement.dataset.themeVariant), 'solarized-light')
  await themeSelect.selectOption('ghostty')
  await page.waitForTimeout(200)
  await page.locator('.settings-dialog').getByRole('button', { name: '编辑器' }).click()
  await page.waitForTimeout(150)
  const indentSelect = page.locator('.settings-dialog select').last()
  assert.equal(await indentSelect.inputValue(), '2')
  await indentSelect.selectOption('4')
  assert.match(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await page.locator('.settings-switch').click()
  await page.waitForTimeout(200)
  assert.doesNotMatch(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await page.locator('.settings-switch').click()
  await page.waitForTimeout(200)
  assert.match(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await page.locator('.settings-dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.waitForTimeout(150)
  await setText('{"alpha":"abcdefghij","beta":"klmnopqrst","gamma":"uvwxyz0123","delta":"4567890"}')
  await openCommand('格式化 JSON')
  await page.waitForTimeout(300)
  assert.match(await page.locator('.cm-content').innerText(), /    "alpha":/)

  log('panels: input source selection, switch tab/manual')
  await closePanels()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('beta')
  await page.waitForTimeout(200)
  await page.keyboard.press('Meta+ArrowUp')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.waitForTimeout(150)
  await openCommand('Diff 对比')
  assert.equal(await page.locator('.workspace-panel-source select').inputValue(), 'selection')
  await page.locator('.workspace-panel-source select').selectOption('tab')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.workspace-panel-source select').inputValue(), 'tab')
  await page.locator('.workspace-panel-source select').selectOption('manual')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.workspace-panel-source select').inputValue(), 'manual')
  await closePanels()

  log('QR: editor left / preview right, live, singleton, no input source')
  await closePanels()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('hello jizhu')
  await page.waitForTimeout(200)
  await openCommand('二维码')
  assert.equal(await page.locator('.workspace-qr-split').count(), 1)
  assert.equal(await page.locator('.workspace-qr-editor .cm-content').count(), 1)
  assert.equal(await page.locator('.workspace-qr-preview canvas').count(), 1)
  assert.equal(await page.locator('.workspace-panel-source').count(), 0)
  assert.equal(await page.locator('.qr-textarea').count(), 0)
  const qrBefore = await page.locator('.qr-canvas').evaluate((canvas) => canvas.toDataURL())
  await page.locator('.workspace-qr-editor .cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('hello jizhu changed')
  await page.waitForTimeout(500)
  const qrAfter = await page.locator('.qr-canvas').evaluate((canvas) => canvas.toDataURL())
  assert.notEqual(qrBefore, qrAfter)
  await openCommand('二维码')
  assert.equal(await page.locator('.workspace-qr-split').count(), 1)
  assert.equal(await page.locator('.workspace-panel').count(), 0)
  await page.getByRole('button', { name: '关闭二维码预览' }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.workspace-qr-split').count(), 0)

  log('URL: editor-powered side split, params, JSON preview')
  await setText('https://example.com/v1?name=ada&age=32&meta=%7B%22ok%22%3Atrue%7D')
  await openCommand('URL 解析')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  assert.equal(await page.locator('.url-input').count(), 0)
  assert.equal(await page.locator('.workspace-panel-source').count(), 0)
  assert.match(await page.locator('.url-structure').innerText(), /example\.com/)
  assert.ok((await page.locator('.url-param-row').count()) >= 3)
  const paramsBefore = await page.locator('.url-param-row').count()
  await page.locator('.url-add-param').click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.url-param-row').count(), paramsBefore + 1)
  await page.locator('.url-json-badge').first().click()
  await page.waitForTimeout(200)
  assert.ok((await page.locator('.url-json-preview').count()) > 0)

  const level4 = 'https://d.example/?d=4'
  const level3 = `https://c.example/?z=3&next=${encodeURIComponent(level4)}`
  const level2 = `https://b.example/?x=1&next=${encodeURIComponent(level3)}`
  const nested = `https://a.example/?redirect=${encodeURIComponent(level2)}`
  await page.locator('.workspace-qr-editor .cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type(nested)
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.url-seg.path').count(), 1)
  assert.equal(await page.locator('.url-nested-block').count(), 3)
  const [keyWidth, valueWidth] = await page.locator('.url-param-row').first().evaluate((row) =>
    [...row.querySelectorAll('.url-param-input')].map((node) => Math.round(node.getBoundingClientRect().width)),
  )
  assert.ok(Math.abs(keyWidth - valueWidth) <= 1)
  await closePanels()

  log('time: editor-powered side split')
  await setText('1718092800')
  await openCommand('时间转换')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  assert.equal(await page.locator('.time-input').count(), 0)
  assert.equal(await page.locator('.workspace-panel-source').count(), 0)
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.time-card').count(), 3)
  assert.match(await page.locator('.time-card-value').first().innerText(), /2024-06-11/)
  await page.getByRole('button', { name: '时间 → 时间戳' }).click()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.time-card').count(), 3)
  await closePanels()

  log('codec: editor-powered side split')
  await setText('hello')
  await openCommand('编码 / 解码')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  assert.equal(await page.locator('.codec-input').count(), 0)
  assert.equal(await page.locator('.workspace-panel-source').count(), 0)
  await page.waitForTimeout(300)
  assert.equal((await page.locator('.side-codec-output').innerText()).trim(), 'aGVsbG8')
  await page.getByRole('button', { name: '解码', exact: true }).click()
  await page.locator('.workspace-qr-editor .cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('aGVsbG8')
  await page.waitForTimeout(300)
  assert.ok((await page.locator('.side-codec-output').innerText()).includes('hello'))
  await closePanels()

  log('data: YAML / TOML ↔ JSON')
  await setText('name: Ada\nage: 32')
  await openCommand('格式转换')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  await page.waitForTimeout(200)
  assert.match(await page.locator('.data-convert-pre').innerText(), /"name": "Ada"/)
  await closePanels()

  await setText('{"name":"Ada","age":32}')
  await openCommand('格式转换')
  await page.locator('.data-convert select').selectOption('json:toml')
  await page.waitForTimeout(200)
  assert.match(await page.locator('.data-convert-pre').innerText(), /name = "Ada"/)
  await closePanels()

  log('curl: editor curl command, response headers/body')
  await setText("curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}'")
  await openCommand('cURL 请求')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  assert.equal(await page.locator('.curl-method').innerText(), 'POST')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.waitForTimeout(300)
  assert.match(await page.locator('.curl-status').innerText(), /200 OK/)
  assert.match(await page.locator('.curl-body').innerText(), /"ok": true/)
  await page.getByRole('button', { name: /Headers/ }).click()
  await page.waitForTimeout(150)
  assert.match(await page.locator('.curl-headers').innerText(), /content-type/)
  await closePanels()

  log('curl diff: original commands + headers + formatted body')
  await setText('curl https://a.example/api')
  await openCommand('Diff 对比')
  await page.getByRole('tab', { name: 'cURL 响应' }).click()
  await page.waitForTimeout(200)
  await page.locator('.diff-source').nth(1).getByRole('button', { name: '编辑' }).click()
  await page.locator('.diff-modal-input').fill('curl https://b.example/api')
  await page.getByRole('button', { name: '应用', exact: true }).click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: '开始对比' }).click()
  await page.waitForTimeout(500)
  assert.ok((await page.locator('.diff-line-row').count()) > 0)
  const curlDiffText = await page.locator('.diff-result-area').innerText()
  assert.match(curlDiffText, /# request|# response/)
  await closePanels()

  log('regex: editor-powered side split, Cmd+F, aggregate, replace preview')
  await setText('ada@example.com bob@example.com')
  await openCommand('正则匹配')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  assert.equal(await page.locator('.workspace-panel-source').count(), 0)
  assert.equal(await page.locator('.regex-source').isVisible().catch(() => false), false)
  await page.locator('.regex-pattern').fill('(\\w+)@example\\.com')
  await page.keyboard.press('Meta+f')
  await page.waitForTimeout(700)
  assert.equal(await page.locator('.regex-match-row').count(), 2)
  assert.equal(await page.locator('.cm-regex-hit').count(), 2)
  await page.locator('.regex-match-row').first().locator('.regex-match-main').click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.cm-regex-current').count(), 1)
  await page.getByRole('button', { name: '聚合' }).click()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.regex-aggregate-row').count(), 2)
  assert.equal(await page.getByRole('button', { name: /结果/ }).count(), 1)
  await page.getByRole('button', { name: '替换', exact: true }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.regex-replace-preview').count(), 0)
  await page.getByRole('button', { name: '生成替换' }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.regex-replace-preview').count(), 1)
  await closePanels()

  log('jq: editor-powered side split, built-in jaq only')
  await setText('{"user":"ada","score":91}\n{"user":"bob","score":72}')
  await openCommand('jq 查询')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  assert.equal(await page.locator('.workspace-panel-source').count(), 0)
  assert.equal(await page.locator('.jq-input').isVisible().catch(() => false), false)
  await page.locator('.jq-expr').fill('select(.score > 80) | .user')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.waitForTimeout(500)
  assert.match(await page.locator('.jq-output').innerText(), /ada/)
  await closePanels()

  log('diff: A current tab / B manual, compare')
  await closePanels()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('{"a":1}')
  await page.waitForTimeout(300)
  await openCommand('Diff 对比')
  await page.getByRole('tab', { name: 'JSON 结构化' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.diff-indent').inputValue(), '2')
  const bEdit = page.locator('.diff-source').nth(1).getByRole('button', { name: '编辑' })
  await bEdit.click()
  await page.locator('.diff-modal-input').fill('{"a":2}')
  await page.getByRole('button', { name: '应用', exact: true }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '开始对比' }).click()
  await page.waitForTimeout(500)
  assert.ok((await page.locator('.diff-line-row').count()) > 0)
  assert.match(await page.locator('.diff-footer').innerText(), /1 行差异/)
  assert.match(await page.locator('.diff-hunk-count').innerText(), /组差异|无差异/)
  await closePanels()

  log('pipeline: editor source, step rows, result')
  await setText('{"events":[{"payload":"aGVsbG8="}]}')
  await openCommand('Pipeline 批处理')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  assert.equal(await page.locator('.pipeline-input').count(), 0)
  assert.equal(await page.locator('.pipeline-row').count(), 4)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.waitForTimeout(800)
  assert.equal(await page.locator('.pipeline-row.success').count(), 4)
  assert.equal(await page.locator('.pipeline-side-result').count(), 1)
  assert.match(await page.locator('.pipeline-side-result').innerText(), /已完成 4\/4/)
  await page.getByRole('button', { name: '编辑步骤' }).first().click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.pipeline-row-config').count(), 1)
  await page.getByRole('button', { name: '导出工作流' }).click()
  const workflow = JSON.parse(await page.locator('.pipeline-io-text').inputValue())
  assert.equal(workflow.input, undefined)
  assert.equal(workflow.steps.length, 4)
  await page.getByRole('button', { name: '关闭工作流文本' }).click()
  await closePanels()

  log('normal panels: Diff only, maximize, close')
  await openCommand('Diff 对比')
  assert.equal(await page.locator('.workspace-panel').count(), 1)
  await page.getByRole('button', { name: '最大化面板' }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.workspace-panels.is-maximized').count(), 1)
  await page.getByRole('button', { name: '还原平铺' }).click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: '关闭面板' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.workspace-panel').count(), 0)
  await closePanels()

  assert.deepEqual(errors, [])
  console.log('\nAll feature checks passed.')
} finally {
  await browser.close()
}
