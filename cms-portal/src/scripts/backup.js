'use strict';

const config = require('../config/env');
const { createDatabase, closeDb } = require('../db/database');
const { createSystemBackup } = require('../utils/backupService');

function run() {
  const db = createDatabase(config.dbPath);
  const manifest = createSystemBackup(db, {
    backupDir: config.backupDir,
    uploadDir: config.uploadDir,
    createdBy: 'cli-backup',
    note: 'Manual CLI snapshot'
  });
  console.log('[CMS BACKUP] Snapshot created successfully:');
  console.log(`  Backup ID      : ${manifest.backupId}`);
  console.log(`  SQLite Size    : ${manifest.dbSizeBytes} bytes`);
  console.log(`  JSON Export    : ${manifest.jsonSizeBytes} bytes`);
  console.log(`  Uploaded Media : ${manifest.uploadedFilesCount} files`);
  closeDb();
}

run();

