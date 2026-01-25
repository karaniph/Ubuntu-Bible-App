import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
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
});

// Type declarations
declare global {
    interface Window {
        electronAPI: {
            getTranslations: () => Promise<Translation[]>;
            getBooks: () => Promise<Book[]>;
            getVerses: (translationId: number, bookId: number, chapter: number) => Promise<Verse[]>;
            searchVerses: (query: string, translationId: number) => Promise<Verse[]>;
            getChapterCount: (bookId: number, translationId: number) => Promise<number>;
            toggleHighlight: (verseId: number, color: string, topicId?: number) => Promise<string | null>;
            getHighlights: () => Promise<any[]>;
            getTopics: () => Promise<Topic[]>;
            createTopic: (name: string, color?: string) => Promise<number | null>;
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
