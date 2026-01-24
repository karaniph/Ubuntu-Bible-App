const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'assets/bible.db'), { readonly: true });
console.table(db.prepare('SELECT * FROM translations').all());
