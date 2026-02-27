import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let db: Database.Database | null = null;
let dbInitError: string | null = null;
let activeDbPath: string | null = null;

function isCorruptDatabaseError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes('database disk image is malformed')
        || msg.includes('sqlite_corrupt')
        || msg.includes('file is not a database');
}

async function copyDbAtomically(sourceDbPath: string, destDbPath: string) {
    const tmpPath = `${destDbPath}.tmp`;
    await fs.promises.mkdir(path.dirname(destDbPath), { recursive: true });
    await fs.promises.copyFile(sourceDbPath, tmpPath);
    await fs.promises.rename(tmpPath, destDbPath);
}

function openValidatedDatabase(dbPath: string): Database.Database {
    const opened = new Database(dbPath, { readonly: false });
    try {
        // Lightweight sanity check to avoid expensive integrity scans at startup.
        opened.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
        return opened;
    } catch (err) {
        opened.close();
        throw err;
    }
}

export interface ReflectionRow {
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

function ensureDb(): Database.Database {
    if (!db) {
        throw new Error(dbInitError || 'Database is not initialized');
    }
    return db;
}

export async function initDatabase() {
    const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

    // Resolve DB source path across dev and packaged layouts.
    const sourceCandidates = isDev
        ? [
            path.join(app.getAppPath(), 'assets', 'bible.db'),
            path.join(__dirname, '../../assets/bible.db'),
        ]
        : [
            path.join(process.resourcesPath, 'assets', 'bible.db'),
            path.join(app.getAppPath(), 'assets', 'bible.db'),
        ];
    const sourceDbPath = sourceCandidates.find((candidate) => fs.existsSync(candidate));
    if (!sourceDbPath) {
        throw new Error(`Bible DB source not found. Checked: ${sourceCandidates.join(', ')}`);
    }

    // 2. Determine Destination Path (writable directory for user data)
    const userDataPath = app.getPath('userData');
    const destDbPath = path.join(userDataPath, 'bible.db');

    try {
        // 3. Sync DB if missing or in Dev (in dev we always want latest from source)
        if (!fs.existsSync(destDbPath) || isDev) {
            console.log('Copying database to writable location:', destDbPath);
            await copyDbAtomically(sourceDbPath, destDbPath);
        }

        // 4. Open from the writable location
        try {
            db = openValidatedDatabase(destDbPath);
        } catch (openErr) {
            if (!isCorruptDatabaseError(openErr)) {
                throw openErr;
            }
            console.warn('Detected corrupt writable DB, restoring from source copy.');
            if (fs.existsSync(destDbPath)) {
                const corruptBackupPath = `${destDbPath}.corrupt-${Date.now()}`;
                await fs.promises.rename(destDbPath, corruptBackupPath);
                console.warn('Corrupt DB moved to:', corruptBackupPath);
            }
            await copyDbAtomically(sourceDbPath, destDbPath);
            db = openValidatedDatabase(destDbPath);
        }
        activeDbPath = destDbPath;
        dbInitError = null;
        console.log('Database connected at:', destDbPath);

        // 5. Initialize Schema
        db.prepare(`
            CREATE TABLE IF NOT EXISTS topics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS highlights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                verse_id INTEGER NOT NULL,
                color TEXT NOT NULL,
                topic_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (verse_id) REFERENCES verses(id),
                FOREIGN KEY (topic_id) REFERENCES topics(id),
                UNIQUE(verse_id)
            )
        `).run();

        // Migrate existing highlights if they don't have topic_id column (should be handled by CREATE if it was updated, but SQLite doesn't add columns to existing tables easily without checking)
        try {
            db.prepare('ALTER TABLE highlights ADD COLUMN topic_id INTEGER REFERENCES topics(id)').run();
        } catch (e) {
            // Column might already exist
        }

        db.prepare(`
            CREATE TABLE IF NOT EXISTS reflections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day_key TEXT NOT NULL UNIQUE,
                date TEXT NOT NULL,
                verse TEXT NOT NULL,
                text TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
    } catch (err) {
        console.error('CRITICAL: Failed to initialize database:', err);
        dbInitError = err instanceof Error ? err.message : 'Unknown database initialization error';
        db = null;
        activeDbPath = null;
    }
}

export function getTopics() {
    const database = ensureDb();
    return database.prepare('SELECT * FROM topics ORDER BY name').all();
}

export function createTopic(name: string, color?: string) {
    const database = ensureDb();
    try {
        const result = database.prepare('INSERT INTO topics (name, color) VALUES (?, ?)').run(name, color);
        return result.lastInsertRowid;
    } catch (e) {
        // Topic might exist
        const existing = database.prepare('SELECT id FROM topics WHERE name = ?').get(name) as { id: number };
        return existing?.id;
    }
}

export function getTranslations() {
    const database = ensureDb();
    const stmt = database.prepare("SELECT id, code, name FROM translations WHERE name NOT LIKE '%sample%' ORDER BY id");
    return stmt.all();
}

export function getBooks() {
    const database = ensureDb();
    const stmt = database.prepare('SELECT id, code, name, order_index FROM books ORDER BY order_index');
    return stmt.all();
}

export function getVerses(translationId: number, bookId: number, chapter: number) {
    const database = ensureDb();
    const stmt = database.prepare(`
    SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text, h.color
    FROM verses v
    JOIN books b ON v.book_id = b.id
    LEFT JOIN highlights h ON v.id = h.verse_id
    WHERE v.translation_id = ? AND v.book_id = ? AND v.chapter = ?
    ORDER BY v.verse
  `);
    return stmt.all(translationId, bookId, chapter);
}

export function toggleHighlight(verseId: number, color: string, topicId?: number) {
    const database = ensureDb();
    const existing = database.prepare('SELECT id, color, topic_id FROM highlights WHERE verse_id = ?').get(verseId) as { id: number, color: string, topic_id: number | null } | undefined;

    if (existing) {
        if (existing.color === color && existing.topic_id === topicId) {
            database.prepare('DELETE FROM highlights WHERE id = ?').run(existing.id);
            return null;
        } else {
            database.prepare('UPDATE highlights SET color = ?, topic_id = ? WHERE id = ?').run(color, topicId, existing.id);
            return color;
        }
    } else {
        database.prepare('INSERT INTO highlights (verse_id, color, topic_id) VALUES (?, ?, ?)').run(verseId, color, topicId);
        return color;
    }
}

export function getHighlights() {
    const database = ensureDb();
    const stmt = database.prepare(`
        SELECT h.id, h.verse_id, h.color, h.created_at, h.topic_id, t.name as topic_name,
               v.text, v.chapter, v.verse, v.book_id, b.name as book_name, b.code as book_code
        FROM highlights h
        JOIN verses v ON h.verse_id = v.id
        JOIN books b ON v.book_id = b.id
        LEFT JOIN topics t ON h.topic_id = t.id
        ORDER BY h.created_at DESC
    `);
    return stmt.all();
}

export function searchVerses(query: string, translationId: number, limit: number = 50) {
    if (!query.trim()) return [];
    const database = ensureDb();
    try {
        // Preferred: Full Text Search
        const stmt = database.prepare(`
      SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text
      FROM verses_fts fts
      JOIN verses v ON fts.rowid = v.id
      JOIN books b ON v.book_id = b.id
      WHERE verses_fts MATCH ? AND v.translation_id = ?
      LIMIT ?
    `);
        return stmt.all(query, translationId, limit);
    } catch (ftsError) {
        console.log('FTS search fallback (table might be missing or query invalid):', ftsError);
        // Fallback: Standard LIKE search
        try {
            const stmt = database.prepare(`
          SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text
          FROM verses v
          JOIN books b ON v.book_id = b.id
          WHERE (v.text LIKE ? OR b.name LIKE ?) AND v.translation_id = ?
          LIMIT ?
        `);
            const searchTerm = `%${query}%`;
            return stmt.all(searchTerm, searchTerm, translationId, limit);
        } catch (likeError) {
            console.error('Search failed completely:', likeError);
            return [];
        }
    }
}

export function getChapterCount(bookId: number, translationId: number): number {
    const database = ensureDb();
    const stmt = database.prepare(`
    SELECT MAX(chapter) as count
    FROM verses
    WHERE book_id = ? AND translation_id = ?
  `);
    const result = stmt.get(bookId, translationId) as { count: number } | undefined;
    return result?.count ?? 0;
}

export function getReflections() {
    const database = ensureDb();
    const stmt = database.prepare(`
        SELECT id, day_key, date, verse, text, updated_at
        FROM reflections
        ORDER BY date DESC
    `);
    return stmt.all() as ReflectionRow[];
}

export function saveReflection(date: string, verse: string, text: string) {
    const database = ensureDb();
    const dayKey = date.split('T')[0];
    database.prepare(`
        INSERT INTO reflections (day_key, date, verse, text, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(day_key) DO UPDATE SET
            date = excluded.date,
            verse = excluded.verse,
            text = excluded.text,
            updated_at = CURRENT_TIMESTAMP
    `).run(dayKey, date, verse, text);
    return database.prepare('SELECT id, day_key, date, verse, text, updated_at FROM reflections WHERE day_key = ?').get(dayKey) as ReflectionRow;
}

export function deleteReflection(id: number) {
    const database = ensureDb();
    database.prepare('DELETE FROM reflections WHERE id = ?').run(id);
}

export function exportBackup(): BackupPayload {
    const database = ensureDb();
    const reflections = database.prepare('SELECT day_key, date, verse, text FROM reflections ORDER BY date DESC').all() as BackupPayload['reflections'];
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        reflections,
    };
}

export function importBackup(payload: BackupPayload) {
    const database = ensureDb();
    if (!payload || !Array.isArray(payload.reflections)) {
        throw new Error('Invalid backup payload');
    }

    const insert = database.prepare(`
        INSERT INTO reflections (day_key, date, verse, text, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(day_key) DO UPDATE SET
            date = excluded.date,
            verse = excluded.verse,
            text = excluded.text,
            updated_at = CURRENT_TIMESTAMP
    `);

    const tx = database.transaction((rows: BackupPayload['reflections']) => {
        for (const row of rows) {
            if (!row?.day_key || !row?.date || !row?.verse || !row?.text) continue;
            insert.run(row.day_key, row.date, row.verse, row.text);
        }
    });

    tx(payload.reflections);
    return getReflections().length;
}

export function getDatabaseStatus() {
    return {
        ready: !!db,
        error: dbInitError,
        path: activeDbPath,
    };
}

export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        activeDbPath = null;
    }
}
