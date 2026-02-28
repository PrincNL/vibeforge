const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('vibeforgeDesktop', {
  platform: process.platform,
});
