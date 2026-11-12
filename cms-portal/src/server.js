'use strict';

const config = require('./config/env');
const { createDatabase, closeDb } = require('./db/database');
const { createCmsApp } = require('./app');

function startServer() {
  const db = createDatabase(config.dbPath);
  const app = createCmsApp({ db });

  const server = app.listen(config.port, config.host, () => {
    console.log('====================================================================');
    console.log(' WAYANAD DISTRICT POLICE CO-OPERATIVE SOCIETY LTD. NO. W 208');
    console.log(' Website Administration Portal & CMS Server');
    console.log(` Listening at   : http://${config.host}:${config.port}`);
    console.log(` Login URL      : http://${config.host}:${config.port}/login.html`);
    console.log(` Public API     : http://${config.host}:${config.port}/api/public/site-data`);
    console.log(` Database File  : ${config.dbPath}`);
    console.log('====================================================================');
  });

  const shutdown = () => {
    console.log('\n[CMS SERVER] Shutting down gracefully...');
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };

