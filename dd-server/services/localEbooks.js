const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const path = require('path');
const { open } = require('sqlite');

let dbFilePath = "";
if (process.env.USER_DATA_PATH) {
    dbFilePath = path.join(process.env.USER_DATA_PATH, 'ddinfo.db');
} else {
    dbFilePath = path.join(__dirname, '../ddinfo.db');
}

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

    const localEbooks = express.Router();

    localEbooks.get('/getLocalBooks', async (req, res) => {
        const { pageSize, currentPage, keyword, categories } = req.query;
        let categoryList = [];
        if (categories) {
            categoryList = categories.split(",")
            categoryList = categoryList.map(item => `'${item}'`);
        }
        const db = await connectDb();
        try {
            if (!db) {
                res.status(500).send({ message: '无法连接到数据库' });
            }

            const totalCount = await db.get(`SELECT COUNT(*) as total FROM download_his where 1 = 1 ${keyword ? `and book_title like '%${keyword}%'` : ''} ${categoryList.length > 0 ? `and category in (${categoryList.join(',')})` : ''}`);

            let results = await db.all(`SELECT * FROM download_his where 1 = 1 ${keyword ? `and book_title like '%${keyword}%'` : ''} ${categoryList.length > 0 ? `and category in (${categoryList.join(',')})` : ''} limit ${pageSize} offset ${(currentPage - 1) * pageSize}`);

            return res.json({ datas: results, totalCount: totalCount.total });
        } catch (error) {
            console.log(error)
            return res.json({ error: error });
        } finally {
            await db.close()
        }
    });

    localEbooks.get('/getCategories', async (req, res) => {
        const db = await connectDb();
        try {
            if (!db) {
                res.status(500).send({ message: '无法连接到数据库' });
            }

            let results = await db.all(`SELECT category FROM download_his group by category order by category`);

            return res.json({ datas: results });
        } catch (error) {
            console.log(error)
            return res.json({ error: error });
        } finally {
            await db.close()
        }
    });

    module.exports = localEbooks;
})();