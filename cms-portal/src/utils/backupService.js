'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config/env');

function listFilesRecursively(dirPath, baseDir = dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(abs, baseDir));
    } else if (entry.isFile()) {
      const stat = fs.statSync(abs);
      files.push({
        relativePath: path.relative(baseDir, abs).replace(/\\/g, '/'),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  }
  return files;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let copied = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      copied += 1;
    }
  }
  return copied;
}

function createSystemBackup(db, { backupDir = config.backupDir, uploadDir = config.uploadDir, createdBy = 'system', note = '' } = {}) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `wdpcs-backup-${stamp}`;
  const snapshotDir = path.join(backupDir, backupId);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const dbSnapshotFile = path.join(snapshotDir, 'wdpcs_cms.sqlite');
  const escapedSqlPath = dbSnapshotFile.replace(/'/g, "''");
  try {
    db.exec(`VACUUM INTO '${escapedSqlPath}';`);
  } catch {
    // Fallback checkpoint copy if VACUUM INTO is unavailable
    fs.copyFileSync(config.dbPath, dbSnapshotFile);
  }

  const uploadsDest = path.join(snapshotDir, 'uploads');
  const uploadedFilesCount = copyDirRecursive(uploadDir, uploadsDest);

  // Also export structured portable JSON snapshot of all core CMS tables
  const exportTables = [
    'roles', 'website_content', 'deposit_products', 'loan_products',
    'interest_rate_history', 'notices', 'gallery_images', 'documents',
    'document_versions', 'faqs', 'santhwanam_content', 'content_revisions',
    'audit_logs', 'system_settings'
  ];
  const jsonDump = {};
  const rowCounts = {};
  for (const tbl of exportTables) {
    const rows = db.prepare(`SELECT * FROM ${tbl}`).all();
    jsonDump[tbl] = rows;
    rowCounts[tbl] = rows.length;
  }

  const jsonSnapshotFile = path.join(snapshotDir, 'cms-export.json');
  fs.writeFileSync(jsonSnapshotFile, JSON.stringify({
    backupId,
    createdAt: new Date().toISOString(),
    createdBy,
    note,
    rowCounts,
    data: jsonDump
  }, null, 2));

  const manifest = {
    backupId,
    createdAt: new Date().toISOString(),
    createdBy,
    note,
    dbSizeBytes: fs.statSync(dbSnapshotFile).size,
    jsonSizeBytes: fs.statSync(jsonSnapshotFile).size,
    uploadedFilesCount,
    uploadedFiles: listFilesRecursively(uploadsDest),
    rowCounts
  };
  fs.writeFileSync(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

function listBackups(backupDir = config.backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  const entries = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('wdpcs-backup-'));

  const manifests = [];
  for (const entry of entries) {
    const manifestPath = path.join(backupDir, entry.name, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        manifests.push(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      } catch {
        // skip corrupted manifest
      }
    }
  }
  return manifests.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function resolveBackupFile(backupId, filename, backupDir = config.backupDir) {
  if (!/^wdpcs-backup-[A-Za-z0-9-]+$/.test(String(backupId || ''))) return null;
  const allowedFiles = new Set(['cms-export.json', 'wdpcs_cms.sqlite', 'manifest.json']);
  if (!allowedFiles.has(filename)) return null;
  const target = path.resolve(backupDir, backupId, filename);
  if (!target.startsWith(path.resolve(backupDir) + path.sep)) return null;
  return fs.existsSync(target) ? target : null;
}

module.exports = {
  createSystemBackup,
  listBackups,
  resolveBackupFile
};

