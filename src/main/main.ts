import { app, BrowserWindow, clipboard, ipcMain, Menu, shell } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, getTranslations, getBooks, getVerses, searchVerses, getChapterCount, toggleHighlight, getHighlights, getTopics, createTopic, getReflections, saveReflection, deleteReflection, exportBackup, importBackup, getDatabaseStatus, requireDatabase } from './database';
import { listStudies, getStudy, createStudy, updateStudy, deleteStudy, addStudyPassages, updateStudyPassageNote, removeStudyPassage, moveStudyPassage, runStudyWrite } from './studies';
import { initStudyDatabase, getStudyDatabase, getStudyDataStatus } from './studyDb';
import { listConcordanceWords, lookupConcordance, getConcordanceVerses } from './concordance';
import { getCommentaryChapter } from './commentary';
import { exportStudy } from './studyExport';
import { FEEDBACK_EMAIL, FEEDBACK_MAILTO, FEEDBACK_SUBJECT } from './feedback';

const isSnapRuntime = Boolean(process.env.SNAP);

if (process.platform === 'linux' && !process.env.GTK_IM_MODULE) {
    // On GNOME/Wayland sessions (default on Ubuntu 25.10+) the GTK ibus input
    // module fails to deliver keystrokes to the Electron window inside snap
    // confinement — the app looks frozen and you cannot type anywhere.
    // Forcing the simple built-in "xim" input module restores keyboard input.
    // Only set when the user has not chosen an input module themselves, so we
    // never override a working ibus/fcitx setup (e.g. non-Latin input).
    process.env.GTK_IM_MODULE = 'xim';
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

    // Web links (privacy policy) must open in the user's browser, where
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

// The only non-web link the app opens: the feedback email in the user's own mail app.
// Accepted only when the recipient is exactly FEEDBACK_EMAIL and the sole parameter is
// our subject (no other recipients, cc, bcc or body). The canonical URL is opened.
async function openFeedbackEmail(url: unknown): Promise<boolean> {
    if (typeof url !== 'string' || url.length > 200) return false;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'mailto:' || parsed.pathname !== FEEDBACK_EMAIL || parsed.hash) return false;
    const keys = [...parsed.searchParams.keys()];
    if (keys.length !== 1 || keys[0] !== 'subject' || parsed.searchParams.get('subject') !== FEEDBACK_SUBJECT) return false;
    await shell.openExternal(FEEDBACK_MAILTO);
    return true;
}

