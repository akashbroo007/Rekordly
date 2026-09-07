#!/usr/bin/env node

/**
 * Cleanup script for development
 * - Removes old recordings
 * - Cleans up temp files
 * - Optionally resets database
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function deleteDirectory(dirPath, displayName) {
  if (!fs.existsSync(dirPath)) {
    console.log(`   ℹ ${displayName} not found, skipping...`);
    return;
  }

  const answer = await question(`   Delete all files in ${displayName}? (y/N): `);
  
  if (answer.toLowerCase() === 'y') {
    const files = fs.readdirSync(dirPath);
    let deleted = 0;
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    });
    
    console.log(`   ✓ Deleted ${deleted} files from ${displayName}`);
  } else {
    console.log(`   ✗ Skipped ${displayName}`);
  }
}

async function main() {
  console.log('🧹 Cam Recorder Cleanup Tool\n');
  console.log('This will help you clean up old files and data.\n');

  // Clean uploads
  await deleteDirectory(
    path.join(__dirname, '..', 'uploads'),
    'uploads/'
  );

  // Clean logs
  await deleteDirectory(
    path.join(__dirname, '..', 'logs'),
    'logs/'
  );

  // Reset database
  const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
  if (fs.existsSync(dbPath)) {
    const answer = await question('\n   Reset database (delete all favourites/recordings)? (y/N): ');
    
    if (answer.toLowerCase() === 'y') {
      fs.unlinkSync(dbPath);
      console.log('   ✓ Database deleted');
      console.log('   Run "npm run setup" to reinitialize');
    } else {
      console.log('   ✗ Database kept');
    }
  }

  console.log('\n✅ Cleanup complete!\n');
  rl.close();
  process.exit(0);
}

main();
