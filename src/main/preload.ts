import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    getDatabaseStatus: () => ipcRenderer.invoke('db:getStatus'),
    waitUntilDatabaseReady: () => ipcRenderer.invoke('db:waitUntilReady'),
    // Bible database
    getTranslations: () => ipcRenderer.invoke('db:getTranslations'),
    getBooks: () => ipcRenderer.invoke('db:getBooks'),
    getVerses: (translationId: number, bookId: number, chapter: number) =>
        ipcRenderer.invoke('db:getVerses', translationId, bookId, chapter),
    searchVerses: (query: string, translationId: number) =>
        ipcRenderer.invoke('db:searchVerses', query, translationId),
    getChapterCount: (bookId: number, translationId: number) =>
        ipcRenderer.invoke('db:getChapterCount', bookId, translationId),
    toggleHighlight: (verseId: number, color: string, topicId?: number) =>
        ipcRenderer.invoke('db:toggleHighlight', verseId, color, topicId),
    getHighlights: () =>
        ipcRenderer.invoke('db:getHighlights'),
    getTopics: () =>
        ipcRenderer.invoke('db:getTopics'),
    createTopic: (name: string, color?: string) =>
        ipcRenderer.invoke('db:createTopic', name, color),
    getReflections: () =>
        ipcRenderer.invoke('db:getReflections'),
    saveReflection: (date: string, verse: string, text: string) =>
        ipcRenderer.invoke('db:saveReflection', date, verse, text),
    deleteReflection: (id: number) =>
        ipcRenderer.invoke('db:deleteReflection', id),
    exportBackup: () =>
        ipcRenderer.invoke('db:exportBackup'),
    importBackup: (payload: BackupPayload) =>
        ipcRenderer.invoke('db:importBackup', payload),
});

// Type declarations
declare global {
    interface Window {
        electronAPI: {
            getDatabaseStatus: () => Promise<{ ready: boolean; error: string | null; path: string | null }>;
            waitUntilDatabaseReady: () => Promise<{ ready: boolean; error: string | null; path: string | null }>;
            getTranslations: () => Promise<Translation[]>;
            getBooks: () => Promise<Book[]>;
            getVerses: (translationId: number, bookId: number, chapter: number) => Promise<Verse[]>;
            searchVerses: (query: string, translationId: number) => Promise<Verse[]>;
            getChapterCount: (bookId: number, translationId: number) => Promise<number>;
            toggleHighlight: (verseId: number, color: string, topicId?: number) => Promise<string | null>;
            getHighlights: () => Promise<any[]>;
            getTopics: () => Promise<Topic[]>;
            createTopic: (name: string, color?: string) => Promise<number | null>;
            getReflections: () => Promise<ReflectionEntry[]>;
            saveReflection: (date: string, verse: string, text: string) => Promise<ReflectionEntry>;
            deleteReflection: (id: number) => Promise<void>;
            exportBackup: () => Promise<BackupPayload>;
            importBackup: (payload: BackupPayload) => Promise<number>;
        };
    }
}

export interface Topic {
    id: number;
    name: string;
    color?: string;
}

export interface Translation {
    id: number;
    code: string;
    name: string;
}

export interface Book {
    id: number;
    code: string;
    name: string;
    order_index: number;
}

export interface Verse {
    id: number;
    book_code: string;
    book_name: string;
    chapter: number;
    verse: number;
    text: string;
}

export interface ReflectionEntry {
    id: number;
    day_key: string;
    date: string;
    verse: string;
    text: string;
    updated_at: string;
}

export interface BackupPayload {
    version: number;
    exportedAt: string;
    reflections: Array<{ day_key: string; date: string; verse: string; text: string }>;
}
