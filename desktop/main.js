const path = require("node:path");
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { createApp } = require("../server/app");

const PORT = Number(process.env.PORT || 4090);
const APP_URL = `http://127.0.0.1:${PORT}`;
let server;
let mainWindow;
let dbPath;
let updateCheckInProgress = false;

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const appRoot = app.getAppPath();
    const dataRoot = app.isPackaged
      ? path.join(app.getPath("userData"), "data")
      : path.join(process.cwd(), "data");
    dbPath = path.join(dataRoot, "lomket-db.json");
    const appServer = createApp({ port: PORT, dbPath, appRoot });
    server = appServer.server;

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${PORT} is already in use. Close the other Lomket CBT window or change the PORT environment variable.`
          )
        );
        return;
      }
      reject(error);
    });

    server.listen(PORT, "0.0.0.0", () => resolve());
  });
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const appRoot = app.getAppPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: "Lomket CBT Admin",
    backgroundColor: "#f5f7fb",
    icon: path.join(appRoot, "public", "assets", "logo.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(appRoot, "desktop", "preload.js")
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`${APP_URL}/?desktop=1`);
  mainWindow.webContents.once("did-finish-load", () => {
    checkForDesktopUpdates("startup");
  });
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    notifyRenderer("Checking GitHub for Lomket CBT updates...");
  });

  autoUpdater.on("update-available", (info) => {
    notifyRenderer(`Update ${info.version} found. Downloading installer...`);
  });

  autoUpdater.on("update-not-available", () => {
    notifyRenderer("Lomket CBT is up to date.");
  });

  autoUpdater.on("download-progress", (progress) => {
    notifyRenderer(`Downloading update: ${Math.round(progress.percent || 0)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    notifyRenderer(`Update ${info.version} is ready to install.`);
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "info",
      buttons: ["Restart and install", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Lomket CBT update ready",
      message: `Lomket CBT ${info.version} has been downloaded.`,
      detail: "Restart now to install the update. Student exam sessions should be finished before restarting."
    });
    if (choice === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (error) => {
    notifyRenderer(`Update check failed: ${error.message}`);
  });
}

function notifyRenderer(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `window.dispatchEvent(new CustomEvent("lomket-desktop-update", { detail: ${JSON.stringify({
        message,
        at: new Date().toISOString()
      })} }));`,
      true
    )
    .catch(() => null);
}

async function checkForDesktopUpdates(reason) {
  if (!app.isPackaged) {
    const message = "Desktop auto-update runs only in the installed app.";
    notifyRenderer(message);
    return { ok: false, message };
  }
  if (updateCheckInProgress) {
    const message = "An update check is already running.";
    notifyRenderer(message);
    return { ok: false, message };
  }
  updateCheckInProgress = true;
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    updateCheckInProgress = false;
    if (reason === "startup") {
      setTimeout(() => checkForDesktopUpdates("scheduled"), 1000 * 60 * 60 * 6);
    }
  }
}

app.whenReady().then(async () => {
  try {
    configureAutoUpdater();
    ipcMain.handle("desktop-update:check", () => checkForDesktopUpdates("manual"));
    await startLocalServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox("Lomket CBT could not start", error.message);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && server) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
    server = null;
  }
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox("Lomket CBT error", `${error.message}\n\nData file: ${dbPath || "not opened"}`);
});
