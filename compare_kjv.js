const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'assets/bible.db');
const db = new Database(dbPath, { readonly: true });

function checkCompleteness(id, name) {
    const count = db.prepare('SELECT count(*) as c FROM verses WHERE translation_id = ?').get(id).c;
    console.log(`${name} (ID: ${id}): ${count} verses`);

    // Check for gaps in Genesis and Revelation as quick spot check
    const gen1 = db.prepare('SELECT count(*) as c FROM verses WHERE translation_id = ? AND book_id = 1 AND chapter = 1').get(id).c;
    const rev22 = db.prepare('SELECT count(*) as c FROM verses WHERE translation_id = ? AND book_id = 66 AND chapter = 22').get(id).c;
    console.log(`  - Gen 1: ${gen1} verses`);
    console.log(`  - Rev 22: ${rev22} verses`);
}

checkCompleteness(2, 'ENG-KJV');
checkCompleteness(3, 'ENG-KJV2006');
checkCompleteness(4, 'ENGWEBP');

db.close();
