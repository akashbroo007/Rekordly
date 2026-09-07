#!/usr/bin/env node

/**
 * Fix database schema - Add missing columns to existing tables
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'database.sqlite');

async function fixDatabase() {
  console.log('🔧 Fixing database schema...\n');
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err);
        reject(err);
        return;
      }
      
      console.log('✅ Database connected:', DB_PATH);
      
      db.serialize(() => {
        // Check if favourites table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='favourites'", (err, row) => {
          if (err) {
            console.error('❌ Error checking table:', err);
            reject(err);
            return;
          }
          
          if (!row) {
            console.log('ℹ️  Favourites table does not exist. Run setup.js first.');
            db.close();
            resolve();
            return;
          }
          
          // Get current table schema
          db.all("PRAGMA table_info(favourites)", (err, columns) => {
            if (err) {
              console.error('❌ Error getting table info:', err);
              reject(err);
              return;
            }
            
            const columnNames = columns.map(col => col.name);
            console.log('Current columns:', columnNames.join(', '));
            
            const alterations = [];
            
            // Check and add missing columns
            if (!columnNames.includes('last_seen')) {
              alterations.push({
                sql: 'ALTER TABLE favourites ADD COLUMN last_seen DATETIME',
                desc: 'Adding last_seen column'
              });
            }
            
            if (!columnNames.includes('alert_enabled')) {
              alterations.push({
                sql: 'ALTER TABLE favourites ADD COLUMN alert_enabled INTEGER DEFAULT 0',
                desc: 'Adding alert_enabled column'
              });
            }
            
            if (!columnNames.includes('notes')) {
              alterations.push({
                sql: 'ALTER TABLE favourites ADD COLUMN notes TEXT',
                desc: 'Adding notes column'
              });
            }
            
            if (!columnNames.includes('last_checked')) {
              alterations.push({
                sql: 'ALTER TABLE favourites ADD COLUMN last_checked DATETIME',
                desc: 'Adding last_checked column'
              });
            }
            
            if (alterations.length === 0) {
              console.log('✅ All columns already exist. No changes needed.');
              db.close();
              resolve();
              return;
            }
            
            console.log(`\n📝 Applying ${alterations.length} schema update(s)...\n`);
            
            // Execute alterations sequentially
            let index = 0;
            function runNext() {
              if (index >= alterations.length) {
                console.log('\n✅ Database schema fixed successfully!');
                db.close();
                resolve();
                return;
              }
              
              const alteration = alterations[index];
              console.log(`   ${index + 1}. ${alteration.desc}...`);
              
              db.run(alteration.sql, (err) => {
                if (err) {
                  console.error(`   ❌ Failed: ${err.message}`);
                  // Continue with next alteration even if one fails
                } else {
                  console.log(`   ✅ Success`);
                }
                index++;
                runNext();
              });
            }
            
            runNext();
          });
        });
      });
    });
  });
}

async function main() {
  try {
    await fixDatabase();
    console.log('\n🎉 Done!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();

