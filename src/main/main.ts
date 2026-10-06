import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'path';
import { initDatabase, getTranslations, getBooks, getVerses, searchVerses, getChapterCount, toggleHighlight, getHighlights, getTopics, createTopic, getReflections, saveReflection, deleteReflection, exportBackup, importBackup, getDatabaseStatus } from './database';

const isSnapRuntime = Boolean(process.env.SNAP);

if (process.platform === 'linux') {
    // On a Wayland session (the default on Ubuntu 25.10+, recent Fedora, etc.)
    // Electron otherwise falls back to XWayland, where keyboard input often
    // never reaches the window — the app looks frozen and you can't type.
    // "auto" picks Wayland on a Wayland session and X11 everywhere else, so it
    // is safe for X11 users too. Must be set before app "ready".
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations');
}

if (isSnapRuntime) {
    // Snap strict confinement commonly blocks Chromium shared memory and sandbox setup.
    app.commandLine.appendSwitch('disable-dev-shm-usage');
    app.commandLine.appendSwitch('no-sandbox');
    app.disableHardwareAcceleration();
}
// Windows Store (AppX) builds run as full-trust desktop apps; Chromium's
// sandbox works normally there, so no extra switches are needed.

let mainWindow: BrowserWindow | null = null;
let dbReadyResolve: (() => void) | null = null;
const dbReady = new Promise<void>((resolve) => {
    dbReadyResolve = resolve;
});

function setAppMenu() {
    const isMac = process.platform === 'darwin';
    const template: Electron.MenuItemConstructorOptions[] = [
        ...(isMac ? [{ role: 'appMenu' as const }] : []),
        { role: 'fileMenu' as const },
        { role: 'editMenu' as const },
        { role: 'viewMenu' as const },
        { role: 'windowMenu' as const }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createWindow() {
    const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Bible App',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Web links (donations, privacy policy) must open in the user's browser, where
    // they can see the real address, never in an app window without one.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void openInBrowser(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const isAppPage = url.startsWith('file://') || (isDev && url.startsWith('http://localhost:5173'));
        if (!isAppPage) {
            event.preventDefault();
            void openInBrowser(url);
        }
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Opens http(s) links in the system browser. Other schemes (file:, javascript:,
// custom protocol handlers) are ignored so a link can't launch arbitrary programs.
async function openInBrowser(url: string) {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        await shell.openExternal(parsed.toString());
    }
}

function registerIpcHandlers() {
    ipcMain.handle('app:openExternal', async (_, url: string) => openInBrowser(url));
    ipcMain.handle('db:getStatus', () => getDatabaseStatus());
    ipcMain.handle('db:waitUntilReady', async () => {
        await dbReady;
        return getDatabaseStatus();
    });
    ipcMain.handle('db:getTranslations', async () => {
        await dbReady;
        return getTranslations();
    });
    ipcMain.handle('db:getBooks', async () => {
        await dbReady;
        return getBooks();
    });
    ipcMain.handle('db:getVerses', async (_, translationId: number, bookId: number, chapter: number) => {
        await dbReady;
        return getVerses(translationId, bookId, chapter);
    });
    ipcMain.handle('db:searchVerses', async (_, query: string, translationId: number) => {
        await dbReady;
        return searchVerses(query, translationId);
    });
    ipcMain.handle('db:getChapterCount', async (_, bookId: number, translationId: number) => {
        await dbReady;
        return getChapterCount(bookId, translationId);
    });
    ipcMain.handle('db:toggleHighlight', async (_, verseId: number, color: string, topicId?: number) => {
        await dbReady;
        return toggleHighlight(verseId, color, topicId);
    });
    ipcMain.handle('db:getHighlights', async () => {
        await dbReady;
        return getHighlights();
    });
    ipcMain.handle('db:getTopics', async () => {
        await dbReady;
        return getTopics();
    });
    ipcMain.handle('db:createTopic', async (_, name: string, color?: string) => {
        await dbReady;
        return createTopic(name, color);
    });
    ipcMain.handle('db:getReflections', async () => {
        await dbReady;
        return getReflections();
    });
    ipcMain.handle('db:saveReflection', async (_, date: string, verse: string, text: string) => {
        await dbReady;
        return saveReflection(date, verse, text);
    });
    ipcMain.handle('db:deleteReflection', async (_, id: number) => {
        await dbReady;
        return deleteReflection(id);
    });
    ipcMain.handle('db:exportBackup', async () => {
        await dbReady;
        return exportBackup();
    });
    ipcMain.handle('db:importBackup', async (_, payload: any) => {
        await dbReady;
        return importBackup(payload);
    });
}

function initializeDatabaseInBackground() {
    setImmediate(async () => {
        try {
            await initDatabase();
        } finally {
            dbReadyResolve?.();
            dbReadyResolve = null;
        }
    });
}

app.whenReady().then(() => {
    registerIpcHandlers();
    setAppMenu();
    createWindow();
    initializeDatabaseInBackground();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
