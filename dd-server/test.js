const { PDFDocument, PDFName } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
let dbFilePath = path.join(__dirname, './ddinfo.db');

(async () => {
    async function connectDb() {
        try {
            return open({
                filename: dbFilePath,
                driver: sqlite3.Database
            });
        } catch (error) {
            console.error('无法连接到数据库:', error);
            return null;
        }
    }

    const db = await connectDb();

    const bookInfos = await db.all(
        `select * from download_his where author is not null`
    );
    db.close();

    for (const bookInfo of bookInfos) {
        const { book_id, book_title, category } = bookInfo;

        let reTitle = book_title.replace(/\//g, '_');
        reTitle = reTitle.replace(/\\/g, '_');
        reTitle = reTitle.replace(/\:/g, '_');
        reTitle = reTitle.replace(/\*/g, '_');
        reTitle = reTitle.replace(/\?/g, '_');
        reTitle = reTitle.replace(/\"/g, '_');
        reTitle = reTitle.replace(/\n/g, '');
        let fileDir = path.join(`D:\\电子书\\EBook\\${category}`, `./${reTitle}.pdf`);
        const isExist = fs.existsSync(fileDir);
        if (!isExist) {
            fileDir = path.join(`${__dirname}\\output\\${category}`, `./${reTitle}.pdf`);
            if (!fs.existsSync(fileDir)) {
                fileDir = path.join(`${__dirname}\\output`, `./${reTitle}.pdf`);
                if (!fs.existsSync(fileDir)) {
                    console.log(book_id)
                }
            }
        }
    }
})();
