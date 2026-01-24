import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initDatabase, getTranslations, getBooks, getVerses, searchVerses, getChapterCount } from './database';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Bible App',
        show: false, // Don't show until ready

        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Load the app
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

app.whenReady().then(() => {
    // Initialize database
    initDatabase();

    // Register IPC handlers
    registerIpcHandlers();

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

function registerIpcHandlers() {
    // Bible data queries
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
    ipcMain.handle('db:toggleHighlight', (_, verseId: number, color: string) =>
        toggleHighlight(verseId, color)
    );
    ipcMain.handle('db:getHighlights', () =>
        getHighlights()
    );
}
