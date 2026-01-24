const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'assets/bible.db');
const db = new Database(dbPath, { readonly: true });

// Check for "Heb." in verse text
console.log('--- Checking for "Heb." references ---');
const badVerses = db.prepare("SELECT translation_id, text FROM verses WHERE text LIKE '%Heb.%' LIMIT 20").all();

if (badVerses.length > 0) {
    console.log('❌ FAILURE: Found "Heb." in text:');
    badVerses.forEach(v => console.log(`[Trans ID: ${v.translation_id}] ${v.text.substring(0, 100)}...`));
} else {
    console.log('✅ SUCCESS: "Heb." references NOT found.');
}

// Check verse counts just to be sure
console.log('\n--- CheckingVerse Counts ---');
const counts = db.prepare("SELECT translation_id, count(*) as count FROM verses GROUP BY translation_id").all();
console.table(counts);

db.close();
