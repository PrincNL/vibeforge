const { app, BrowserWindow, shell, globalShortcut } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged;
const DEV_URL = process.env.VIBEFORGE_DEV_URL || 'http://localhost:3000';

async function triggerEmergencyStop(win) {
  try {
    await fetch(`${DEV_URL}/api/autonomy/run`, { method: 'DELETE' });
  } catch {}

  if (win && !win.isDestroyed()) {
    win.webContents.send('autonomy:emergency-stop');
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: 'VibeForge',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const isInternal = url.startsWith(DEV_URL);
    if (!isInternal) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(DEV_URL);

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  globalShortcut.register('CommandOrControl+Alt+Shift+G', () => {
    triggerEmergencyStop(win);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
