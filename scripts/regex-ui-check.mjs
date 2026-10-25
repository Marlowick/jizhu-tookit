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
      if (cmd === 'regex_run') {
        if (args.pattern.includes('timeout')) {
          return {
            matches: [],
            count: 0,
            unique: 0,
            durationMs: 300,
            error: { message: '正则执行超过 300ms，已终止；可能存在灾难性回溯（ReDoS）', kind: 'timeout' },
            truncated: false,
          }
        }
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
        if (args.flags.global) {
          for (const match of args.text.matchAll(regex)) add(match)
        } else {
          const match = regex.exec(args.text)
          if (match) add(match)
        }
        return {
          matches,
          count: matches.length,
          unique: seen.size,
          durationMs: 3,
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
await page.getByRole('button', { name: /打开\s*正则匹配/ }).click()
await page.waitForTimeout(700)
assert.equal(await page.locator('.regex-match-row').count(), 0)
await page.keyboard.press('Meta+f')
await page.waitForTimeout(900)
assert.equal(await page.locator('.regex-match-row').count(), 6)
assert.equal(await page.locator('.regex-highlight mark').count(), 6)
assert.match(await page.locator('.small-tool-foot').innerText(), /6 个匹配 · 3 个唯一/)
console.log('• regex manual Cmd+F, matches and source highlight ok')

await page.getByRole('button', { name: '聚合' }).click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.regex-aggregate-row').count(), 3)
assert.match(await page.locator('.regex-aggregate-row').first().innerText(), /ada@example\.com/)
await page.locator('.regex-aggregate-row').first().click()
const selection = await page.locator('.regex-source').evaluate((element) => ({
  start: element.selectionStart,
  end: element.selectionEnd,
  text: element.value.slice(element.selectionStart, element.selectionEnd),
}))
assert.equal(selection.text, 'ada@example.com')
assert.equal(await page.locator('.regex-highlight mark.active').count(), 3)
console.log('• aggregate view, locate and all same-text highlights ok')

await page.getByRole('button', { name: '原文' }).click()
await page.getByRole('checkbox', { name: 'g 全局' }).uncheck()
await page.keyboard.press('Meta+f')
await page.waitForTimeout(800)
assert.equal(await page.locator('.regex-match-row').count(), 1)
await page.getByRole('checkbox', { name: 'g 全局' }).check()
await page.keyboard.press('Meta+f')
await page.waitForTimeout(800)
assert.equal(await page.locator('.regex-match-row').count(), 6)
console.log('• global flag toggle ok')

await page.locator('.regex-pattern').fill('timeout')
await page.keyboard.press('Meta+f')
await page.waitForTimeout(800)
assert.match(await page.locator('.regex-error').innerText(), /300ms/)
console.log('• timeout error surfaced ok')

await page.locator('.regex-pattern').fill('(\\w+)@([\\w.-]+)')
await page.keyboard.press('Meta+f')
await page.waitForTimeout(800)
await page.locator('.regex-match-row').first().click()
await page.waitForTimeout(200)
await page.screenshot({ path: '/tmp/jizhu-regex-tool.png' })

await page.getByRole('button', { name: '语法', exact: true }).click()
await page.waitForTimeout(200)
assert.match(await page.locator('.regex-syntax-help').innerText(), /字符与集合/)
assert.match(await page.locator('.regex-syntax-help').innerText(), /\$1 \$2/)
await page.screenshot({ path: '/tmp/jizhu-regex-help.png' })
await page.getByRole('button', { name: '语法', exact: true }).click()
await page.getByRole('button', { name: '替换', exact: true }).click()
await page.waitForTimeout(250)
assert.match(await page.locator('.regex-replace-preview').innerText(), /ada \[at\] example\.com/)
assert.match(await page.locator('.small-tool-foot').innerText(), /6 处替换/)
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('dark')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.waitForTimeout(250)
assert.match(
  await page.locator('.regex-replace-preview').evaluate((element) => getComputedStyle(element).backgroundColor),
  /13, 17, 23/,
)
await page.screenshot({ path: '/tmp/jizhu-regex-replace-dark.png' })
await page.locator('.statusbar-settings').click()
await page.locator('.settings-row select').first().selectOption('light')
await page.getByRole('button', { name: '关闭', exact: true }).last().click()
await page.screenshot({ path: '/tmp/jizhu-regex-replace.png' })
await page.getByRole('button', { name: '应用到原文' }).click()
await page.waitForTimeout(900)
assert.match(await page.locator('.regex-source').inputValue(), /ada \[at\] example\.com/)
assert.equal(await page.locator('.regex-match-row').count(), 0)
console.log('• replacement preview and apply ok')

await browser.close()
if (errors.length) {
  console.error('errors:', errors)
  process.exit(1)
}
console.log('regex UI checks passed')
