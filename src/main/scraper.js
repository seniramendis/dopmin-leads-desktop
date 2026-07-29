// src/main/scraper.js
import { chromium } from 'playwright'

export async function scrapeLeads(query, maxResults = 20) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(5000)

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
      const feed = document.querySelector('div[role="feed"]')
      if (feed) {
        for (let i = 0; i < 3; i += 1) {
          feed.scrollTop = feed.scrollHeight
          window.scrollTo(0, document.body.scrollHeight)
        }
      }
    })
    await page.waitForTimeout(3000)

    const prospects = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]')
      const candidates = feed
        ? Array.from(feed.querySelectorAll('div'))
        : Array.from(document.querySelectorAll('[role="article"], a[href*="/maps/place/"]'))

      const collected = []

      for (const item of candidates) {
        const text = item.innerText || item.textContent || ''
        const lines = text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)

        if (lines.length < 2) continue

        const name = lines[0]
        const normalized = text.toLowerCase()
        const hasWebsite = /website|\.com|\.org|\.net|\.lk|\.ai/.test(normalized)
        const phoneMatch = text.match(/(\+?\d[\d\s().-]{8,}\d)/)
        const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, ' ').trim() : 'No phone listed'

        if (!hasWebsite && name.length > 2) {
          collected.push({
            name,
            phone,
            status: 'No Website Found'
          })
        }
      }

      return collected.slice(0, 20)
    })

    const leads = prospects.slice(0, maxResults).map((lead, index) => ({
      ...lead,
      id: `${Date.now()}-${index}`
    }))

    return { success: true, leads }
  } catch (error) {
    return { success: false, error: error.message }
  } finally {
    await browser.close()
  }
}
