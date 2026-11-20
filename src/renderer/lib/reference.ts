// Parses typed Bible references such as "John 3:16", "jn 3:16-18", "1 cor 13:4",
// "psalm 23" or "Song of Songs 2". Returns null for anything that is not a book
// plus a chapter number, so plain words ("john", "shepherd") stay text searches.

export interface BookLike {
    id: number;
    code: string; // USFM code
    name: string;
}

export interface ParsedReference {
    book: BookLike;
    chapter: number;
    verse?: number;
    verseEnd?: number;
}

// A study passage: whole chapters (chapterStart..chapterEnd) or a verse range in one chapter.
export interface PassageReference {
    book: BookLike;
    chapterStart: number;
    chapterEnd: number;
    verseStart?: number;
    verseEnd?: number;
}

// Books with a single chapter, where "Jude 1-7" or "Jude 5" means verses, not chapters.
export const SINGLE_CHAPTER_BOOKS = new Set(['OBA', 'PHM', '2JN', '3JN', 'JUD']);

// Extra names per USFM code. Keys are lowercase with spaces/dots removed.
const ALIASES: Record<string, string[]> = {
    GEN: ['gen', 'ge', 'gn'],
    EXO: ['exo', 'exod', 'ex'],
    LEV: ['lev', 'le', 'lv'],
    NUM: ['num', 'nu', 'nm', 'nb'],
    DEU: ['deut', 'deu', 'dt', 'de'],
    JOS: ['josh', 'jos'],
    JDG: ['judg', 'jdg', 'jg', 'jdgs'],
    RUT: ['ru', 'rth'],
    '1SA': ['1sam', '1sa', '1sm', '1s'],
    '2SA': ['2sam', '2sa', '2sm', '2s'],
    '1KI': ['1kgs', '1ki', '1kin', '1k', '1kings'],
    '2KI': ['2kgs', '2ki', '2kin', '2k', '2kings'],
    '1CH': ['1chron', '1chr', '1ch'],
    '2CH': ['2chron', '2chr', '2ch'],
    EZR: ['ezr'],
    NEH: ['neh', 'ne'],
    EST: ['esth', 'est', 'es'],
    JOB: ['jb'],
    PSA: ['psalm', 'psalms', 'ps', 'psa', 'pslm', 'psm', 'pss'],
    PRO: ['prov', 'pro', 'prv', 'pr'],
    ECC: ['eccles', 'eccl', 'ecc', 'ec', 'qoh', 'ecclesiastes'],
    SNG: ['songofsongs', 'songofsolomon', 'song', 'sos', 'ss', 'sng', 'canticles', 'canticleofcanticles'],
    ISA: ['isa', 'is'],
    JER: ['jer', 'je', 'jr'],
    LAM: ['lam', 'la'],
    EZK: ['ezek', 'eze', 'ezk'],
    DAN: ['dan', 'da', 'dn'],
    HOS: ['hos', 'ho'],
    JOL: ['joel', 'jol', 'jl'],
    AMO: ['amos', 'am'],
    OBA: ['obad', 'oba', 'ob'],
    JON: ['jonah', 'jnh'],
    MIC: ['mic', 'mc'],
    NAM: ['nah', 'nam', 'na'],
    HAB: ['hab', 'hb'],
    ZEP: ['zeph', 'zep', 'zp'],
    HAG: ['hag', 'hg'],
    ZEC: ['zech', 'zec', 'zc'],
    MAL: ['mal', 'ml'],
    MAT: ['matt', 'mat', 'mt'],
    MRK: ['mrk', 'mar', 'mk', 'mr'],
    LUK: ['luk', 'lk', 'lu'],
    JHN: ['jhn', 'jn', 'joh'],
    ACT: ['acts', 'act', 'ac'],
    ROM: ['rom', 'ro', 'rm'],
    '1CO': ['1cor', '1co'],
    '2CO': ['2cor', '2co'],
    GAL: ['gal', 'ga'],
    EPH: ['eph', 'ep'],
    PHP: ['phil', 'php', 'pp'],
    COL: ['col', 'co'],
    '1TH': ['1thess', '1thes', '1th'],
    '2TH': ['2thess', '2thes', '2th'],
    '1TI': ['1tim', '1ti'],
    '2TI': ['2tim', '2ti'],
    TIT: ['titus', 'tit'],
    PHM: ['philem', 'phlm', 'phm'],
    HEB: ['heb'],
    JAS: ['jas', 'jm'],
    '1PE': ['1pet', '1pe', '1pt'],
    '2PE': ['2pet', '2pe', '2pt'],
    '1JN': ['1jn', '1jo', '1joh', '1jhn'],
    '2JN': ['2jn', '2jo', '2joh', '2jhn'],
    '3JN': ['3jn', '3jo', '3joh', '3jhn'],
    JUD: ['jude', 'jud'],
    REV: ['rev', 're', 'revelations', 'apocalypse'],
};

const squash = (s: string) => s.toLowerCase().replace(/[\s.]/g, '');

