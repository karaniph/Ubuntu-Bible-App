import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// study.db holds the bundled, read-only study material (Matthew Henry's Concise
// Commentary and the concordance word list). It is opened in place from the install
// folder and never copied into the user's data folder. It holds no user data.
//
// Read-only install locations (snap squashfs, the Windows MSIX install folder) work
// because the file is built in rollback-journal mode (no -wal/-shm files are ever
// needed) and is opened with readonly: true, so SQLite never creates a journal.
// query_only adds a second guard against writes. The immutable=1 URI option is not
// available: better-sqlite3 9.x is built with SQLITE_USE_URI=0.

const STUDY_UNAVAILABLE =
    "The concordance and commentary aren't available right now. Reinstalling Bible App from the store you got it from should fix this.";

let studyDb: Database.Database | null = null;
let studyError: string | null = STUDY_UNAVAILABLE;

export function openStudyDatabaseAt(filePath: string): { db: Database.Database | null; error: string | null } {
    let handle: Database.Database | null = null;
    try {
        handle = new Database(filePath, { readonly: true, fileMustExist: true });
        handle.pragma('query_only = ON');
        const version = handle.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
            | { value: string }
            | undefined;
        if (!version || version.value !== '1') {
            throw new Error(`Unsupported study.db schema_version: ${version ? version.value : 'missing'}`);
        }
        const tables = handle
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('commentary', 'concordance_words')")
            .all() as Array<{ name: string }>;
        if (tables.length !== 2) {
            throw new Error('study.db is missing the commentary or concordance_words table');
        }
        return { db: handle, error: null };
    } catch (err) {
        console.error('Could not open study.db at', filePath, err);
        if (handle) {
            try {
                handle.close();
            } catch {
                // ignore close errors on a handle that failed validation
            }
        }
        return { db: null, error: STUDY_UNAVAILABLE };
    }
}

/** Opens the bundled study.db. Never throws and never copies the file. */
export function initStudyDatabase() {
    try {
        const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
        const candidates = isDev
            ? [
                path.join(app.getAppPath(), 'assets', 'study.db'),
                path.join(__dirname, '../../assets/study.db'),
            ]
            : [
                path.join(process.resourcesPath, 'assets', 'study.db'),
                path.join(app.getAppPath(), 'assets', 'study.db'),
            ];
        const filePath = candidates.find((candidate) => fs.existsSync(candidate));
        if (!filePath) {
            console.error('study.db not found. Checked:', candidates.join(', '));
            studyDb = null;
            studyError = STUDY_UNAVAILABLE;
            return;
        }
        const result = openStudyDatabaseAt(filePath);
        studyDb = result.db;
        studyError = result.error;
        if (studyDb) console.log('Study database opened read-only at:', filePath);
    } catch (err) {
        console.error('Study database initialisation failed:', err);
        studyDb = null;
        studyError = STUDY_UNAVAILABLE;
    }
}

export function getStudyDatabase(): Database.Database | null {
    return studyDb;
}

export function getStudyDataStatus(): { ready: boolean; error: string | null } {
    return { ready: studyDb !== null, error: studyDb ? null : studyError };
}
