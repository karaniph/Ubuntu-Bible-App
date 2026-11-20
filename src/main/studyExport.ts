import Database from 'better-sqlite3';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { getStudy } from './studies';
import type { StudyDetail, StudyExportOutcome, StudyResult } from './preload';

// Study export: PDF, print and plain text. The renderer only sends ids and a format;
// the study is re-read from the database here. Files are written only to the path
// the user picks in the save dialog. PDF and print render in a hidden, sandboxed
// window on an in-memory session; no temp file is written and nothing is loaded
// from the network (the page's Content-Security-Policy blocks every resource).

const OMITTED = 'This verse is not included in this translation.';
const WRITE_ERROR = 'Could not save the file. Please choose another folder.';
const FORMATS = ['pdf', 'txt', 'print'] as const;
type Format = (typeof FORMATS)[number];

// Mirrors src/renderer/lib/storage.ts stripPilcrow (the renderer code can't be imported here).
export function stripPilcrow(text: string): string {
    return text.replace(/¶/g, '').replace(/\s+/g, ' ').trim();
}

// Mirrors src/renderer/lib/reference.ts formatPassage.
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

function cleanNote(note: string): string {
    return note.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

export function buildStudyText(study: StudyDetail, translationName: string): string {
    const header = [study.name];
    if (study.description) header.push(study.description);
    header.push(`Translation: ${translationName}`);
    const blocks: string[][] = [header];
    for (const p of study.passages) {
        const lines = [formatPassage(p.book_name, p.chapter_start, p.chapter_end, p.verse_start, p.verse_end)];
        const multiChapter = p.chapter_end > p.chapter_start;
        let lastChapter = 0;
        for (const v of p.verses) {
            if (multiChapter && v.chapter !== lastChapter) lines.push(`${p.book_name} ${v.chapter}`);
            lastChapter = v.chapter;
            lines.push(`${v.verse} ${stripPilcrow(v.text) || OMITTED}`);
        }
        if (p.verses.length === 0) lines.push(OMITTED);
        if (p.note.trim()) {
            lines.push('Notes:');
            lines.push(cleanNote(p.note));
        }
        blocks.push(lines);
    }
    return blocks.map((b) => b.join('\n')).join('\n\n') + '\n';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildStudyHtml(study: StudyDetail, translationName: string): string {
    const parts: string[] = [];
    parts.push(`<h1>${escapeHtml(study.name)}</h1>`);
    if (study.description) parts.push(`<p class="description">${escapeHtml(study.description)}</p>`);
    parts.push(`<p class="translation">Translation: ${escapeHtml(translationName)}</p>`);
    for (const p of study.passages) {
        parts.push('<section class="passage">');
        parts.push(`<h2>${escapeHtml(formatPassage(p.book_name, p.chapter_start, p.chapter_end, p.verse_start, p.verse_end))}</h2>`);
        const multiChapter = p.chapter_end > p.chapter_start;
        let lastChapter = 0;
        for (const v of p.verses) {
            if (multiChapter && v.chapter !== lastChapter) {
                parts.push(`<h3>${escapeHtml(`${p.book_name} ${v.chapter}`)}</h3>`);
            }
            lastChapter = v.chapter;
            const text = stripPilcrow(v.text);
            parts.push(`<p class="verse"><sup>${v.verse}</sup> ${text ? escapeHtml(text) : `<i>${OMITTED}</i>`}</p>`);
        }
        if (p.verses.length === 0) parts.push(`<p class="verse"><i>${OMITTED}</i></p>`);
        if (p.note.trim()) {
            parts.push(`<h3 class="notes-title">Notes</h3><div class="notes">${escapeHtml(cleanNote(p.note))}</div>`);
        }
        parts.push('</section>');
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(study.name)}</title>
<style>
body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #000; background: #fff; margin: 0; line-height: 1.5; }
h1 { font-size: 18pt; margin: 0 0 6pt; }
h2 { font-size: 13pt; margin: 18pt 0 6pt; }
h3 { font-size: 11pt; margin: 10pt 0 4pt; }
p { margin: 0 0 4pt; }
.description { margin-bottom: 6pt; }
.translation { color: #000; font-style: italic; margin-bottom: 12pt; }
sup { font-size: 0.75em; font-weight: bold; }
.notes { white-space: pre-wrap; border-left: 2pt solid #000; padding-left: 8pt; }
.passage { page-break-inside: auto; }
@page { margin: 18mm; }
</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>
`;
}

function safeFileName(name: string): string {
    const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim().slice(0, 80).trim();
    return cleaned || 'Bible study';
}

function defaultFolder(): string {
    const snapHome = process.env.SNAP_REAL_HOME;
    if (snapHome) {
        const documents = path.join(snapHome, 'Documents');
        return fs.existsSync(documents) ? documents : snapHome;
    }
    return app.getPath('documents');
}

async function renderInHiddenWindow<T>(html: string, run: (win: BrowserWindow) => Promise<T>): Promise<T> {
    const win = new BrowserWindow({
        show: false,
        width: 820,
        height: 1100,
        webPreferences: {
            sandbox: !process.env.SNAP,
            contextIsolation: true,
            nodeIntegration: false,
            partition: 'study-export', // no "persist:" prefix: in-memory session
        },
    });
    try {
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', (event) => event.preventDefault());
        await win.loadURL('about:blank');
        await win.webContents.executeJavaScript(
            'document.open();document.write(' + JSON.stringify(html) + ');document.close();true',
        );
        return await run(win);
    } finally {
        win.destroy();
    }
}

let exporting = false;

export async function exportStudy(
    parent: BrowserWindow,
    db: Database.Database,
    studyId: unknown,
    translationId: unknown,
    format: unknown,
): Promise<StudyResult<StudyExportOutcome>> {
    if (typeof format !== 'string' || !(FORMATS as readonly string[]).includes(format)) {
        return { ok: false, error: 'Unknown export format.' };
    }
    const kind = format as Format;
    let study: StudyDetail | null;
    try {
        study = getStudy(db, studyId, translationId);
    } catch {
        study = null;
    }
    if (!study) return { ok: false, error: 'That study could not be found.' };
    const translation = db.prepare('SELECT name, code FROM translations WHERE id = ?').get(translationId) as
        | { name: string; code: string }
        | undefined;
    const translationName = translation ? translation.name || translation.code : '';

    if (exporting) return { ok: false, error: 'An export is already in progress.' };
    exporting = true;
    try {
        if (kind === 'print') {
            const html = buildStudyHtml(study, translationName);
            const printed = await renderInHiddenWindow(html, (win) => new Promise<boolean>((resolve) => {
                win.webContents.print({ silent: false, printBackground: false }, (success, failureReason) => {
                    if (!success && failureReason) console.log('Print not completed:', failureReason);
                    resolve(success);
                });
            }));
            return { ok: true, value: { status: printed ? 'printed' : 'cancelled' } };
        }

        const ext = kind === 'pdf' ? 'pdf' : 'txt';
        const choice = await dialog.showSaveDialog(parent, {
            title: kind === 'pdf' ? 'Save study as PDF' : 'Save study as text',
            defaultPath: path.join(defaultFolder(), `${safeFileName(study.name)}.${ext}`),
            filters: kind === 'pdf' ? [{ name: 'PDF', extensions: ['pdf'] }] : [{ name: 'Text', extensions: ['txt'] }],
        });
        if (choice.canceled || !choice.filePath) return { ok: true, value: { status: 'cancelled' } };
        const filePath = choice.filePath;
        if (typeof filePath !== 'string' || filePath.length === 0 || !path.isAbsolute(filePath)) {
            return { ok: false, error: WRITE_ERROR };
        }

        try {
            if (kind === 'txt') {
                await fs.promises.writeFile(filePath, buildStudyText(study, translationName), 'utf8');
            } else {
                const html = buildStudyHtml(study, translationName);
                const pdf = await renderInHiddenWindow(html, (win) =>
                    win.webContents.printToPDF({ pageSize: 'A4', printBackground: false }));
                await fs.promises.writeFile(filePath, pdf);
            }
        } catch (err) {
            console.error('Study export failed:', err);
            return { ok: false, error: WRITE_ERROR };
        }
        return { ok: true, value: { status: 'saved', filePath } };
    } catch (err) {
        console.error('Study export failed:', err);
        return { ok: false, error: 'Could not export the study.' };
    } finally {
        exporting = false;
    }
}
