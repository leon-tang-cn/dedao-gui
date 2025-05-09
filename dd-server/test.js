const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
let dbFilePath = path.join(__dirname, './ddinfo.db');
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const secChUa = "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'";

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

    let result = await db.get(`SELECT * FROM login_info`);
    if (!result || !result.csrfToken) {
      console.log('未登录，请先登录');
      return;
    }

    const bookInfos = await db.all(
        `select * from download_his where author is null and uploaded = 0`
    );

    for (const bookInfo of bookInfos) {
        const { book_id, book_title, category } = bookInfo;


        const bookDetailRes = await axios(`https://www.dedao.cn/pc/ebook2/v1/pc/detail?id=${book_id}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                "xi-csrf-token": result.csrfToken,
                'Cookie': result.cookies,
                "User-Agent": userAgent,
                "sec-ch-ua": secChUa,
                "sec-ch-ua-mobile": "?0"
            }
        })

        // console.log(bookDetailRes.data.c)
        const bookDetail = bookDetailRes.data.c;
        await db.run(
          `update download_his set author = '${bookDetail.book_author}', title='${bookDetail.operating_title}', introduction='${bookDetail.book_intro}', category = '${bookDetail.classify_name}', uploaded = 1 where book_id = '${book_id}'`
        );
    }
    db.close();
})();
