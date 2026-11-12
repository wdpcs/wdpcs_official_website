'use strict';

const crypto = require('node:crypto');
const config = require('../config/env');
const { createDatabase, closeDb } = require('../db/database');
const { seedBaseData } = require('../db/initialSeed');

function run() {
  const db = createDatabase(config.dbPath);
  let generatedPassword = null;
  let adminPassword = config.initAdmin.password;

  const existingUsers = db.prepare(`SELECT COUNT(*) AS cnt FROM admin_users`).get().cnt;
  if (existingUsers === 0 && !adminPassword) {
    generatedPassword = `Wdpcs#${crypto.randomBytes(6).toString('base64url')}!9`;
    adminPassword = generatedPassword;
  }

  const created = seedBaseData(db, {
    createSuperAdmin: true,
    adminPassword
  });

  console.log('[CMS SEED] Database schema and base society records synchronized:', config.dbPath);
  if (created) {
    console.log(`[CMS SEED] Created initial Super Administrator account:`);
    console.log(`  Username : ${created.username}`);
    console.log(`  Email    : ${created.email}`);
    if (generatedPassword) {
      console.log(`  One-Time Password (SAVE NOW — NOT STORED IN CODE): ${generatedPassword}`);
    } else {
      console.log(`  Password : (Configured from ADMIN_INIT_PASSWORD env var)`);
    }
  } else {
    console.log(`[CMS SEED] Existing admin user(s) detected (${existingUsers}); skipped creating bootstrap admin.`);
  }
  closeDb();
}

run();