export function buildBookLookup(books: BookLike[]): Map<string, BookLike> {
    const map = new Map<string, BookLike>();
    // Aliases first, then full names and codes win on any collision.
    for (const book of books) {
        for (const alias of ALIASES[book.code] || []) map.set(alias, book);
    }
    for (const book of books) {
        map.set(squash(book.name), book);
        map.set(squash(book.code), book);
    }
    return map;
}

// optional book number, book name, chapter, then either :verse with optional -verseEnd,
// or -chapterEnd (a chapter range, used only by study passages)
const REF_PATTERN = /^([1-3])?\s*([a-z][a-z .]*?)\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?|\s*-\s*(\d{1,3}))?$/;

function matchReference(input: string, lookup: Map<string, BookLike>) {
    const text = input
        .toLowerCase()
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    // Roman numeral prefixes ("ii kings", "iii john") are not supported on purpose.
    const m = REF_PATTERN.exec(text);
    if (!m) return null;
    const [, num, name, chapterStr, verseStr, endStr, rangeEndStr] = m;
    const book = lookup.get(squash((num || '') + name));
    if (!book) return null;
    return { book, chapterStr, verseStr, endStr, rangeEndStr };
}

export function parseReference(input: string, lookup: Map<string, BookLike>): ParsedReference | null {
    const m = matchReference(input, lookup);
    // "Psalms 1-7" (a chapter range) stays a text search here, as before.
    if (!m || m.rangeEndStr !== undefined) return null;
    const { book, chapterStr, verseStr, endStr } = m;
    const chapter = parseInt(chapterStr, 10);
    const result: ParsedReference = { book, chapter };
    if (verseStr !== undefined) {
        result.verse = parseInt(verseStr, 10);
        if (endStr !== undefined) {
            result.verseEnd = parseInt(endStr, 10);
        }
    }
    return result;
}

export function formatReference(ref: ParsedReference): string {
    let s = `${ref.book.name} ${ref.chapter}`;
    if (ref.verse !== undefined) {
        s += `:${ref.verse}`;
        if (ref.verseEnd !== undefined && ref.verseEnd !== ref.verse) s += `-${ref.verseEnd}`;
    }
    return s;
}

/**
 * Parses a study passage: "Psalms 1-7" (chapters), "Romans 8", "John 3:16-21", "John 3:16".
 * In single-chapter books the numbers are verses: "Jude 1-7" is Jude 1:1-7 and "Jude 5" is
 * Jude 1:5, while "Jude 1" is the whole book. Returns null for anything it can't read.
 */
export function parsePassage(input: string, lookup: Map<string, BookLike>): PassageReference | null {
    const m = matchReference(input, lookup);
    if (!m) return null;
    const { book, chapterStr, verseStr, endStr, rangeEndStr } = m;
    const nums = [chapterStr, verseStr, endStr, rangeEndStr]
        .map((s) => (s === undefined ? undefined : parseInt(s, 10)));
    if (nums.some((n) => n === 0)) return null;
    const [first, verse, verseEnd, rangeEnd] = nums;
    const ordered = (a: number, b: number) => (a <= b ? [a, b] : [b, a]);

    if (verse !== undefined) {
        const [vs, ve] = ordered(verse, verseEnd ?? verse);
        return { book, chapterStart: first!, chapterEnd: first!, verseStart: vs, verseEnd: ve };
    }
    if (SINGLE_CHAPTER_BOOKS.has(book.code)) {
        if (rangeEnd !== undefined) {
            const [vs, ve] = ordered(first!, rangeEnd);
            return { book, chapterStart: 1, chapterEnd: 1, verseStart: vs, verseEnd: ve };
        }
        if (first === 1) return { book, chapterStart: 1, chapterEnd: 1 };
        return { book, chapterStart: 1, chapterEnd: 1, verseStart: first, verseEnd: first };
    }
    const [cs, ce] = ordered(first!, rangeEnd ?? first!);
    return { book, chapterStart: cs, chapterEnd: ce };
}

/** "Psalms 1-7", "Romans 8", "John 3:16-21", "John 3:16". */
export function formatPassage(
    bookName: string,
    chapterStart: number,
    chapterEnd: number,
    verseStart?: number | null,
    verseEnd?: number | null,
): string {
    if (verseStart === undefined || verseStart === null) {
        return chapterEnd !== chapterStart ? `${bookName} ${chapterStart}-${chapterEnd}` : `${bookName} ${chapterStart}`;
    }
    const end = verseEnd !== undefined && verseEnd !== null && verseEnd !== verseStart ? `-${verseEnd}` : '';
    return `${bookName} ${chapterStart}:${verseStart}${end}`;
}

/** Sorted runs of consecutive numbers: [5, 1, 2, 3] -> [[1, 3], [5, 5]]. */
export function verseRuns(nums: number[]): Array<[number, number]> {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    const runs: Array<[number, number]> = [];
    for (const n of sorted) {
        const last = runs[runs.length - 1];
        if (last && n === last[1] + 1) last[1] = n;
        else runs.push([n, n]);
    }
    return runs;
}

/** [[1, 3], [5, 5]] -> "1-3, 5". */
export function formatVerseRuns(runs: Array<[number, number]>): string {
    return runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
}
