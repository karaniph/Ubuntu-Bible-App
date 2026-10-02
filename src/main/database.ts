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

// Display names keyed by translation code. Codes are left unchanged because
// the renderer uses them (e.g. to pick KJV as the default translation).
const TRANSLATION_NAMES: Record<string, string> = {
    'ENG-KJV': 'King James Version (KJV)',
    'ENG-ASV': 'American Standard Version (ASV)',
    'ENGWEBP': 'World English Bible (WEB)',
    'ENGWEBSTER': 'Webster Bible (WBT)',
    'ENG-YLT': "Young's Literal Translation (YLT)",
    'ENG-DBY': 'Darby Translation (DBY)',
    // Only present in installs from the very first builds, alongside ENG-KJV.
    'ENG-KJV2006': 'King James Version (earlier copy)',
};

function applyTranslationNames(database: Database.Database) {
    const update = database.prepare('UPDATE translations SET name = ? WHERE code = ? AND name <> ?');
    const tx = database.transaction(() => {
        for (const [code, name] of Object.entries(TRANSLATION_NAMES)) {
            update.run(name, code, name);
        }
    });
    try {
        tx();
    } catch (err) {
        // Cosmetic only; never block startup over display names.
        console.warn('Could not apply translation display names:', err);
    }
}

function readTextVersion(database: Database.Database): number {
    try {
        const row = database.prepare("SELECT value FROM app_meta WHERE key = 'bible_text_version'").get() as { value: string } | undefined;
        return row ? Number(row.value) || 1 : 1;
    } catch {
        return 1; // No app_meta table: install predates versioned Bible text.
    }
}

/**
 * Users keep their own copy of bible.db (it also holds their notes), so a new
 * app version never replaces it. When the shipped Bible text is newer, copy the
 * corrected verse text into the user's database:
 *  - a full backup of the user's database is written first;
 *  - everything runs in one transaction, so it either fully applies or not at all;
 *  - verses are matched by translation code + book code + chapter + verse, and
 *    existing verse ids are kept, so highlights stay attached to the same verse;
 *  - highlights, topics and reflections are never read or written.
 * On any failure the app keeps working with the old text.
 */