function registerIpcHandlers() {
    ipcMain.handle('app:openExternal', async (_, url: string) => openInBrowser(url));
    ipcMain.handle('app:openFeedbackEmail', async (_, url: unknown) => openFeedbackEmail(url));
    // Plain-text clipboard bridge for "Copy verse". Only non-empty strings of a
    // sane size are accepted; nothing else can be written from the renderer.
    ipcMain.handle('app:copyText', (_, text: unknown) => {
        if (typeof text !== 'string' || text.length === 0 || text.length > 200000) return false;
        clipboard.writeText(text);
        return true;
    });
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
    // Bible studies. Every argument is validated in studies.ts; writes touch only the
    // studies/study_passages tables and report problems as { ok: false, error }.
    ipcMain.handle('studies:list', async () => {
        await dbReady;
        return listStudies(requireDatabase());
    });
    ipcMain.handle('studies:get', async (_, studyId: unknown, translationId: unknown) => {
        await dbReady;
        return getStudy(requireDatabase(), studyId, translationId);
    });
    ipcMain.handle('studies:create', async (_, name: unknown, description: unknown) => {
        await dbReady;
        return runStudyWrite(() => createStudy(requireDatabase(), name, description));
    });
    ipcMain.handle('studies:update', async (_, studyId: unknown, name: unknown, description: unknown) => {
        await dbReady;
        return runStudyWrite(() => updateStudy(requireDatabase(), studyId, name, description));
    });
    ipcMain.handle('studies:delete', async (_, studyId: unknown) => {
        await dbReady;
        return runStudyWrite(() => deleteStudy(requireDatabase(), studyId));
    });
    ipcMain.handle('studies:addPassages', async (_, studyId: unknown, passages: unknown) => {
        await dbReady;
        return runStudyWrite(() => addStudyPassages(requireDatabase(), studyId, passages));
    });
    ipcMain.handle('studies:updatePassageNote', async (_, passageId: unknown, note: unknown) => {
        await dbReady;
        return runStudyWrite(() => updateStudyPassageNote(requireDatabase(), passageId, note));
    });
    ipcMain.handle('studies:removePassage', async (_, passageId: unknown) => {
        await dbReady;
        return runStudyWrite(() => removeStudyPassage(requireDatabase(), passageId));
    });
    ipcMain.handle('studies:movePassage', async (_, passageId: unknown, direction: unknown) => {
        await dbReady;
        return runStudyWrite(() => moveStudyPassage(requireDatabase(), passageId, direction));
    });
    // Study export (PDF / text / print). Only the main window may ask; the main process
    // re-reads the study and writes only to the path the user picks in the save dialog.
    ipcMain.handle('studies:export', async (event, studyId: unknown, translationId: unknown, format: unknown) => {
        await dbReady;
        if (!mainWindow || event.sender !== mainWindow.webContents) {
            return { ok: false, error: 'Export is not available.' };
        }
        return exportStudy(mainWindow, requireDatabase(), studyId, translationId, format);
    });
    // Concordance and commentary read the bundled, read-only study.db. When it is
    // missing or unreadable these return a friendly error and the rest of the app works.
    ipcMain.handle('study:getStatus', async () => {
        await dbReady;
        return getStudyDataStatus();
    });
    ipcMain.handle('concordance:words', async (_, translationId: unknown, prefix: unknown, offset: unknown) => {
        await dbReady;
        const studyDb = getStudyDatabase();
        if (!studyDb) return { ok: false, error: getStudyDataStatus().error };
        try {
            return listConcordanceWords(requireDatabase(), studyDb, translationId, prefix, offset);
        } catch (err) {
            console.error('concordance:words failed:', err);
            return { ok: false, error: STUDY_DATA_ERROR };
        }
    });
    ipcMain.handle('concordance:lookup', async (_, translationId: unknown, word: unknown) => {
        await dbReady;
        const studyDb = getStudyDatabase();
        if (!studyDb) return { ok: false, error: getStudyDataStatus().error };
        try {
            return await lookupConcordance(requireDatabase(), studyDb, translationId, word);
        } catch (err) {
            console.error('concordance:lookup failed:', err);
            return { ok: false, error: STUDY_DATA_ERROR };
        }
    });
    ipcMain.handle('concordance:verses', async (_, translationId: unknown, word: unknown, bookId: unknown, offset: unknown) => {
        await dbReady;
        const studyDb = getStudyDatabase();
        if (!studyDb) return { ok: false, error: getStudyDataStatus().error };
        try {
            return await getConcordanceVerses(requireDatabase(), studyDb, translationId, word, bookId, offset);
        } catch (err) {
            console.error('concordance:verses failed:', err);
            return { ok: false, error: STUDY_DATA_ERROR };
        }
    });
    ipcMain.handle('commentary:chapter', async (_, bookCode: unknown, chapter: unknown) => {
        await dbReady;
        const studyDb = getStudyDatabase();
        if (!studyDb) return { ok: false, error: getStudyDataStatus().error };
        try {
            return getCommentaryChapter(studyDb, bookCode, chapter);
        } catch (err) {
            console.error('commentary:chapter failed:', err);
            return { ok: false, error: STUDY_DATA_ERROR };
        }
    });
}

const STUDY_DATA_ERROR = 'Something went wrong reading the study tools. Please try again.';

function initializeDatabaseInBackground() {
    setImmediate(async () => {
        try {
            await initDatabase();
        } finally {
            // study.db is separate and read-only; a failure here never affects bible.db.
            try {
                initStudyDatabase();
            } catch (err) {
                console.error('Study database failed to initialise:', err);
            }
            dbReadyResolve?.();
            dbReadyResolve = null;
        }
    });
}

app.whenReady().then(() => {
    registerIpcHandlers();
    setAppMenu();
    if (process.platform === 'linux' && isSnapRuntime && process.env.XDG_CONFIG_HOME) {
        // The snap launcher writes $XDG_CONFIG_HOME/fontconfig/fonts.conf and lists the
        // host's ~/.cache/fontconfig in it as an extra font cache. GTK inside the snap uses
        // the old fontconfig 2.12.6 from the gnome-3-28-1804 runtime, which misreads cache
        // files that another fontconfig left in that host folder: every font lookup fails
        // and the GTK Save and Print dialogs draw all text as boxes. Removing that one line
        // makes the snap use only its own cache (built once on first use).
        // Placed here (after GTK init, before createWindow) so fontconfig 2.12.6 does not
        // crash on a stale internal state when the second BrowserWindow is created on export.
        const cacheDir = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'fontconfig');
        try { fs.mkdirSync(cacheDir, { recursive: true }); } catch { /* ignore */ }
        const fontsConf = path.join(process.env.XDG_CONFIG_HOME, 'fontconfig', 'fonts.conf');
        try {
            const conf = fs.readFileSync(fontsConf, 'utf8');
            const fixed = conf.replace(/^[ \t]*<cachedir>\/[^<]*\/\.cache\/fontconfig<\/cachedir>[ \t]*\r?\n?/gm, '');
            if (fixed !== conf) fs.writeFileSync(fontsConf, fixed);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Could not update the snap font config:', err);
        }
    }
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
