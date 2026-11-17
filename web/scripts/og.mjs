// Makes public/og.png (the link preview picture) from the real home page, so it always matches the site's fonts and look.
// Usage: start the site (npm run dev), then: npm run og
//        Set OG_URL to use another address, and CHROME to point at a Chrome or Chromium if none is found.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const URL = process.env.OG_URL || 'http://localhost:3000'
const candidates = [process.env.CHROME,
  process.env.LOCALAPPDATA && fs.existsSync(path.join(process.env.LOCALAPPDATA, 'ms-playwright'))
    ? fs.readdirSync(path.join(process.env.LOCALAPPDATA, 'ms-playwright')).filter(d => d.startsWith('chromium-')).sort().reverse().map(d => path.join(process.env.LOCALAPPDATA, 'ms-playwright', d, 'chrome-win', 'chrome.exe'))[0] : null,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean)
const exe = candidates.find(p => fs.existsSync(p))
if (!exe) { console.error('No Chrome found. Set CHROME to its path.'); process.exit(1) }

const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.addInitScript(() => { try { localStorage.setItem('sn_theme', 'dark'); localStorage.removeItem('sn_token') } catch {} })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.addStyleTag({ content: `
  body>*:not(main):not(.hero),.wrap,footer,.themebtns,nextjs-portal{display:none!important}
  .hero.big{min-height:630px!important;height:630px;padding-top:0!important;padding-bottom:0!important;border:0}
  .hero-copy .row{display:none!important}
  .og-url{display:inline-flex;align-items:center;gap:8px;margin-top:22px;padding:8px 16px;border-radius:99px;background:#000000a0;border:1px solid #ffffff26;
    color:#86d05a;font-weight:700;font-size:20px;letter-spacing:.01em;backdrop-filter:blur(6px)}
  .og-url i{width:9px;height:9px;border-radius:50%;background:#86d05a;box-shadow:0 0 10px #86d05a}` })
await page.evaluate(() => {
  const copy = document.querySelector('.hero-copy'); if (!copy) throw new Error('No home page hero found')
  const url = document.createElement('div'); url.className = 'og-url'; url.innerHTML = '<i></i>notebook.hamish555.com'; copy.appendChild(url)
  window.scrollTo(0, 0)
})
await page.waitForTimeout(800)   // fonts and the background picture
const hero = await page.$('.hero.big')
await hero.screenshot({ path: path.join('public', 'og.png') })
await browser.close()
console.log('Wrote public/og.png from', URL)
