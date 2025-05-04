const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const dbFilePath = path.join(process.env.USER_DATA_PATH, 'ddinfo.db');

(async () => {

  async function connectDb() {
    try {
      return await open({
        filename: dbFilePath,
        driver: sqlite3.Database
      });
    } catch (error) {
      console.error('无法连接到数据库:', error);
      return null;
    }
  }

  const configService = express.Router();

  configService.get('/getConfig', async (req, res) => {
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }
      let configInfo = await db.get(`SELECT * FROM output_config`);
      res.json(configInfo);
    } catch (error) {
      console.log(error)
      return res.json({ error: -2 });
    } finally {
      await db.close()
    }
  });

  configService.post('/saveConfig', async (req, res) => {
    const { outputDir } = req.query;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }
      await db.run(`DELETE FROM output_config`);
      await db.run(
        `INSERT INTO output_config (output_dir) VALUES (?)`,
        [outputDir]
      );
      res.json({ message: '保存成功' });
    } catch (error) {
      console.log(error)
      return res.json({ error: -2 });
    } finally {
      await db.close()
    }
  });

  module.exports = configService;
})();