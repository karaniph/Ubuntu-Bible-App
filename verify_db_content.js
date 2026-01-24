const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'assets/bible.db');
const db = new Database(dbPath, { readonly: true });

// 1. Check Translations
console.log('--- Translations ---');
const translations = db.prepare('SELECT id, code, name FROM translations').all();
console.table(translations);

// 2. Check Genesis 1 verses for the first non-sample KJV (assuming ID 1 or similar)
// Let's find KJV ID first
const kjv = translations.find(t => t.code.includes('KJV') || t.name.includes('King James'));
if (kjv) {
    console.log(`\n--- Checking Verses for ${kjv.name} (ID: ${kjv.id}) in Genesis 1 (Book ID 1) ---`);
    const verses = db.prepare('SELECT verse, text FROM verses WHERE translation_id = ? AND book_id = 1 AND chapter = 1 ORDER BY verse').all(kjv.id);

    // Print first 15 verses to check for gaps (1 to 10)
    verses.slice(0, 15).forEach(v => {
        console.log(`${v.verse}: ${v.text.substring(0, 30)}...`);
    });

    // Check for gaps
    let expected = 1;
    let gaps = [];
    for (const v of verses) {
        if (v.verse !== expected) {
            gaps.push(`Missing ${expected} (Found ${v.verse})`);
            expected = v.verse;
        }
        expected++;
    }

    if (gaps.length > 0) {
        console.log('\n⚠️ GAPS FOUND:', gaps);
    } else {
        console.log('\n✅ No gaps found in verse sequence.');
    }
} else {
    console.log('KJV not found to test.');
}

db.close();
