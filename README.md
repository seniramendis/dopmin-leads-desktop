# Dopmin Web Scraper

A desktop app (Electron + Svelte) that finds local businesses on Google
Maps and flags the ones that don't have a website yet — the leads a
web-dev/agency actually wants to reach out to.

## Features

- **Google Maps lead extraction** — searches by category + location
  ("hardware stores in Kandy"), scrolls through all matching results, and
  reads phone number, address, category, rating, and website status
  directly off each business's detail page.
- **Bare place-name search** — search just a city or town name
  ("Mount Lavinia") and the app automatically fans it out across ~20 common
  local business categories, so you still get real results instead of an
  empty list.
- **No-website filter** — results default to showing only businesses
  without a website; toggle it off to see everyone.
- **Hot Leads / Reputation Rescue** — no-website businesses are
  automatically split into "good reviews, no site" and "bad reviews, no
  site" so outreach can be prioritized.
- **CSV export** of whatever's currently visible in the results table.
- **Encrypted API key storage** — the API key is encrypted via Electron's
  `safeStorage` (OS keychain / DPAPI / libsecret), not stored in plaintext.
- **Client Audit Scorecard** — one click runs a local, $0 technical audit on
  any lead's website: SSL/HTTPS, load time, mobile-responsiveness (375px
  viewport overflow check), and whether Google Analytics/Meta Pixel/GTM are
  installed. Produces a 0–100 health score plus a plain-English issues list
  ready to paste into outreach. See `src/main/auditEngine.js`.
- **Abandoned Agency Detector** — part of the same audit: scans the site's
  footer for "Designed by X" / "Powered by X" credits, then checks via DNS
  whether that agency's own domain is still alive. A dead agency domain is
  flagged as a maintenance-takeover opportunity.
- **WhatsApp Direct Outreach Bridge** — "WhatsApp" button opens a
  `wa.me` click-to-chat link pre-filled with a pitch, using the lead's
  scraped phone number. No paid API, no whatsapp-web.js session/QR pairing
  needed — just a deep link to the system WhatsApp app or web.whatsapp.com.
- **Instant Pitch Generator** — "AI pitch" button sends the lead's scraped
  data (+ audit results, if run) to Google Gemini's free tier and returns a
  ready-to-send 3-sentence WhatsApp/email pitch. Requires a free API key,
  set once in Settings → see `src/main/pitchGenerator.js`.

## Project structure

```
src/
  main/                    Electron main process
    index.js                window + IPC handlers
    scraper.js               Playwright-driven scrape pipeline
    queryExpansion.js        bare place-name → category-query logic
    constants.js              tuning knobs + category/keyword lists
    secureStore.js            encrypted API-key persistence
    auditEngine.js            $0 site audit (SSL/speed/mobile/SEO) +
                               abandoned-agency detector
    pitchGenerator.js         Gemini free-tier cold-pitch generation
  preload/
    index.js                 contextBridge API exposed to the renderer
  renderer/src/
    App.svelte                root component — owns search state, wires
                               everything else together
    components/
      SplashScreen.svelte      intro screen (logo + name, slide transition)
      AppHeader.svelte         top bar / branding
      SearchPanel.svelte       search form
      ProgressBanner.svelte    live scrape progress
      StatsOverview.svelte     summary stat cards
      LeadsPanel.svelte        Hot Leads / Reputation Rescue mini-tables
      ResultsTable.svelte      full results table, website filter, CSV export
      LeadActions.svelte       per-lead audit / AI pitch / WhatsApp buttons
      SettingsModal.svelte     Gemini API key entry (Settings)
      Banner.svelte            generic info/error banner
    lib/
      format.js                 display-formatting helpers (stars, etc.)
      csv.js                    CSV building + browser download
```

## Setting up the free Gemini key

The "AI pitch" button needs a free Gemini API key to write pitches:

1. Open the app → **Settings (API key)** in the sidebar.
2. Click **Google AI Studio**, sign in, and create a key (no credit card).
3. Paste it in and click **Save key** — it's encrypted at rest via
   `safeStorage` the same way the rest of the app's secrets are.

Everything else (audit engine, WhatsApp bridge) works with zero setup.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Lint & format

```bash
$ npm run lint
$ npm run format
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux

## Troubleshooting

If you see an error at startup about a missing native module like `better-sqlite3`, it's usually because the native addon wasn't built for the Electron runtime you're using. Common fixes:

```bash
# Install dependencies
npm install

# Run the project's postinstall (electron-builder helper)
npm run postinstall

# If that doesn't help, rebuild native modules for your Electron version
# (replace the target with the exact Electron version in package.json)
npm rebuild --runtime=electron --target=$(node -p "require('./package.json').devDependencies.electron.replace(/^[^\d]*/,'')") --disturl=https://electronjs.org/headers

# Then restart the app
npm start
```

If problems persist, check your `node_modules/better-sqlite3` folder and the console/logs for build errors. For CI or packaging, ensure native modules are built as part of your build pipeline (see `electron-builder` docs).
```

