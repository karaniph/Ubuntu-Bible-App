// Display preferences and last reading position. Stored in localStorage under
// NEW keys only; existing keys (reading plans, legacy reflections) are never
// read or written here. Anything missing, corrupt or unknown falls back to
// today's defaults.

export type ThemeId = 'light' | 'dark' | 'sepia';
export type LineSpacing = 'compact' | 'normal' | 'relaxed';
export type ReadingMode = 'verses' | 'paragraphs';

export interface AppSettings {
    theme: ThemeId;
    textSize: number; // index into TEXT_SIZES
    lineSpacing: LineSpacing;
    showVerseNumbers: boolean;
    readingMode: ReadingMode;
}

export interface LastRead {
    translationId: number;
    bookId?: number;
    chapter?: number;
}

export const SETTINGS_KEY = 'bibleApp.settings.v1';
export const LAST_READ_KEY = 'bibleApp.lastRead.v1';

// rem values; index 2 matches the original 1.1rem reader size.
export const TEXT_SIZES = [0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8];
export const LINE_HEIGHTS: Record<LineSpacing, number> = {
    compact: 1.5,
    normal: 1.85, // the original reader line height
    relaxed: 2.3,
};

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'light',
    textSize: 2,
    lineSpacing: 'normal',
    showVerseNumbers: true,
    readingMode: 'verses',
};

function readJson(key: string): Record<string, unknown> | null {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage full or unavailable: preferences just won't persist.
    }
}

export function loadSettings(): AppSettings {
    const raw = readJson(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const d = DEFAULT_SETTINGS;
    return {
        theme: raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'sepia' ? raw.theme : d.theme,
        textSize:
            typeof raw.textSize === 'number' && Number.isInteger(raw.textSize) &&
            raw.textSize >= 0 && raw.textSize < TEXT_SIZES.length
                ? raw.textSize
                : d.textSize,
        lineSpacing:
            raw.lineSpacing === 'compact' || raw.lineSpacing === 'normal' || raw.lineSpacing === 'relaxed'
                ? raw.lineSpacing
                : d.lineSpacing,
        showVerseNumbers: typeof raw.showVerseNumbers === 'boolean' ? raw.showVerseNumbers : d.showVerseNumbers,
        readingMode: raw.readingMode === 'verses' || raw.readingMode === 'paragraphs' ? raw.readingMode : d.readingMode,
    };
}

export function saveSettings(settings: AppSettings) {
    writeJson(SETTINGS_KEY, settings);
}

const isId = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

export function loadLastRead(): LastRead | null {
    const raw = readJson(LAST_READ_KEY);
    if (!raw || !isId(raw.translationId)) return null;
    const result: LastRead = { translationId: raw.translationId };
    if (isId(raw.bookId) && isId(raw.chapter)) {
        result.bookId = raw.bookId;
        result.chapter = raw.chapter;
    }
    return result;
}

export function saveLastRead(lastRead: LastRead) {
    writeJson(LAST_READ_KEY, lastRead);
}

// Short label used when copying a verse. Falls back to the stored code.
const TRANSLATION_LABELS: Record<string, string> = {
    'ENG-KJV': 'KJV',
    'ENG-ASV': 'ASV',
    'ENGWEBP': 'WEB',
    'ENGWEBSTER': 'WBT',
    'ENG-YLT': 'YLT',
    'ENG-DBY': 'DBY',
};

export function translationLabel(code: string): string {
    return TRANSLATION_LABELS[code] || code.replace(/^ENG-?/, '') || code;
}

export function stripPilcrow(text: string): string {
    return text.replace(/¶/g, '').replace(/\s+/g, ' ').trim();
}
