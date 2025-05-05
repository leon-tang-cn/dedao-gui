const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
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

  const loginService = express.Router();

  const getSaveToken = async () => {
    const db = await connectDb();
    if (!db) {
      return false;
    }
    const result = await db.get(`SELECT * FROM login_info`);
    await db.close();
    return result;
  }
  const getOauthToken = async () => {
    let result = await getSaveToken();
    if (result && result.qrCode) {
      return result;
    }
    try {
      const homeRes = await axios('https://www.dedao.cn/', {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Host": "www.dedao.cn",
          "Pragma": "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
      })
      const cookies = homeRes.headers.get('Set-Cookie');
      const parsedCookies = {};
      cookies.forEach((cookie) => {
        if (!cookie.includes('csrfToken')) {
          return;
        }
        const pairs = cookie.split('; ');
        pairs.forEach((pair) => {
          const [name, value] = pair.split('=');
          parsedCookies[name] = decodeURIComponent(value);
        });
      })
      const csrfToken = parsedCookies['csrfToken']

      const tokenRes = await axios('https://www.dedao.cn/loginapi/getAccessToken', {
        method: 'POST',
        headers: {
          "xi-csrf-token": parsedCookies['csrfToken'],
          'Cookie': `csrfToken=${csrfToken}`
        }
      })
      const oauthToken = tokenRes.data

      const qrCodeRes = await axios('https://www.dedao.cn/oauth/api/embedded/qrcode', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          "x-oauth-access-token": oauthToken,
          'Cookie': `csrfToken=${csrfToken};`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        }
      })
      const qrCodeString = qrCodeRes.data.data.qrCodeString
      const qrCode = qrCodeRes.data.data.qrCode

      const db = await connectDb();
      if (!db) {
        return false
      }
      await db.run(`DELETE FROM login_info`);
      await db.run(
        `INSERT INTO login_info (oauthToken, csrfToken, qrCodeString, qrCode, cookies) VALUES (?, ?, ?, ?, ?)`,
        [oauthToken, csrfToken, qrCodeString, qrCode, `csrfToken=${csrfToken};`]
      );
      await db.close()
      return { oauthToken, csrfToken, qrCode, qrCodeString };
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    }
  }

  loginService.get('/getLoginQrCode', async (req, res) => {
    const result = await getOauthToken();
    if (!result) {
      res.status(500).send({ message: '无法连接到数据库' });
    }
    return res.json({ qrCode: result.qrCode });
  });

  loginService.get('/checkLogin', async (req, res) => {
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.oauthToken) {
        return res.json({ data: { status: 0 } });
      }

      const checkLoginRes = await axios('https://www.dedao.cn/oauth/api/embedded/qrcode/check_login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "x-oauth-access-token": result.oauthToken,
          'Cookie': result.cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "sec-ch-ua": "'Google Chrome';v='135', 'Not-A.Brand';v='8', 'Chromium';v='135'",
          "sec-ch-ua-mobile": "?0"
        },
        data: {
          "keepLogin": true,
          "pname": "mobilesms",
          "qrCode": result.qrCodeString,
          "scene": "login"
        }
      })
      if (checkLoginRes.data.data.status === 1) {
        if (result && result.oauthToken) {
          const parsedCookies = {};
          const cookies = checkLoginRes.headers.get('Set-Cookie');
          cookies.forEach((cookie) => {
            if (!cookie.includes('GAT')) {
              return;
            }
            const pairs = cookie.split('; ');
            pairs.forEach((pair) => {
              const [name, value] = pair.split('=');
              parsedCookies[name] = decodeURIComponent(value);
            });
          })
          await db.run(`update login_info set cookies = ? where oauthToken = ?`, [`${result.cookies};GAT=${parsedCookies['GAT']};`, result.oauthToken]);
        }
      }
      return res.json(checkLoginRes.data);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  loginService.get('/getUserInfo', async (req, res) => {
    const db = await connectDb();
    try {
      if (!db) {
        res.status(500).send({ message: '无法连接到数据库' });
      }

      let result = await db.get(`SELECT * FROM login_info`);
      if (!result || !result.csrfToken) {
        return res.json({ data: { status: 0 } });
      }

      const userInfoRes = await axios('https://www.dedao.cn/api/pc/user/info', {
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
      return res.json({ status: 1, data: userInfoRes.data?.c || {} })
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.json({ error: 403, message: '令牌已过期，请重新登录' });
      }
      return res.json({ error: -2, message: error.statusText });
    } finally {
      await db.close()
    }
  });

  loginService.get('/getLoginInfo', async (req, res) => {
    const db = await connectDb();
    if (!db) {
      res.status(500).send({ message: '无法连接到数据库' });
    }

    let result = await db.get(`SELECT * FROM login_info`);
    await db.close()
    return res.json(result);
  });

  loginService.post('/updateLoginInfo', async (req, res) => {
    const { csrfToken, cookies } = req.body;
    const db = await connectDb();
    if (!db) {
      res.status(500).send({ message: '无法连接到数据库' });
    }
    await db.run(`DELETE FROM login_info`);
    await db.run(
      `INSERT INTO login_info (csrfToken, cookies) VALUES (?, ?)`,
      [csrfToken, cookies]
    );
    await db.close()
    return res.json({ message: '更新成功' });
  });

  loginService.post('/deleteLoginInfo', async (req, res) => {
    const db = await connectDb();
    if (!db) {
      res.status(500).send({ message: '无法连接到数据库' });
    }
    await db.run(`DELETE FROM login_info`);
    await db.close()
    return res.json({ message: '删除成功' });
  });

  module.exports = loginService;
})();