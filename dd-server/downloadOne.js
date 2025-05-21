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

  const enid = "DLnMGAEG7gKLyYmkAbPaEXxD8BM4J0LZVMN3ROrpdZn19VNzv2o5e6lqjQQ1poxq";
  try {
    await downloadEbook(enid);
  } catch (error) {
    console.error(error);
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
            "height": 20000,
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
        const newIndex = index + count;
        // const newCount = count + 2;
        const nextSvgContents = await getEbookPages(chapterId, count, newIndex, offset, readToken, csrfToken, cookies)
        svgContents = svgContents.concat(nextSvgContents)
        return svgContents;
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        console.log('令牌已过期，请重新登录');
      }
      console.error(error)
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
    const count = 2;
    const offset = 0;
    let svgContents = [];
    console.log(`⏳️ start download: [${category}]${title}_${author}`)
    // console.time(`download: ${title} - ${author}`)
    const chunks = chunkArray(orders, 5);
    for (const chunk of chunks) {
      const promises = chunk.map(async (order, i) => {
        const orderIndex = orders.indexOf(order);
        const pageSvgContents = await getEbookPages(
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