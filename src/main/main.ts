import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { initDatabase, getTranslations, getBooks, getVerses, searchVerses, getChapterCount, toggleHighlight, getHighlights, getTopics, createTopic } from './database';

let mainWindow: BrowserWindow | null = null;

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

    if (process.env.NODE_ENV === 'development') {
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
    ipcMain.handle('db:getTranslations', () => getTranslations());
    ipcMain.handle('db:getBooks', () => getBooks());
    ipcMain.handle('db:getVerses', (_, translationId: number, bookId: number, chapter: number) =>
        getVerses(translationId, bookId, chapter)
    );
    ipcMain.handle('db:searchVerses', (_, query: string, translationId: number) =>
        searchVerses(query, translationId)
    );
    ipcMain.handle('db:getChapterCount', (_, bookId: number, translationId: number) =>
        getChapterCount(bookId, translationId)
    );
    ipcMain.handle('db:toggleHighlight', (_, verseId: number, color: string, topicId?: number) =>
        toggleHighlight(verseId, color, topicId)
    );
    ipcMain.handle('db:getHighlights', () =>
        getHighlights()
    );
    ipcMain.handle('db:getTopics', () =>
        getTopics()
    );
    ipcMain.handle('db:createTopic', (_, name: string, color?: string) =>
        createTopic(name, color)
    );
}

app.whenReady().then(() => {
    initDatabase();
    registerIpcHandlers();
    setAppMenu();
    createWindow();

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
