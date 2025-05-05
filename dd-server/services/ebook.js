const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const path = require('path');
const { open } = require('sqlite');
const { createDecipheriv } = require('node:crypto');
const { Buffer } = require('node:buffer');
const { Svg2Html } = require('./svg2html');
const { Svg2Pdf } = require('./svg2pdf');
const { Svg2Epub } = require('./svg2epub');
let dbFilePath = "";
if (process.env.USER_DATA_PATH) {
  dbFilePath = path.join(process.env.USER_DATA_PATH, 'ddinfo.db');
} else {
  dbFilePath = path.join(__dirname, '../ddinfo.db');
}

(async () => {
  var CipherKey = "3e4r06tjkpjcevlbslr3d96gdb5ahbmo" //"3e4r06tjkpjcevlbslr3d96gdb5ahbmo"
  var AesIv = "6fd89a1b3a7f48fb" //"6fd89a1b3a7f48fb"

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

  const ebookService = express.Router();
  // https://www.dedao.cn/pc/label/v2/algo/pc/filter/list
  ebookService.get('/getEbookCategory', async (req, res) => {
    // const { pageSize, currentPage, sortStrategy } = req.query;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      const ebookListRes = await axios('https://www.dedao.cn/pc/label/v2/algo/pc/filter/list', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': `${result.cookies};token=${result.csrfToken}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "classfc_name": "全部分类",
          "label_id": "X9vmWzAl54WYrJ78ayq1VjKbDeZRxzpvnpXEBOlvko9L026gdm3AnGNMDkG1x8JR",
          "nav_type": 0,
          "navigation_id": "X9vmWzAl54WYrJ78ayq1VjKbDeZRxzpvnpXEBOlvko9L026gdm3AnGNMDkG1x8JR",
          "page": 1,
          "page_size": 1,
          "product_types": "2",
          "request_id": "",
          "sort_strategy": "HOT", // HOT, NEW
          "tags_ids": []
        }
      })
      return res.json(ebookListRes.data);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: error.status, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  ebookService.get('/getEbooks', async (req, res) => {
    const { pageSize, currentPage, sortStrategy, labelId, navigationId } = req.query;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      const ebookListRes = await axios('https://www.dedao.cn/pc/label/v2/algo/pc/product/list', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': `${result.cookies};token=${result.csrfToken}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "classfc_name": "全部分类",
          "label_id": labelId,
          "nav_type": 0,
          "navigation_id": navigationId,
          "page": Number(currentPage),
          "page_size": Number(pageSize),
          "product_types": "2",
          "request_id": "",
          "sort_strategy": sortStrategy || "HOT", // HOT, NEW
          "tags_ids": []
        }
      })
      return res.json(ebookListRes.data);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  ebookService.get('/searchEbook', async (req, res) => {
    const { pageSize, currentPage, requestId, keyword } = req.query;
    if (!keyword || keyword === '') {
      return res.json({ c: { data: { moduleList: [] } } });
    }
    let searchRequestId = requestId;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ data: { status: 0 } });
      }
      if (!searchRequestId || searchRequestId === '') {
        const searchAllRes = await axios('https://www.dedao.cn/api/search/pc/tophits', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            "xi-csrf-token": result.csrfToken,
            'Cookie': `${result.cookies};token=${result.csrfToken}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
            "sec-ch-ua-mobile": "?0"
          },
          data: {
            "content": keyword,
            "is_ebook_vip": 1,
            "page": 1,
            "page_size": 1,
            "request_id": "",
            "tab_type": 0
          }
        })
        searchRequestId = searchAllRes.data.c.data.requestId;
      }

      const ebookSearchRes = await axios('https://www.dedao.cn/api/search/pc/tophits', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': `${result.cookies};token=${result.csrfToken}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "content": keyword,
          "is_ebook_vip": 1,
          "page": Number(currentPage),
          "page_size": Number(pageSize),
          "request_id": searchRequestId,
          "tab_type": 2
        }
      })
      return res.json(ebookSearchRes.data);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    } finally {
      await db.close()
    }
  });


  ebookService.post('/addCart', async (req, res) => {
    const { bookEnids } = req.body;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ data: { status: 0 } });
      }

      await axios('https://www.dedao.cn/api/pc/ebook2/v1/bookshelf/add', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': `${result.cookies};token=${result.csrfToken}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "book_enids": bookEnids
        }
      })
      return res.json({ message: '保存成功' });
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  ebookService.post('/removeCart', async (req, res) => {
    const { bookEnids } = req.body;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ data: { status: 0 } });
      }

      let removeDatas = [];
      for (let i = 0; i < bookEnids.length; i++) {
        removeDatas.push({ "pid": bookEnids[i], "ptype": 2 })
      }

      await axios('https://www.dedao.cn/api/pc/hades/v1/product/pcremove', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': `${result.cookies};token=${result.csrfToken}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "data": removeDatas
        }
      })
      return res.json({ message: '保存成功' });
    } catch (error) {
      console.log(error.status)
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: error.status, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  ebookService.get('/getEbookList', async (req, res) => {
    const { pageSize, currentPage } = req.query;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ data: { status: 0 } });
      }

      const ebookListRes = await axios('https://www.dedao.cn/api/hades/v2/product/list', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': result.cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "category": "ebook",
          "display_group": true,
          "filter": "all",
          "filter_complete": 0,
          "group_id": 0,
          "order": "study",
          "page": Number(currentPage),
          "page_size": Number(pageSize),
          "sort_type": "desc"
        }
      })
      return res.json(ebookListRes.data);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  const decryptAes = (contents) => {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(CipherKey);
    const iv = Buffer.from(AesIv);
    const decipher = createDecipheriv(algorithm, key, iv);
    const ciphertext = Buffer.from(contents, 'base64');

    let decrypted = decipher.update(ciphertext, 'binary', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted
  }

  const getEbookPages = async (chapterId, count, index, offset, readToken, csrfToken, cookies) => {

    try {
      let svgContents = []
      const ebookPages = await axios('https://www.dedao.cn/ebk_web_go/v2/get_pages', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": csrfToken,
          'Cookie': cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
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

  ebookService.get('/getEbookOutline', async (req, res) => {
    const { enid } = req.query;
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ data: { status: 0 } });
      }

      const bookDetailRes = await axios(`https://www.dedao.cn/pc/ebook2/v1/pc/detail?id=${enid}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': result.cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        }
      })
      const author = bookDetailRes.data.c.book_author;
      const title = bookDetailRes.data.c.operating_title
      const intro = bookDetailRes.data.c.book_intro;
      return res.json({ data: { author, title, intro } });
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  ebookService.get('/getEbookDetail', async (req, res) => {
    const { enid, eType } = req.query;
    let downloadType = ['html', 'pdf', 'epub']
    if (eType) {
      downloadType = JSON.parse(eType)
    }
    // 设置响应头以支持 SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let configInfo = await db.get(`SELECT * FROM output_config`);
      let outputDir = `${__dirname}/output`;
      if (configInfo && configInfo.output_dir) {
        outputDir = configInfo.output_dir;
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ data: { status: 0 } });
      }
      res.write(`data: ${JSON.stringify({ processStep: '获取令牌' })}\n\n`);

      const readTokenRes = await axios(`https://www.dedao.cn/api/pc/ebook2/v1/pc/read/token?id=${enid}`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': result.cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        }
      })
      const bookId = bookDetailRes.data.c.id;
      const author = bookDetailRes.data.c.book_author;
      const title = bookDetailRes.data.c.operating_title

      res.write(`data: ${JSON.stringify({ processStep: '获取图书章节' })}\n\n`);
      const bookDetailInfoRes = await axios(`https://www.dedao.cn/ebk_web/v1/get_book_info?token=${readToken}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          "xi-csrf-token": result.csrfToken,
          'Cookie': result.cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        }
      })

      const orders = bookDetailInfoRes.data.c.bookInfo.orders;
      const toc = bookDetailInfoRes.data.c.bookInfo.toc;

      const index = 0;
      const count = 6;
      const offset = 0;
      let svgContents = [];
      console.time('html Generation Time');
      res.write(`data: ${JSON.stringify({ processStep: '转换图书数据', steps: orders.length })}\n\n`);
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
          res.write(`data: ${JSON.stringify({ processKey: currentToc.text })}\n\n`);
        }
      }

      console.timeEnd('html Generation Time');
      const outputFileName = `${bookId}_${title}_${author}`;

      if (downloadType.findIndex(item => item === 'html') > -1) {
        res.write(`data: ${JSON.stringify({ processStep: '生成HTML文件' })}\n\n`);
        Svg2Html(outputDir, outputFileName, svgContents, toc);
      }

      if (downloadType.findIndex(item => item === 'pdf') > -1) {
        console.time('PDF Generation Time');
        res.write(`data: ${JSON.stringify({ processStep: '生成PDF文件' })}\n\n`);
        await Svg2Pdf(outputDir, outputFileName, title, svgContents, toc);
        console.timeEnd('PDF Generation Time');
      }

      if (downloadType.findIndex(item => item === 'epub') > -1) {
        console.time('EPUB Generation Time');
        res.write(`data: ${JSON.stringify({ processStep: '生成EPUB文件' })}\n\n`);
        await Svg2Epub(outputDir, outputFileName, title, author, svgContents, { toc: toc });
        console.timeEnd('EPUB Generation Time');
      }

      res.write(`data: ${JSON.stringify({ finalResult: "完成" })}\n\n`);
    } catch (error) {
      console.log(error)
      if (error.status === 401 || error.status === 403) {
        res.write(`data: ${JSON.stringify({ error: 403 })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ error: error })}\n\n`);
      }
    } finally {
      await db.close()
      res.end();
    }
  });

  module.exports = ebookService;
})();