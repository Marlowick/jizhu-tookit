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
  return text.replace('输入或粘贴文本…', '').trim()
}

async function openCommand(name) {
  await page.keyboard.press('Meta+Shift+P')
  await page.locator('.palette-search input').fill(name)
  await page.waitForTimeout(120)
  await page.locator('.palette-item').first().click()
  await page.waitForTimeout(300)
}

try {
  await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  step('Tiling shell starts with one numbered plain workspace')
  assert.equal(await page.locator('.tiling-tab').count(), 1)
  assert.equal(await page.locator('.tiling-tab .tab-label').first().innerText(), '1')
  assert.equal(await page.locator('.status-mode').innerText(), 'PLAIN')
  assert.equal(await page.locator('.workspace-editor').count(), 1)
  assert.equal(await page.locator('#welcome, .welcome').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')

  step('plain editor search, typing and Ctrl+Z')
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
  await page.keyboard.type('alpha\nbeta')
  await page.waitForTimeout(200)
  await page.keyboard.press('Meta+ArrowUp')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.waitForTimeout(150)
  await openCommand('二维码')
  assert.equal(await page.locator('.workspace-panel-source select').inputValue(), 'selection')
  const qrText = page.locator('.workspace-panel textarea').first()
  assert.equal(await qrText.inputValue(), 'alpha')
  await page.locator('.workspace-panel-source select').selectOption('tab')
  await page.waitForTimeout(250)
  assert.equal(await qrText.inputValue(), 'alpha\nbeta')
  await page.locator('.workspace-panel-source select').selectOption('manual')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.workspace-panel-source select').inputValue(), 'manual')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  step('panel tiling: 1 full, 2 half, 3 thirds')
  await openCommand('二维码')
  assert.equal(await page.locator('.workspace-panel').count(), 1)
  let widths = await page.locator('.workspace-panel').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)))
  assert.ok(widths[0] > 1300)

  await openCommand('时间转换')
  assert.equal(await page.locator('.workspace-panel').count(), 2)
  widths = await page.locator('.workspace-panel').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)))
  assert.ok(Math.abs(widths[0] - widths[1]) <= 1)

  await openCommand('编码 / 解码')
  assert.equal(await page.locator('.workspace-panel').count(), 3)
  widths = await page.locator('.workspace-panel').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)))
  assert.ok(widths.every((width) => Math.abs(width - widths[0]) <= 1))

  step('fourth panel is rejected')
  await openCommand('正则匹配')
  assert.equal(await page.locator('.workspace-panel').count(), 3)
  assert.equal(await page.locator('.toast').innerText(), '最多同时打开 3 个面板')

  step('Cmd+Shift+F maximizes and restores the active panel')
  await page.keyboard.press('Meta+Shift+F')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.workspace-panels.is-maximized').count(), 1)
  assert.equal(await page.locator('.workspace-panel').count(), 1)
  const maxWidth = await page.locator('.workspace-panel').first().evaluate((node) => Math.round(node.getBoundingClientRect().width))
  assert.ok(maxWidth > 1300)
  await page.keyboard.press('Meta+Shift+F')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.workspace-panel').count(), 3)

  step('Ctrl+Alt+Arrow moves panel focus; Esc closes one')
  await page.keyboard.press('Control+Alt+ArrowRight')
  await page.waitForTimeout(150)
  const activeTitle = await page.locator('.workspace-panel.active .workspace-panel-head strong').innerText()
  assert.ok(activeTitle.length > 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.workspace-panel').count(), 2)

  step('settings opens from command palette and is dark-only')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await openCommand('设置')
  assert.equal(await page.locator('.settings-dialog').count(), 1)
  assert.match(await page.locator('.settings-dialog').innerText(), /固定使用深色工作台/)
  await page.locator('.settings-dialog').getByRole('button', { name: '编辑器' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.settings-dialog select').last().inputValue(), '2')
  await page.locator('.settings-switch').click()
  await page.waitForTimeout(200)
  assert.match(await page.locator('.cm-content').getAttribute('class'), /cm-lineWrapping/)
  await page.locator('.settings-dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.waitForTimeout(150)
  assert.match(await page.locator('.tiling-statusbar').innerText(), /UTF-8/)
  assert.match(await page.locator('.tiling-statusbar').innerText(), /LF/)

  step('time / URL / regex / jq panels are reachable')
  for (const [command, title] of [
    ['jq 查询', 'jq 查询'],
    ['URL 解析', 'URL 解析'],
    ['时间转换', '时间转换'],
    ['正则匹配', '正则匹配'],
  ]) {
    await openCommand(command)
    assert.equal(await page.locator('.workspace-panel-head strong').last().innerText(), title)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }

  step('switch to JSON mode: tree opens by default and can be hidden/shown')
  await openCommand('切换到 JSON 模式')
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
  await page.keyboard.press('Meta+f')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.cm-search').count(), 1)
  await page.keyboard.press('Escape')

  step('new numbered workspace and Alt+1/2 switching')
  await page.locator('.tab-new').click()
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.tiling-tab').count(), 2)
  assert.equal(await page.locator('.tiling-tab').nth(1).locator('.tab-label').innerText(), '2')
  await page.keyboard.press('Alt+1')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.tiling-tab.active .tab-label').innerText(), '1')
  await page.keyboard.press('Alt+2')
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.tiling-tab.active .tab-label').innerText(), '2')

  step('old Cmd+K does not open the palette; no file bar')
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.palette').count(), 0)
  assert.equal(await page.locator('.tool-header').count(), 0)

  assert.deepEqual(errors, [])
  console.log('\nAll Tiling UI checks passed.')
} finally {
  await browser.close()
}
