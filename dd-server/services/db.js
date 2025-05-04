const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const dbFilePath = path.join(process.env.USER_DATA_PATH, 'ddinfo.db');

const initialTables = async function () {
  
  const db = await open({
    filename: dbFilePath,
    driver: sqlite3.Database
  })
  console.log('Database ddinfo initialized.');

  const tables = [
    {
      name: 'login_info',
      createSql: `
            CREATE TABLE IF NOT EXISTS login_info (
              oauthToken TEXT,
              csrfToken TEXT,
              qrCodeString TEXT,
              qrCode TEXT,
              cookies TEXT
            )
          `
    },
    
    {
      name: 'output_config',
      createSql: `
            CREATE TABLE IF NOT EXISTS output_config (
              output_dir TEXT
            )
          `
    }
  ];
  for (var i = 0; i < tables.length; i++) {
    const results = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tables[i].name}'`)
    if (results && results.name === tables[i].name) {
    } else {
      await db.run(tables[i].createSql)
      console.log(`Table ${tables[i].name} Created`)
    }
  }

  await db.run('VACUUM')
  console.log(`Database vacuumed.`)
}

module.exports = {
  initialTables: initialTables
};