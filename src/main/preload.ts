import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    copyText: (text: string) => ipcRenderer.invoke('app:copyText', text),
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
    // Bible studies
    listStudies: () => ipcRenderer.invoke('studies:list'),
    getStudy: (studyId: number, translationId: number) =>
        ipcRenderer.invoke('studies:get', studyId, translationId),
    createStudy: (name: string, description: string) =>
        ipcRenderer.invoke('studies:create', name, description),
    updateStudy: (studyId: number, name: string, description: string) =>
        ipcRenderer.invoke('studies:update', studyId, name, description),
    deleteStudy: (studyId: number) =>
        ipcRenderer.invoke('studies:delete', studyId),
    addStudyPassages: (studyId: number, passages: StudyPassageInput[]) =>
        ipcRenderer.invoke('studies:addPassages', studyId, passages),
    updateStudyPassageNote: (passageId: number, note: string) =>
        ipcRenderer.invoke('studies:updatePassageNote', passageId, note),
    removeStudyPassage: (passageId: number) =>
        ipcRenderer.invoke('studies:removePassage', passageId),
    moveStudyPassage: (passageId: number, direction: 'up' | 'down') =>
        ipcRenderer.invoke('studies:movePassage', passageId, direction),
});

// Type declarations
declare global {
    interface Window {
        electronAPI: {
            openExternal: (url: string) => Promise<void>;
            copyText: (text: string) => Promise<boolean>;
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
            listStudies: () => Promise<StudySummary[]>;
            getStudy: (studyId: number, translationId: number) => Promise<StudyDetail | null>;
            createStudy: (name: string, description: string) => Promise<StudyResult<StudySummary>>;
            updateStudy: (studyId: number, name: string, description: string) => Promise<StudyResult<StudySummary>>;
            deleteStudy: (studyId: number) => Promise<StudyResult<null>>;
            addStudyPassages: (studyId: number, passages: StudyPassageInput[]) => Promise<StudyResult<StudyPassage[]>>;
            updateStudyPassageNote: (passageId: number, note: string) => Promise<StudyResult<{ id: number; note: string; updated_at: string }>>;
            removeStudyPassage: (passageId: number) => Promise<StudyResult<null>>;
            moveStudyPassage: (passageId: number, direction: 'up' | 'down') => Promise<StudyResult<number[]>>;
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

// Bible studies. Passages are stored as references (book code + chapters/verses),
// never as verse ids, so the same study works in every translation.
export interface StudySummary {
    id: number;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
    passage_count: number;
}

export interface StudyPassage {
    id: number;
    study_id: number;
    position: number;
    book_code: string;
    chapter_start: number;
    verse_start: number | null; // null = whole chapters chapter_start..chapter_end
    chapter_end: number;
    verse_end: number | null;
    note: string;
    created_at: string;
    updated_at: string;
}

export interface StudyVerse {
    id: number;
    chapter: number;
    verse: number;
    text: string;
}

export interface StudyPassageWithText extends StudyPassage {
    book_id: number;
    book_name: string;
    verses: StudyVerse[];
}

export interface StudyDetail extends StudySummary {
    passages: StudyPassageWithText[];
}

export interface StudyPassageInput {
    bookCode: string;
    chapterStart: number;
    chapterEnd: number;
    verseStart: number | null;
    verseEnd: number | null;
}

export type StudyResult<T> = { ok: true; value: T } | { ok: false; error: string };
