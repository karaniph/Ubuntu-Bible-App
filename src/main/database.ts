import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let db: Database.Database | null = null;

export function initDatabase() {
    const isDev = process.env.NODE_ENV === 'development';

    // 1. Determine Source Path (where the app ships the DB)
    const sourceDbPath = isDev
        ? path.join(__dirname, '../../assets/bible.db')
        : path.join(process.resourcesPath, 'assets/bible.db');

    // 2. Determine Destination Path (writable directory for user data)
    const userDataPath = app.getPath('userData');
    const destDbPath = path.join(userDataPath, 'bible.db');

    try {
        // 3. Sync DB if missing or in Dev (in dev we always want latest from source)
        if (!fs.existsSync(destDbPath) || isDev) {
            console.log('Copying database to writable location:', destDbPath);
            fs.copyFileSync(sourceDbPath, destDbPath);
        }

        // 4. Open from the writable location
        db = new Database(destDbPath, { readonly: false });
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
    } catch (err) {
        console.error('CRITICAL: Failed to initialize database:', err);
    }
}

export function getTopics() {
    if (!db) return [];
    return db.prepare('SELECT * FROM topics ORDER BY name').all();
}

export function createTopic(name: string, color?: string) {
    if (!db) return null;
    try {
        const result = db.prepare('INSERT INTO topics (name, color) VALUES (?, ?)').run(name, color);
        return result.lastInsertRowid;
    } catch (e) {
        // Topic might exist
        const existing = db.prepare('SELECT id FROM topics WHERE name = ?').get(name) as { id: number };
        return existing?.id;
    }
}

export function getTranslations() {
    if (!db) return [];
    const stmt = db.prepare("SELECT id, code, name FROM translations WHERE name NOT LIKE '%sample%' ORDER BY id");
    return stmt.all();
}

export function getBooks() {
    if (!db) return [];
    const stmt = db.prepare('SELECT id, code, name, order_index FROM books ORDER BY order_index');
    return stmt.all();
}

export function getVerses(translationId: number, bookId: number, chapter: number) {
    if (!db) return [];
    const stmt = db.prepare(`
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
    if (!db) return null;
    const existing = db.prepare('SELECT id, color, topic_id FROM highlights WHERE verse_id = ?').get(verseId) as { id: number, color: string, topic_id: number | null } | undefined;

    if (existing) {
        if (existing.color === color && existing.topic_id === topicId) {
            db.prepare('DELETE FROM highlights WHERE id = ?').run(existing.id);
            return null;
        } else {
            db.prepare('UPDATE highlights SET color = ?, topic_id = ? WHERE id = ?').run(color, topicId, existing.id);
            return color;
        }
    } else {
        db.prepare('INSERT INTO highlights (verse_id, color, topic_id) VALUES (?, ?, ?)').run(verseId, color, topicId);
        return color;
    }
}

export function getHighlights() {
    if (!db) return [];
    const stmt = db.prepare(`
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
    if (!db || !query.trim()) return [];
    try {
        // Preferred: Full Text Search
        const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
    if (!db) return 0;
    const stmt = db.prepare(`
    SELECT MAX(chapter) as count
    FROM verses
    WHERE book_id = ? AND translation_id = ?
  `);
    const result = stmt.get(bookId, translationId) as { count: number } | undefined;
    return result?.count ?? 0;
}

export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
