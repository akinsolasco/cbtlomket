const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("LomketDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("desktop-update:check")
});
