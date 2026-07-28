import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow() {
  // Create the main dashboard window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.app')

  // Listen for window shortcut events
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- THE GOOGLE MAPS SCRAPER LOGIC ---
  ipcMain.handle('start-scraping', async (event, searchQuery) => {
    console.log(`Starting scrape for: ${searchQuery}`)

    // 1. Open a hidden background window
    const scrapeWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    // 2. Format the URL and load Google Maps
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`
    await scrapeWindow.loadURL(searchUrl)

    // 3. Inject JavaScript into the hidden window to extract the data
    const extractedLeads = await scrapeWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        // Wait 5 seconds for Google to load the map pins
        setTimeout(() => {
          const cards = Array.from(document.querySelectorAll('a.hfpxzc')); 
          
          const data = cards.map(card => {
              const name = card.getAttribute('aria-label') || 'Unknown';
              const rawDetails = card.parentElement ? card.parentElement.innerText : ''; 
              
              // Check if a "Website" button exists in the text
              const hasWebsite = rawDetails.includes('Website');
              
              // Extract the star rating using Regex
              const ratingMatch = rawDetails.match(/([1-5]\\\\.[0-9])/);
              const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
              
              return { name, rawDetails, hasWebsite, rating };
          });
          resolve(data);
        }, 5000); 
      });
    `)

    // Clean up memory
    scrapeWindow.destroy()

    // Send data back to Svelte
    return extractedLeads
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
