import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.locator('.status-mode').click()
await page.waitForTimeout(120)
await page.getByRole('option', { name: /CALC/ }).click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.status-mode').innerText(), 'CALC')
assert.equal(await page.locator('.calc-help-panel').count(), 1)
assert.match(await page.locator('.calc-help-panel').innerText(), /内置函数/)
assert.match(await page.locator('.calc-help-panel').innerText(), /sqrt/)
assert.match(await page.locator('.calc-help-panel').innerText(), /datetime/)
await page.getByRole('button', { name: '关闭 Calc 示例' }).click()

await page.locator('.cm-content').click()
await page.keyboard.press('Meta+a')
await page.keyboard.press('Backspace')
await page.waitForTimeout(120)
assert.equal(await page.locator('.calc-result').count(), 0)
await page.keyboard.insertText('1 + 2 * 3\n(1 + 2) * 3\nprice = 2\ncount = 8\nprice * count\nprice\n1 / 0\nsqrt(16)\nround(1.234, 2)\nmin(2, 8)\npow(2, 10)\nmod(10, 3)\nhello world\n10 / 2')
await page.waitForTimeout(120)
assert.equal(await page.locator('.calc-result').count(), 0, 'results must wait for the debounce')
await page.waitForTimeout(600)
assert.deepEqual(await page.locator('.calc-result').allInnerTexts(), [
  '= 7',
  '= 9',
  '= 2',
  '= 8',
  '2 * 8 = 16',
  '= 2',
  '! 除以零',
  '= 4',
  '= 1.23',
  '= 2',
  '= 1024',
  '= 1',
  '= 5',
])

// 仅增加尾随空格，结果数据不变时不应隐藏/重建结果
await page.locator('.cm-line').nth(0).click()
await page.keyboard.press('End')
await page.keyboard.insertText(' ')
await page.waitForTimeout(120)
assert.equal(await page.locator('.calc-result').count(), 13)
const stableResults = await page.locator('.calc-result').allInnerTexts()
await page.waitForTimeout(600)
assert.deepEqual(await page.locator('.calc-result').allInnerTexts(), stableResults)

// 修改赋值行，后续引用行联动更新，其它独立行保持不变
await page.locator('.cm-line').nth(2).click()
await page.keyboard.press('Home')
await page.keyboard.press('Shift+End')
await page.keyboard.insertText('price = 150')
await page.waitForTimeout(120)
assert.equal(await page.locator('.calc-result').count(), 13, 'old results stay visible during debounce')
await page.waitForTimeout(600)
assert.deepEqual(await page.locator('.calc-result').allInnerTexts(), [
  '= 7',
  '= 9',
  '= 150',
  '= 8',
  '150 * 8 = 1200',
  '= 150',
  '! 除以零',
  '= 4',
  '= 1.23',
  '= 2',
  '= 1024',
  '= 1',
  '= 5',
])

// datetime(timestamp) renders a readable local time
await page.locator('.cm-line').last().click()
await page.keyboard.press('End')
await page.keyboard.insertText('\ndatetime(1718092800)')
await page.waitForTimeout(700)
const withTime = await page.locator('.calc-result').allInnerTexts()
assert.match(withTime.at(-1) ?? '', /^= \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

assert.deepEqual(errors, [])
await page.screenshot({ path: '/tmp/jizhu-calc-check.png' })
await browser.close()
console.log('All Calc UI checks passed.')
