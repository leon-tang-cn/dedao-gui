const axios = require('axios');
const sqlite3 = require('sqlite3');
const path = require('path');
const { open } = require('sqlite');
const { createDecipheriv } = require('node:crypto');
const { Buffer } = require('node:buffer');
const { Svg2Pdf } = require('./services/svg2pdf');
let dbFilePath = path.join(__dirname, './ddinfo.db');
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const secChUa = "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'";
process.stdout.setEncoding('utf8');

(async () => {
  const CipherKey = "3e4r06tjkpjcevlbslr3d96gdb5ahbmo"
  const AesIv = "6fd89a1b3a7f48fb"
  let result = null;
  let configInfo = null;

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

  const pageSize = 100;
  const currentPage = 0;
  const sortStrategy = "NEW"; // HOT, NEW
  const labelId = "X9vmWzAl54WYrJ78ayq1VjKbDeZRxzpvnpXEBOlvko9L026gdm3AnGNMDkG1x8JR";
  const navigationId = "X9vmWzAl54WYrJ78ayq1VjKbDeZRxzpvnpXEBOlvko9L026gdm3AnGNMDkG1x8JR";
  let total = 0;
  let db = await connectDb();
  try {
    if (!db) {
      console.log('无法连接到数据库');
      return;
    }

    result = await db.get(`SELECT * FROM login_info`);
    if (!result || !result.csrfToken) {
      console.log('未登录，请先登录');
      return;
    }

    configInfo = await db.get(`SELECT * FROM output_config`);
  } catch (error) {
    console.error(error);
  } finally {
    await db.close();
  }

  const ebookListRes = await getBookList(1, currentPage);
  total = ebookListRes.c.total;
  const steps = Math.ceil(total / pageSize) - 1;
  for (let i = 0; i <= steps; i++) {
    const pageRes = await getBookList(pageSize, i);
    const currentList = pageRes.c?.product_list || [];
    for (let j = 0; j < currentList.length; j++) {
      console.log(`current progress：page(${i}), book#${j + 1}`);
      const bookInfo = await checkDownloaded(currentList[j].id_out);
      if (bookInfo) {
        db = await connectDb();
        console.log(`current progress：page(${i}), book#${j + 1}, exist`);
        if (!bookInfo.category || bookInfo.category === '') {
          const bookDetailRes = await axios(`https://www.dedao.cn/pc/ebook2/v1/pc/detail?id=${currentList[j].id_out}`, {
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
          await db.run(`update download_his set category = ? where book_id = ?`, [bookDetailRes.data.c.classify_name, currentList[j].id_out]);
        }
        await db.run(`update download_his set author = ?, title = ?, introduction= ?  where book_id = ?`, [currentList[j].lecturer_name, currentList[j].name, currentList[j].introduction, currentList[j].id_out]);
        await db.close();
        continue;
      }
      try {
        let { category, outputFileName } = await downloadEbook(currentList[j].id_out);
        db = await connectDb();
        await db.run(
          `INSERT INTO download_his (book_id, book_title, author, title, introduction, category) VALUES (?, ?, ?, ?, ?, ?)`,
          [currentList[j].id_out, outputFileName, currentList[j].lecturer_name, currentList[j].name, currentList[j].introduction, category]
        );
        await db.close();
      } catch (error) {
        console.error(error);
      }
    }
  }

  async function checkDownloaded(bookId) {
    const db = await connectDb();
    const bookInfo = await db.get(
      `select * from download_his where book_id = '${bookId}'`
    );
    await db.close();
    if (bookInfo && bookInfo.book_title) {
      return bookInfo;
    } else {
      return false;
    }
  }

  async function getBookList(ps, cp) {
    const ebookListRes = await axios('https://www.dedao.cn/pc/label/v2/algo/pc/product/list', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        "xi-csrf-token": result.csrfToken,
        'Cookie': `${result.cookies};token=${result.csrfToken}`,
        "User-Agent": userAgent,
        "sec-ch-ua": secChUa,
        "sec-ch-ua-mobile": "?0"
      },
      data: {
        "classfc_name": "全部分类",
        "label_id": labelId,
        "nav_type": 0,
        "navigation_id": navigationId,
        "page": Number(cp),
        "page_size": Number(ps),
        "product_types": "2",
        "request_id": "",
        "sort_strategy": sortStrategy || "HOT", // HOT, NEW
        "tags_ids": []
      }
    })
    return ebookListRes.data;
  }

  function decryptAes(contents) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(CipherKey);
    const iv = Buffer.from(AesIv);
    const decipher = createDecipheriv(algorithm, key, iv);
    const ciphertext = Buffer.from(contents, 'base64');

    let decrypted = decipher.update(ciphertext, 'binary', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted
  }

  async function getEbookPages(chapterId, count, index, offset, readToken, csrfToken, cookies) {

    try {
      let svgContents = []
      const ebookPages = await axios('https://www.dedao.cn/ebk_web_go/v2/get_pages', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": csrfToken,
          'Cookie': cookies,
          "User-Agent": userAgent,
          "sec-ch-ua": secChUa,
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "chapter_id": chapterId,
          "config": {
            "density": 1,
            "direction": 0,
            "font_name": "yahei",
            "font_scale": 1,
            "font_size": 16,
            "height": 200000,
            "line_height": "2em",
            "margin_bottom": 60,
            "margin_left": 30,
            "margin_right": 30,
            "margin_top": 60,
            "paragraph_space": "1em",
            "platform": 1,
            "width": 60000
          },
          "count": count,
          "index": index,
          "offset": offset,
          "orientation": 0,
          "token": readToken
        }
      })

      for (let i = 0; i < ebookPages.data.c.pages.length; i++) {
        const svContent = decryptAes(ebookPages.data.c.pages[i].svg)
        svgContents.push(svContent);
      }
      if (ebookPages.data.c.is_end) {
        return svgContents;
      } else {
        const newIndex = count;
        const newCount = count + 20;
        const nextSvgContents = await getEbookPages(chapterId, newCount, newIndex, offset, readToken, csrfToken, cookies)
        svgContents = svgContents.concat(nextSvgContents)
        return svgContents;
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        console.log('令牌已过期，请重新登录');
      }
      return []
    }
  }

  async function downloadEbook(enid) {
    const readTokenRes = await axios(`https://www.dedao.cn/api/pc/ebook2/v1/pc/read/token?id=${enid}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        "xi-csrf-token": result.csrfToken,
        'Cookie': result.cookies,
        "User-Agent": userAgent,
        "sec-ch-ua": secChUa,
        "sec-ch-ua-mobile": "?0"
      }
    })
    const readToken = readTokenRes.data.c.token;

    const bookDetailRes = await axios(`https://www.dedao.cn/pc/ebook2/v1/pc/detail?id=${enid}`, {
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
    const bookId = bookDetailRes.data.c.id;
    const author = bookDetailRes.data.c.book_author;
    const title = bookDetailRes.data.c.operating_title
    const category = bookDetailRes.data.c.classify_name;

    const bookDetailInfoRes = await axios(`https://www.dedao.cn/ebk_web/v1/get_book_info?token=${readToken}`, {
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

    const orders = bookDetailInfoRes.data.c.bookInfo.orders;
    const toc = bookDetailInfoRes.data.c.bookInfo.toc;

    const index = 0;
    const count = 6;
    const offset = 0;
    let svgContents = [];
    console.log(`start download: ${title} - ${author}`)
    console.time(`download: ${title} - ${author}`)
    for (var i = 0; i < orders.length; i++) {
      const pageSvgContents = await getEbookPages(orders[i].chapterId, count, index, offset, readToken, result.csrfToken, result.cookies)

      svgContents.push({
        Contents: pageSvgContents,
        ChapterID: orders[i].chapterId,
        PathInEpub: orders[i].PathInEpub,
        OrderIndex: i,
      })
      let currentToc = toc.filter(toc => toc.href.split('#')[0] === orders[i].chapterId)[0];
      if (currentToc && currentToc.text) {
        console.log(`download progress: ${i + 1}/${orders.length} - ${currentToc.text}`)
      }
    }
    console.timeEnd(`download: ${title} - ${author}`)

    const outputFileName = `${bookId}_${title}_${author}`;

    console.log(`generate PDF: [${category}]${outputFileName}`)
    let outputDir = `${__dirname}/output/${category}`;
    Svg2Pdf(outputDir, outputFileName, title, svgContents, toc);
    return { category, outputFileName };
  }
})();