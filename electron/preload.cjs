const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibeforgeDesktop', {
  platform: process.platform,
  onEmergencyStop: (cb) => {
    const handler = () => cb && cb();
    ipcRenderer.on('autonomy:emergency-stop', handler);
    return () => ipcRenderer.removeListener('autonomy:emergency-stop', handler);
  },
});
