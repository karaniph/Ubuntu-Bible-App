const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'assets/bible.db');
const db = new Database(dbPath, { readonly: true });

const translations = db.prepare('SELECT * FROM translations').all();
console.log('Translations:', translations);

const books = db.prepare('SELECT count(*) as count FROM books').get();
console.log('Book count:', books.count);

db.close();
