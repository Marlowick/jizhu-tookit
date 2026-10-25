import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const chrome = process.env.JIZHU_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const base = process.env.JIZHU_URL ?? 'http://127.0.0.1:1420/'

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 1,
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()

const errors = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

const step = (name) => console.log(`• ${name}`)

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)

step('welcome: 9 cards and product name')
assert.equal(await page.locator('.tool-card').count(), 9)
assert.match(await page.title(), /机杼工具箱/)
assert.match(await page.locator('.welcome h1').innerText(), /机杼工具箱/)

step('Cmd+T is removed')
const tabsBefore = await page.locator('.tab').count()
await page.keyboard.press('Meta+t')
await page.waitForTimeout(200)
assert.equal(await page.locator('.tab').count(), tabsBefore)

step('palette arrow keys scroll the active item into view')
await page.keyboard.press('Meta+k')
await page.waitForTimeout(200)
const paletteCount = await page.locator('.palette-item').count()
assert.ok(paletteCount > 6)
for (let index = 0; index < 8; index += 1) await page.keyboard.press('ArrowDown')
const paletteScroll = await page.locator('.palette-list').evaluate((element) => element.scrollTop)
assert.ok(paletteScroll > 0, `palette scrollTop=${paletteScroll}`)
const activeBox = await page.locator('.palette-item.active').boundingBox()
const listBox = await page.locator('.palette-list').boundingBox()
assert.ok(activeBox && listBox && activeBox.y >= listBox.y && activeBox.y + activeBox.height <= listBox.y + listBox.height + 1)
await page.keyboard.press('Escape')

step('open JSON sample')
await page.getByRole('button', { name: /打开\s*JSON 编辑器/ }).click()
await page.waitForTimeout(600)
assert.match(await page.locator('.tree-wrap').innerText(), /users\s*:\s*array · 3 items/)
assert.equal(await page.locator('.tab').count(), 2)

step('JSON editor Cmd+F search')
await page.keyboard.press('Meta+f')
await page.waitForTimeout(300)
assert.equal(await page.locator('.cm-search').count(), 1)
await page.locator('.cm-search .cm-textfield').first().fill('users')
await page.keyboard.press('Enter')
await page.waitForTimeout(250)
assert.ok((await page.locator('.cm-searchMatch').count()) > 0)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
assert.equal(await page.locator('.cm-search').count(), 0)

step('tree click moves editor cursor')
await page.locator('.tree-row', { hasText: 'object · 3 keys' }).first().click()
await page.waitForTimeout(250)
await page.locator('.tree-row', { hasText: '"Ada"' }).first().click()
await page.waitForTimeout(350)
assert.match(await page.locator('.statusbar').innerText(), /行 3/)
assert.match(await page.locator('.tree-row.active').innerText(), /name/)

step('editor cursor highlights tree node and expands ancestors')
await page.locator('.tree-row', { hasText: 'users' }).first().click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.tree-row', { hasText: 'array · 3 items' }).count(), 1)
await page.locator('.cm-content span', { hasText: /^"Ada"$/ }).first().click()
await page.waitForTimeout(450)
assert.match(await page.locator('.tree-row.active').innerText(), /name/)

step('cursor on a key highlights its value node')
await page.locator('.cm-content span', { hasText: /^"debug"$/ }).first().click()
await page.waitForTimeout(400)
assert.match(await page.locator('.tree-row.active').innerText(), /debug/)

step('right-click copies jq path')
await page.locator('.tree-row', { hasText: '"Ada"' }).first().click({ button: 'right' })
await page.waitForTimeout(200)
assert.match(await page.locator('.context-path').innerText(), /\.users\[0\]\.name/)
await page.getByRole('menuitem', { name: '复制 jq 路径' }).click()
await page.waitForTimeout(300)
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '.users[0].name')
assert.match(await page.locator('.toast').innerText(), /已复制jq 路径/)

step('palette opens and filters')
await page.keyboard.press('Meta+k')
await page.waitForTimeout(250)
await page.locator('.palette-search input').fill('正则')
assert.equal(await page.locator('.palette-item').count(), 1)
await page.keyboard.press('Escape')

