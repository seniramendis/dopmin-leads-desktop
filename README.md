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

## Project structure

```
src/
  main/                    Electron main process
    index.js                window + IPC handlers
    scraper.js               Playwright-driven scrape pipeline
    queryExpansion.js        bare place-name → category-query logic
    constants.js              tuning knobs + category/keyword lists
    secureStore.js            encrypted API-key persistence
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
      Banner.svelte            generic info/error banner
    lib/
      format.js                 display-formatting helpers (stars, etc.)
      csv.js                    CSV building + browser download
```

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
```

