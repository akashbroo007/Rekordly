const Database = require('better-sqlite3');
const db = new Database('C:/Users/Akash/AppData/Roaming/@rekordly/desktop/Rekordly.db', { readonly: true });
const jobs = db.prepare('select id, status, error, file_path, thumbnail_path, created_at from recording_jobs order by created_at desc limit 3').all();
console.log('JOBS:', JSON.stringify(jobs, null, 1));
const recs = db.prepare('select id, job_id, status, title, file_path, thumbnail_path, created_at from recordings order by created_at desc limit 5').all();
console.log('RECORDINGS:', JSON.stringify(recs, null, 1));