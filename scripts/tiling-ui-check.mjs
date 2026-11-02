import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const chrome = process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

const step = (name) => console.log(`• ${name}`)

async function editorText() {
  const text = await page.locator('.cm-content').innerText()
  return text
    .replace('输入或粘贴文本…', '')
    .replace('⌘⇧P 打开命令面板 · 所有操作都可通过命令面板完成', '')
    .trim()
}

async function openCommand(name) {
  await page.keyboard.press('Meta+Shift+P')
  await page.locator('.palette-search input').fill(name)
  await page.waitForTimeout(120)
  await page.locator('.palette-item').first().click()
  await page.waitForTimeout(300)
}

async function closeOpenTool() {
  const sideClose = page.locator(
    '.workspace-qr-preview button[aria-label="关闭二维码预览"], .side-tool-shell-head button[aria-label^="关闭"]',
  ).first()
  if (await sideClose.count()) {
    await sideClose.click()
    await page.waitForTimeout(160)
    return true
  }
  const panelClose = page.locator('.workspace-panel-head button[aria-label="关闭面板"]').first()
  if (await panelClose.count()) {
    await panelClose.click()
    await page.waitForTimeout(160)
    return true
  }
  return false
}

try {
  await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  assert.equal(
    await page.locator('.app').evaluate((node) => getComputedStyle(node).backgroundColor),
    'rgb(40, 44, 52)',
  )
  assert.equal(
    await page.locator('.status-mode').evaluate((node) => getComputedStyle(node).color),
    'rgb(129, 162, 190)',
  )

  step('Tiling shell starts with one numbered plain workspace')
  assert.equal(await page.locator('.tiling-tab').count(), 1)
  assert.equal(await page.locator('.tiling-tab .tab-label').first().innerText(), 'untitled-1')
  assert.equal(await page.locator('.status-mode').innerText(), 'PLAIN')
  assert.equal(await page.locator('.workspace-editor').count(), 1)
  assert.equal(await page.locator('#welcome, .welcome').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')

  step('status bar: language menu, search and command actions')
  await page.locator('.status-mode').click()
  await page.waitForTimeout(120)
  assert.equal(await page.locator('.status-language-menu').count(), 1)
  await page.getByRole('option', { name: /JSON/ }).click()
  await page.waitForTimeout(350)
  assert.equal(await page.locator('.status-mode').innerText(), 'JSON')
  assert.equal(await page.locator('.json-tool .tree-pane').count(), 1)
  await page.locator('.status-mode').click()
  await page.waitForTimeout(120)
  await page.getByRole('option', { name: /PLAIN/ }).click()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.status-mode').innerText(), 'PLAIN')
  await page.locator('.status-action').filter({ hasText: '搜索' }).click()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.cm-search').count(), 1)
  await page.keyboard.press('Escape')
  await page.locator('.status-action').filter({ hasText: '命令' }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.palette').count(), 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)

  step('plain editor search, typing and Ctrl+Z')
  await page.locator('.cm-content').click()
  await page.waitForTimeout(100)
  await page.keyboard.press('Meta+f')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.cm-search').count(), 1)
  await page.keyboard.press('Escape')
  await page.locator('.cm-content').click()
  await page.keyboard.type('hello')
  await page.waitForTimeout(200)
  assert.match(await page.locator('.cm-content').innerText(), /hello/)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(250)
  assert.equal(await editorText(), '')

  step('command palette undo via control panel')
  await openCommand('撤销')
  await page.locator('.cm-content').click()
  await page.keyboard.type('world')
  await page.waitForTimeout(200)
  await openCommand('撤销')
  await page.waitForTimeout(200)
  assert.equal(await editorText(), '')

  step('selection becomes the default input source; tab and manual are switchable')
  await page.locator('.cm-content').click()
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
  await closeOpenTool()

  step('normal panel: Diff full, maximize')
  await openCommand('Diff 对比')
  assert.equal(await page.locator('.workspace-panel').count(), 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  assert.equal(await page.locator('.workspace-panel').count(), 1)
  await page.keyboard.press('Meta+Shift+F')
  await page.waitForTimeout(120)
  assert.equal(await page.locator('.workspace-panels.is-maximized').count(), 0)
  const widths = await page.locator('.workspace-panel').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)))
  assert.ok(widths[0] > 1300)
  await page.getByRole('button', { name: '最大化面板' }).click()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.workspace-panels.is-maximized').count(), 1)
  await page.getByRole('button', { name: '还原平铺' }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.workspace-panel').count(), 1)
  await closeOpenTool()
  assert.equal(await page.locator('.workspace-panel').count(), 0)

  step('settings opens from command palette and is dark-only')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await openCommand('设置')
  assert.equal(await page.locator('.settings-dialog').count(), 1)
  assert.match(await page.locator('.settings-dialog').innerText(), /深色工作台/)
  await page.locator('.settings-dialog').getByRole('button', { name: '编辑器' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.settings-dialog select').last().inputValue(), '2')
  assert.match(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await page.locator('.settings-switch').click()
  await page.waitForTimeout(200)
  assert.doesNotMatch(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await page.locator('.settings-switch').click()
  await page.waitForTimeout(200)
  assert.match(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await page.locator('.settings-dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.waitForTimeout(150)
  assert.match(await page.locator('.tiling-statusbar').innerText(), /UTF-8/)
  assert.match(await page.locator('.tiling-statusbar').innerText(), /LF/)

  step('command palette toggles wrap')
  await openCommand('关闭自动换行')
  await page.waitForTimeout(150)
  assert.doesNotMatch(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await openCommand('开启自动换行')
  await page.waitForTimeout(150)
  assert.match(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)

  step('normal panels and side tools are reachable')
  for (const [command, title] of [['Diff 对比', 'Diff 对比']]) {
    await openCommand(command)
    assert.equal(await page.locator('.workspace-panel-head strong').last().innerText(), title)
    await closeOpenTool()
  }
  for (const [command, title] of [
    ['jq 查询', 'jq 查询'],
    ['正则匹配', '正则匹配'],
    ['URL 解析', 'URL 解析'],
    ['时间转换', '时间转换'],
    ['编码 / 解码', '编码 / 解码'],
    ['Pipeline 批处理', 'Pipeline 批处理'],
    ['格式转换', '格式转换'],
    ['cURL 请求', 'cURL 请求'],
  ]) {
    await openCommand(command)
    assert.equal(await page.locator('.side-tool-split').count(), 1)
    assert.equal(await page.locator('.side-tool-shell-head strong').last().innerText(), title)
    await closeOpenTool()
  }

  step('Esc no longer closes tools; ⌘W closes a tool directly without prompting')
  await openCommand('URL 解析')
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.side-tool-split').count(), 1)
  await page.keyboard.press('Meta+w')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.close-confirm').count(), 0)
  assert.equal(await page.locator('.side-tool-split').count(), 0)

  step('command palette english aliases')
  await page.keyboard.press('Meta+Shift+P')
  await page.locator('.palette-search input').fill('settings')
  await page.waitForTimeout(160)
  assert.match(await page.locator('.palette-item').first().innerText(), /设置/)
  assert.match(await page.locator('.palette-item').first().innerText(), /Settings/)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)

  step('switch to JSON mode: keyboard mode picker, tree and syntax colors')
  await openCommand('mode')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  assert.equal(await page.locator('.status-mode').innerText(), 'JSON')
  assert.equal(await page.locator('.json-tool').count(), 1)
  assert.equal(await page.locator('.json-tool .tree-pane').count(), 1)
  await page.getByRole('button', { name: '隐藏树形区域' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.json-tool .tree-pane').count(), 0)
  await page.getByRole('button', { name: '打开树形区域' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.json-tool .tree-pane').count(), 1)

  const treeBefore = await page.locator('.json-tool .tree-pane').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  const resizer = await page.locator('.json-tool .resizer').boundingBox()
  assert.ok(resizer)
  await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + 200)
  await page.mouse.down()
  await page.mouse.move(40, resizer.y + 200, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const treeAfter = await page.locator('.json-tool .tree-pane').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  assert.ok(treeAfter >= 150)
  assert.ok(treeAfter < treeBefore)
  assert.ok(treeAfter < 320)

  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('{"name":"ada","ok":true,"level1":{"level2":{"level3":{"level4":1}}}}')
  await page.waitForTimeout(500)
  const syntaxColors = await page.locator('.cm-content .cm-line span').evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).color),
  )
  assert.ok(syntaxColors.includes('rgb(129, 162, 190)'), 'JSON keys should be Ghostty blue')
  assert.ok(syntaxColors.includes('rgb(181, 189, 104)'), 'JSON strings should be Ghostty green')
  assert.ok(syntaxColors.includes('rgb(240, 198, 116)'), 'JSON numbers should be Ghostty yellow')
  assert.ok(syntaxColors.includes('rgb(204, 102, 102)'), 'JSON booleans should be Ghostty red')

  const hscroll = await page.locator('.tree-wrap').evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }))
  assert.ok(hscroll.scroll > hscroll.client)
  await page.locator('.tree-wrap').evaluate((node) => {
    node.scrollLeft = 60
  })
  await page.waitForTimeout(120)
  assert.ok((await page.locator('.tree-wrap').evaluate((node) => node.scrollLeft)) > 0)
  // 恢复文档，后续标签标题断言使用 alpha beta
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('beta')
  await page.waitForTimeout(300)
  await page.keyboard.press('Meta+f')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.cm-search').count(), 1)
  await page.keyboard.press('Escape')

  step('QR opens as editor/preview split, singleton')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('hello qr')
  await page.waitForTimeout(200)
  await openCommand('二维码')
  assert.equal(await page.locator('.workspace-qr-split').count(), 1)
  assert.equal(await page.locator('.workspace-qr-editor .cm-content').count(), 1)
  assert.equal(await page.locator('.workspace-qr-preview .qr-canvas').count(), 1)
  assert.equal(await page.locator('.workspace-panel-source').count(), 0)
  assert.equal(await page.locator('.qr-textarea').count(), 0)
  assert.equal(await page.locator('.qr-preview-card').evaluate((node) => getComputedStyle(node).borderTopWidth), '0px')
  assert.equal(await page.locator('.qr-preview-card').evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)')
  const qrLeftBefore = await page.locator('.workspace-qr-editor').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  const qrCanvasBefore = await page.locator('.qr-canvas').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  const splitHandle = await page.locator('.qr-split-resizer').boundingBox()
  assert.ok(splitHandle)
  await page.mouse.move(splitHandle.x + splitHandle.width / 2, splitHandle.y + 240)
  await page.mouse.down()
  await page.mouse.move(220, splitHandle.y + 240, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const qrLeftAfter = await page.locator('.workspace-qr-editor').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  const qrCanvasAfter = await page.locator('.qr-canvas').evaluate((node) => Math.round(node.getBoundingClientRect().width))
  assert.ok(qrLeftAfter < qrLeftBefore)
  assert.ok(qrCanvasAfter > qrCanvasBefore)
  await openCommand('二维码')
  assert.equal(await page.locator('.workspace-qr-split').count(), 1)
  assert.equal(await page.locator('.workspace-panel').count(), 0)
  await page.getByRole('button', { name: '关闭二维码预览' }).click()
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.workspace-qr-split').count(), 0)
  assert.equal(await page.locator('.workspace-editor').count(), 1)
  // 恢复标签标题断言使用的文档
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('beta')
  await page.waitForTimeout(250)

  step('new numbered workspace and ⌘1/2/9 switching')
  await page.locator('.tab-new').click()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.tiling-tab').count(), 2)
  assert.equal(await page.locator('.tiling-tab').nth(1).locator('.tab-label').innerText(), 'untitled-2')
  await page.keyboard.press('Meta+1')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.tiling-tab.active .tab-label').innerText(), 'alpha beta')
  await page.keyboard.press('Meta+2')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.tiling-tab.active .tab-label').innerText(), 'untitled-2')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+9')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.tiling-tab.active .tab-label').innerText(), 'untitled-2')
  assert.doesNotMatch(await page.locator('.cm-content').innerText(), /^9/)

  step('⌘W closes the current empty tab without a tool')
  await page.keyboard.press('Meta+w')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.tiling-tab').count(), 1)
  assert.equal(await page.locator('.tiling-tab.active .tab-label').innerText(), 'alpha beta')

  step('⌘W on a content tab asks before closing; Esc cancels')
  await page.keyboard.press('Meta+w')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.close-confirm').count(), 1)
  assert.match(await page.locator('.close-confirm').innerText(), /关闭标签页/)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.close-confirm').count(), 0)
  assert.equal(await page.locator('.tiling-tab').count(), 1)

  step('old Cmd+K and Cmd+, do not trigger removed shortcuts')
  await page.keyboard.press('Meta+,')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.settings-dialog').count(), 0)
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.palette').count(), 0)
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.palette').count(), 0)
  assert.equal(await page.locator('.tool-header').count(), 0)

  assert.deepEqual(errors, [])
  console.log('\nAll Tiling UI checks passed.')
} finally {
  await browser.close()
}
