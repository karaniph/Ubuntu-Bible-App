import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { initDatabase, getTranslations, getBooks, getVerses, searchVerses, getChapterCount, toggleHighlight, getHighlights, getTopics, createTopic, getReflections, saveReflection, deleteReflection, exportBackup, importBackup, getDatabaseStatus } from './database';

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

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function registerIpcHandlers() {
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
