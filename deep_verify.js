const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'assets/bible.db');
const db = new Database(dbPath, { readonly: true });

// Get all translations including samples
const allTranslations = db.prepare('SELECT id, code, name FROM translations').all();
console.log('--- ALL TRANSLATIONS ---');
console.table(allTranslations);

// Function to check gaps in a translation
function checkGaps(translationId, name) {
    console.log(`\nChecking ${name} (ID: ${translationId})...`);

    const rows = db.prepare(`
        SELECT b.name as book, v.chapter, count(*) as count, max(v.verse) as max_verse 
        FROM verses v 
        JOIN books b ON v.book_id = b.id 
        WHERE v.translation_id = ? 
        GROUP BY v.book_id, v.chapter
    `).all(translationId);

    let totalGaps = 0;

    rows.forEach(row => {
        if (row.count !== row.max_verse) {
            // Found a potential gap (count mismatches max verse number)
            // Let's verify specific missing numbers
            const verses = db.prepare(`
                SELECT verse 
                FROM verses v 
                JOIN books b ON v.book_id = b.id 
                WHERE v.translation_id = ? AND b.name = ? AND v.chapter = ? 
                ORDER BY verse
            `).all(translationId, row.book, row.chapter);

            let expected = 1;
            let gapsInChapter = [];
            for (const v of verses) {
                if (v.verse !== expected) {
                    while (expected < v.verse) {
                        gapsInChapter.push(expected);
                        expected++;
                    }
                }
                expected++;
            }

            if (gapsInChapter.length > 0) {
                console.log(`❌ Gap in ${row.book} ${row.chapter}: Missing verses ${gapsInChapter.join(', ')}`);
                totalGaps += gapsInChapter.length;
            }
        }
    });

    if (totalGaps === 0) {
        console.log(`✅ ${name} is PERFECT. No gaps found.`);
    } else {
        console.log(`⚠️ ${name} has ${totalGaps} missing verses.`);
    }
}

// Check all translations
allTranslations.forEach(t => checkGaps(t.id, t.name));

db.close();
