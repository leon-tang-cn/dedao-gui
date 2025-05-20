const axios = require('axios');
const sqlite3 = require('sqlite3');
const path = require('path');
const { open } = require('sqlite');
const { createDecipheriv } = require('node:crypto');
const { Buffer } = require('node:buffer');
const zlib = require('node:zlib');
const util = require('node:util');
const { Svg2Html } = require('./services/svg2html');
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
  const baseUrl = "https://www.dedao.cn/";

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

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const ebookListRes = await getBookList(1, currentPage);
  total = ebookListRes.c.total;
  const steps = Math.ceil(total / pageSize) - 1;
  for (let i = 0; i <= steps; i++) {
    const pageRes = await getBookList(pageSize, i);
    const currentList = pageRes.c?.product_list || [];
    for (let j = 0; j < currentList.length; j++) {
      if (currentList[j].is_vip_book != "1") {
        console.log(`skip vip book: ${currentList[j].name}`)
        continue;
      }
      const bookInfo = await checkDownloaded(currentList[j].id_out);
      if (bookInfo) {
        db = await connectDb();
        if (!bookInfo.category || bookInfo.category === '') {
          const bookDetailRes = await axios(`${baseUrl}pc/ebook2/v1/pc/detail?id=${currentList[j].id_out}`, {
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
        if (!bookInfo.author || bookInfo.author === '') {
          await db.run(`update download_his set author = ?, title = ?, introduction= ?  where book_id = ?`, [currentList[j].lecturer_name, currentList[j].name, currentList[j].introduction, currentList[j].id_out]);
          await db.close();
        }
        if (bookInfo.uploaded == 1) {
          continue;
        }
      }
      try {
        console.log(`current progress：page(${i}), book#${j + 1}`);
        if (j == 0 && i > 0) {
          await delay(30000);
        }
        let { category, outputFileName } = await downloadEbook(currentList[j].id_out);
        if (!bookInfo) {
          db = await connectDb();
          await db.run(
            `INSERT INTO download_his (book_id, book_title, author, title, introduction, category) VALUES (?, ?, ?, ?, ?, ?)`,
            [currentList[j].id_out, outputFileName, currentList[j].lecturer_name, currentList[j].name, currentList[j].introduction, category]
          );
          await db.close();
        }
      } catch (error) {
        console.error(error);
      }
    }
    console.log(`current progress：page(${i})`);
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
    const ebookListRes = await axios(`${baseUrl}pc/label/v2/algo/pc/product/list`, {
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

  async function getEbookPageData(chapterId, count, index, offset, readToken, csrfToken, cookies) {
    try {
      let svgContents = []
      const ebookPages = await axios(`${baseUrl}ebk_web_go/v2/get_pages`, {
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

      let pageSvgList = ebookPages.data?.c?.pages || [];

      for (let i = 0; i < pageSvgList.length; i++) {
        svgContents.push(pageSvgList[i].svg);
      }

      if (ebookPages.data.c.is_end) {
        return svgContents;
      } else {
        const newIndex = count;
        const newCount = count + 20;
        const nextSvgContents = await getEbookPageData(chapterId, newCount, newIndex, offset, readToken, csrfToken, cookies)
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

  async function decompressString(compressedStr) {
    const inflate = util.promisify(zlib.inflate);
    try {
        const buffer = Buffer.from(compressedStr, 'base64');
        const decompressed = await inflate(buffer);
        return decompressed.toString();
    } catch (err) {
        console.error('解压失败:', err);
    }
}

  async function getEbookPages(enid, bookTitle, chapterId, count, index, offset, readToken, csrfToken, cookies) {
    try {
      const db = await connectDb();
      let pageSvgList = await getEbookPageData(chapterId, count, index, offset, readToken, csrfToken, cookies);
      // let saveData = false;
      // const exists = await db.get(`SELECT count(*) as count FROM book_info WHERE enid = ? AND chapter_id = ?;`, [enid, chapterId]);
      // if (exists.count > 0) {
      //   const dbDatas = await db.all(`SELECT contents FROM book_info WHERE enid =? AND chapter_id =?;`, [enid, chapterId]);
      //   pageSvgList = dbDatas.map((item) => item.contents);
      // } else {
      //   saveData = true;
      //   pageSvgList = await getEbookPageData(chapterId, count, index, offset, readToken, csrfToken, cookies)
      // }

      let svgContents = [];
      for (let i = 0; i < pageSvgList.length; i++) {
        const svgContent = decryptAes(pageSvgList[i])
        // if (saveData) {
        //   await db.run(`INSERT INTO book_info (contents, enid, book_title, chapter_id) VALUES(?, ?, ?, ?);`,
        //     [svgContent, enid, bookTitle, chapterId]);
        // }
        svgContents.push(svgContent);
      }
      await db.close();
      return svgContents;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        console.log('令牌已过期，请重新登录');
      }
      return []
    }
  }

  function chunkArray(arr, chunkSize) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async function downloadEbook(enid) {
    const readTokenRes = await axios(`${baseUrl}api/pc/ebook2/v1/pc/read/token?id=${enid}`, {
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

    const bookDetailRes = await axios(`${baseUrl}pc/ebook2/v1/pc/detail?id=${enid}`, {
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
    let category = bookDetailRes.data.c.classify_name;
    if (!category || category === '') {
      category = '未分类'
    }

    const bookDetailInfoRes = await axios(`${baseUrl}ebk_web/v1/get_book_info?token=${readToken}`, {
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
    console.log(`⏳️ start download: [${category}]${title}_${author}`)
    // console.time(`download: ${title} - ${author}`)
    const chunks = chunkArray(orders, 5);
    for (const chunk of chunks) {
      const promises = chunk.map(async (order, i) => {
        const orderIndex = orders.indexOf(order);
        const pageSvgContents = await getEbookPages(
          enid,
          `${category}]${title}`,
          order.chapterId,
          count,
          index,
          offset,
          readToken,
          result.csrfToken,
          result.cookies
        );

        svgContents.push({
          Contents: pageSvgContents,
          ChapterID: order.chapterId,
          PathInEpub: order.PathInEpub,
          OrderIndex: orderIndex,
        });
      });

      await Promise.all(promises);
    }
    // console.timeEnd(`download: ${title} - ${author}`)
    svgContents = svgContents.sort((a, b) => {
      return a.OrderIndex - b.OrderIndex;
    })

    const outputFileName = `${bookId}_${title}_${author}`;
    let reTitle = outputFileName.replace(/\//g, '_');
    reTitle = reTitle.replace(/\\/g, '_');
    reTitle = reTitle.replace(/\:/g, '_');
    reTitle = reTitle.replace(/\*/g, '_');
    reTitle = reTitle.replace(/\?/g, '_');
    reTitle = reTitle.replace(/\"/g, '_');
    reTitle = reTitle.replace(/\n/g, '');

    console.log(`⏳️ generate PDF: [${category}]${outputFileName}`)
    let outputDir = `${__dirname}/output/${category}`;
    let outputHtml = `${__dirname}/output_html/${category}`;
    // console.time(`PDF created in ${outputFileName}`)
    Svg2Html(outputHtml, reTitle, svgContents, toc);
    Svg2Pdf(outputDir, reTitle, title, svgContents, toc, enid, true);
    return { category, outputFileName };
  }
})();