const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const cookie = require('cookie');

(async () => {

  async function connectDb(dbFilePath) {
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

  const getSavedCookies = async (dbFilePath) => {
    const db = await connectDb(dbFilePath);
    let result = null;
    try {
        if (db) {
            result = await db.get(`SELECT * FROM login_info`);
            if (!result || !result.csrfToken) {
                console.log('未找到有效的登录信息');
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
  
    let cookies = [];
    if (result && result.cookies) {
        try {
            const savedCookies = cookie.parse(result.cookies);
            cookies = Object.keys(savedCookies).map(key => {
                return {
                    "url": "https://www.dedao.cn",
                    "name": key,
                    "value": savedCookies[key]
                }
            })
        } catch (error) {
            console.error('Error parsing cookies:', error);
            cookies = [];
        }
    }
    return cookies;
  }

  const saveCookie = async (cookies, dbFilePath) => {
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const csrfToken = cookies.find(c => c.name === 'csrf_token')?.value;
    
    try {
      const db = await connectDb(dbFilePath);
      if (!db) {
        return false
      }
      await db.run(`DELETE FROM login_info`);
      await db.run(
        `INSERT INTO login_info (oauthToken, csrfToken, qrCodeString, qrCode, cookies) VALUES (?, ?, ?, ?, ?)`,
        ["", csrfToken, "", "", cookieStr]
      );
      await db.close();
    } catch (error) {
      console.error('Error:', error);
    }
  }

  module.exports = {
      getSavedCookies,
      saveCookie
  }
})();