async function upgradeBibleText(database: Database.Database, sourceDbPath: string, destDbPath: string) {
    let source: Database.Database | null = null;
    try {
        source = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
        const shippedVersion = readTextVersion(source);
        const userVersion = readTextVersion(database);
        if (shippedVersion <= userVersion) return;

        const startedAt = Date.now();
        console.log(`Upgrading Bible text from v${userVersion} to v${shippedVersion}`);
        const backupPath = `${destDbPath}.before-bible-text-v${shippedVersion}`;
        if (!fs.existsSync(backupPath)) {
            // VACUUM INTO writes a complete, consistent copy in one step. Write to a
            // temp name first so an interrupted backup never looks like a finished one.
            const tmpBackup = `${backupPath}.tmp`;
            await fs.promises.rm(tmpBackup, { force: true });
            database.prepare('VACUUM INTO ?').run(tmpBackup);
            await fs.promises.rename(tmpBackup, backupPath);
            console.log('Backed up user database to:', backupPath);
        }

        const userBookId = new Map<string, number>();
        for (const b of database.prepare('SELECT id, code FROM books').all() as { id: number; code: string }[]) {
            userBookId.set(b.code, b.id);
        }
        const userTranslationId = new Map<string, number>();
        for (const t of database.prepare('SELECT id, code FROM translations').all() as { id: number; code: string }[]) {
            userTranslationId.set(t.code, t.id);
        }

        const insertTranslation = database.prepare('INSERT INTO translations (code, name) VALUES (?, ?)');
        const updateVerse = database.prepare(
            'UPDATE verses SET text = ? WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse = ? AND text <> ?'
        );
        const verseExists = database.prepare(
            'SELECT 1 FROM verses WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse = ? LIMIT 1'
        );
        const insertVerse = database.prepare(
            'INSERT INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?, ?, ?, ?, ?)'
        );
        const hasFts = !!database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'verses_fts'").get();

        const shippedVerses = source.prepare(`
            SELECT t.code AS tcode, b.code AS bcode, v.chapter, v.verse, v.text
            FROM verses v JOIN translations t ON t.id = v.translation_id JOIN books b ON b.id = v.book_id
        `);

        // The search-index triggers would re-index every changed verse one by one,
        // which made this take minutes. Drop them for the bulk update, rebuild the
        // index once, then restore them exactly as they were (all in the transaction).
        const verseTriggers = database
            .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'verses' AND sql IS NOT NULL")
            .all() as { name: string; sql: string }[];

        // Extra user translations that should receive another translation's text.
        const aliasTargets = new Map<string, number[]>();
        let updated = 0;
        let inserted = 0;
        const apply = database.transaction(() => {
            // Builds from January 2026 stored the King James text under code
            // ENG-KJV2006. Treat it as the KJV so its text gets corrected in place
            // (keeping highlights on it) instead of adding a second KJV next to it.
            if (userTranslationId.has('ENG-KJV2006')) {
                if (!userTranslationId.has('ENG-KJV')) {
                    database.prepare("UPDATE translations SET code = 'ENG-KJV' WHERE code = 'ENG-KJV2006'").run();
                    userTranslationId.set('ENG-KJV', userTranslationId.get('ENG-KJV2006')!);
                    userTranslationId.delete('ENG-KJV2006');
                } else {
                    aliasTargets.set('ENG-KJV', [userTranslationId.get('ENG-KJV2006')!]);
                }
            }
            for (const t of verseTriggers) database.exec(`DROP TRIGGER IF EXISTS "${t.name.replace(/"/g, '""')}"`);
            database.prepare('CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(translation_id, book_id, chapter, verse)').run();
            for (const t of source!.prepare('SELECT code, name FROM translations').all() as { code: string; name: string }[]) {
                if (!userTranslationId.has(t.code)) {
                    userTranslationId.set(t.code, Number(insertTranslation.run(t.code, t.name).lastInsertRowid));
                }
            }
            for (const row of shippedVerses.iterate() as IterableIterator<{ tcode: string; bcode: string; chapter: number; verse: number; text: string }>) {
                const tid = userTranslationId.get(row.tcode);
                const bid = userBookId.get(row.bcode);
                if (tid === undefined || bid === undefined) continue;
                for (const target of [tid, ...(aliasTargets.get(row.tcode) ?? [])]) {
                    const res = updateVerse.run(row.text, target, bid, row.chapter, row.verse, row.text);
                    if (res.changes > 0) {
                        updated += res.changes;
                    } else if (!verseExists.get(target, bid, row.chapter, row.verse)) {
                        insertVerse.run(target, bid, row.chapter, row.verse, row.text);
                        inserted++;
                    }
                }
            }
            if (hasFts) {
                // Re-index search once so it matches the corrected text.
                database.prepare("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')").run();
            }
            for (const t of verseTriggers) database.exec(t.sql);
            database.prepare('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
            database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('bible_text_version', ?)").run(String(shippedVersion));
        });
        apply();
        console.log(`Bible text upgraded: ${updated} verses corrected, ${inserted} verses added in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    } catch (err) {
        console.error('Bible text upgrade failed; keeping existing text:', err);
    } finally {
        source?.close();
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

        // Bring Bible text in older installs up to the shipped version. Only
        // translations/verses are touched; highlights, topics and reflections are not.
        await upgradeBibleText(db, sourceDbPath, destDbPath);

        // Readable translation names. Applied on every launch (idempotent) so
        // existing installs, whose writable DB copy predates this fix, get them too.
        applyTranslationNames(db);

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
        // Preferred: Full Text Search.
        // CROSS JOIN forces SQLite to start from the FTS matches. Without it the
        // planner walks every verse of the translation and probes the FTS index
        // per row, which took ~10s and froze the window. ORDER BY v.id keeps the
        // same Genesis-to-Revelation order the old plan produced.
        const stmt = database.prepare(`
      SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text
      FROM verses_fts fts
      CROSS JOIN verses v ON fts.rowid = v.id
      JOIN books b ON v.book_id = b.id
      WHERE verses_fts MATCH ? AND v.translation_id = ?
      ORDER BY v.id
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
