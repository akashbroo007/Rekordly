#!/usr/bin/env node

/**
 * Migration script to move data from old structure to new database
 */

const fs = require('fs');
const path = require('path');
const { initDatabase } = require('../config/database');
const { addFavourite } = require('../src/services/databaseService');

async function migrateFavourites() {
  const oldFavouritesPath = path.join(__dirname, '..', 'status-checker', 'favourites.json');
  
  if (!fs.existsSync(oldFavouritesPath)) {
    console.log('No old favourites file found. Skipping migration.');
    return;
  }

  console.log('📦 Migrating favourites from JSON to database...');
  
  try {
    const data = fs.readFileSync(oldFavouritesPath, 'utf8');
    const favourites = JSON.parse(data);
    
    let migrated = 0;
    let skipped = 0;
    
    for (const fav of favourites) {
      try {
        await addFavourite(fav.username, fav.platform);
        migrated++;
        console.log(`   ✓ Migrated: ${fav.platform}/${fav.username}`);
      } catch (error) {
        if (error.message === 'Model already in favourites') {
          skipped++;
        } else {
          console.error(`   ✗ Failed to migrate ${fav.username}:`, error.message);
        }
      }
    }
    
    console.log(`\n✅ Migration complete!`);
    console.log(`   ${migrated} favourites migrated`);
    console.log(`   ${skipped} already existed (skipped)\n`);
    
    // Backup old file
    const backupPath = oldFavouritesPath + '.backup';
    fs.copyFileSync(oldFavouritesPath, backupPath);
    console.log(`📄 Old favourites backed up to: ${backupPath}\n`);
    
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

async function main() {
  console.log('🔄 Starting migration...\n');
  
  // Initialize database first
  await initDatabase();
  
  // Migrate favourites
  await migrateFavourites();
  
  console.log('✅ All migrations complete!\n');
  process.exit(0);
}

main();
