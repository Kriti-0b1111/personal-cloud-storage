CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  s3_key TEXT NOT NULL UNIQUE,
  mimetype TEXT,
  size INTEGER,
  upload_date TEXT NOT NULL DEFAULT (datetime('now'))
);