step('invalid JSON keeps last valid tree')
await page.locator('.cm-content').click()
await page.keyboard.press('Meta+a')
await page.keyboard.insertText('{\n  "a": 1,\n  "b" 2\n}')
await page.waitForTimeout(500)
assert.match(await page.locator('.statusbar').innerText(), /语法错误/)
assert.match(await page.locator('.tree-wrap').innerText(), /users\s*:\s*array · 3 items/)
assert.match(await page.locator('.pane-header').first().innerText(), /展示上次有效解析/)

step('format valid document from toolbar')
await page.locator('.cm-content').click()
await page.keyboard.press('Meta+a')
await page.keyboard.insertText('{"z":1,"a":{"b":true}}')
await page.waitForTimeout(400)
await page.getByRole('button', { name: '格式化' }).click()
await page.waitForTimeout(400)
const formatted = await page.locator('.cm-content').innerText()
assert.match(formatted, /\n  "z": 1,/)
assert.match(await page.locator('.tree-wrap').innerText(), /a\s*:\s*object/)

step('jq panel opens, shows engine, closes with esc')
await page.getByRole('button', { name: /jq 面板/ }).click()
await page.waitForTimeout(300)
assert.equal(await page.locator('.jq-panel').count(), 1)
assert.equal(await page.locator('#jq-source').count(), 0)
assert.equal(await page.locator('#jq-expr').count(), 1)
assert.equal(await page.locator('#jq-engine').count(), 1)
assert.match(await page.locator('.jq-note').innerText(), /浏览器预览不支持 jq/)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
assert.equal(await page.locator('.jq-panel').count(), 0)

step('new tab via + asks for a tool, then opens JSON')
await page.locator('.tab-new').click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.newtab-dialog').count(), 1)
await page.locator('.newtab-item').first().click()
await page.waitForTimeout(300)
assert.equal(await page.locator('.tab').count(), 3)
assert.equal(await page.locator('.cm-placeholder').count(), 1)

step('close empty tab returns to previous')
await page.locator('.tab.active .tab-close').click()
await page.waitForTimeout(300)
assert.equal(await page.locator('.tab').count(), 2)

step('session survives reload')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
assert.equal(await page.locator('.tab').count(), 2)
assert.match(await page.locator('.cm-content').innerText(), /"z": 1/)

step('all tools available and pipeline opens from the picker')
await page.locator('.tab.active').click()
await page.locator('.tab-new').click()
await page.waitForTimeout(200)
assert.equal(await page.locator('.newtab-dialog').count(), 1)
await page.locator('.newtab-item', { hasText: '管道处理' }).click()
await page.waitForTimeout(300)
assert.equal(await page.locator('.pipeline-tool').count(), 1)
await page.getByRole('tab', { name: '欢迎' }).click()
await page.waitForTimeout(200)
assert.match(await page.locator('.welcome').innerText(), /机杼工具箱/)
assert.equal(await page.locator('.tool-card.soon').count(), 0)

step('many tabs shrink to fit; close all resets to welcome')
for (let index = 0; index < 8; index += 1) {
  await page.locator('.tab-new').click()
  await page.waitForTimeout(80)
  await page.locator('.newtab-item', { hasText: '时间转换' }).click()
  await page.waitForTimeout(80)
}
const tabbarBox = await page.locator('.tabbar').boundingBox()
const tabBoxes = await page.locator('.tab').evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect()))
assert.ok(tabbarBox)
assert.ok(tabBoxes.every((box) => box.left >= tabbarBox.x - 1 && box.right <= tabbarBox.x + tabbarBox.width + 1))
await page.keyboard.press('Meta+Shift+w')
await page.waitForTimeout(300)
assert.equal(await page.locator('.tab').count(), 1)
assert.equal(await page.locator('.tab.active .tab-label').innerText(), '欢迎')

await browser.close()

const fatal = errors.filter((item) => !item.includes('favicon') && !item.includes('404'))
if (fatal.length) {
  console.error('\nConsole/page errors:')
  for (const item of fatal) console.error(' -', item)
  process.exit(1)
}
console.log('\nAll MVP checks passed.')
