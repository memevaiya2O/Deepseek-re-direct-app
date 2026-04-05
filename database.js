const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection failed:", err.message);
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY,
        email TEXT,
        password TEXT,
        session_token TEXT
    )`);
});

module.exports = db;
