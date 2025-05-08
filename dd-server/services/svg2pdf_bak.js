const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const { OneByOneHtml } = require('./svg2html');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const wkhtmltopdf = require('wkhtmltopdf');
let dbFilePath = path.join(__dirname, '../ddinfo.db');

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

  async function genPdf(buf, pdfFilePath) {
    return new Promise((resolve, reject) => {
      try {
        // 创建可写流来保存生成的 PDF 文件
        const outputStream = fs.createWriteStream(pdfFilePath);

        // 调用 wkhtmltopdf 生成 PDF
        wkhtmltopdf(buf.join(''), {
          pageSize: 'A4',
          marginBottom: '15mm',
          marginTop: '15mm',
          marginLeft: '15mm',
          marginRight: '15mm',
          footerFontSize: 10,
          footerRight: '[page]',
          disableSmartShrinking: true,
          enableLocalFileAccess: true
        }).pipe(outputStream)
          .on('finish', () => {
            console.log('\x1b[32m%s\x1b[0m', `created PDF: ${pdfFilePath}`)
            return resolve(true);
          })
          .on('error', (err) => {
            console.error('created PDF on error:', err);
            return resolve(false);
          });
      } catch (error) {
        return resolve(false);
      }
    });
  }

  async function Svg2Pdf(outputDir, title, docName, svgContents, toc, enid) {
    let reTitle = title.replace(/\//g, '_');
    reTitle = reTitle.replace(/\\/g, '_');
    reTitle = reTitle.replace(/\:/g, '_');
    reTitle = reTitle.replace(/\*/g, '_');
    reTitle = reTitle.replace(/\?/g, '_');
    reTitle = reTitle.replace(/\"/g, '_');
    reTitle = reTitle.replace(/\n/g, '');
    let buf = [];
    let browser = null;
    const filePreName = path.join(outputDir, reTitle);
    const fileName = `${filePreName}.pdf`;
    try {
      fs.ensureDirSync(outputDir);

      svgContents.forEach((svgContent, k) => {
        const [chapter, coverContent] = OneByOneHtml('pdf', k, svgContent, toc);
        if (k === 0) {
          buf.unshift(coverContent);
        }
        if (!chapter || chapter === '') {
          return;
        }
        buf.push(chapter);
        buf.push(`<p style="page-break-before: always">`);
      });

      // const wkfilePreName = path.join(outputDir, `wk_${reTitle}`);
      // const wkfileName = `${wkfilePreName}.pdf`;
      // await genPdf(buf, wkfileName);
      // return;
      console.info(`长度: ${buf.length}`);
      browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.setContent(buf.join(''), { timeout: 60000000 });
      page.setDefaultTimeout(60000000);
      fs.ensureDirSync(outputDir);
      await page.pdf({
        path: fileName,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        outline: true,
        timeout: 60000000,
        headerTemplate: `<span style="padding: 0 60px; font-size: 14px; color: #333;"></span>`,
        footerTemplate: '<span style="padding: 0 60px; width: 100%; font-size: 10px; color: #333; text-align: right;"><span class="pageNumber"></span>/<span class="totalPages"></span></span>',
        margin: {
          top: '60px',
          right: '60px',
          bottom: '60px',
          left: '60px'
        }
      });
      console.log('\x1b[32m%s\x1b[0m', `created PDF: ${fileName}`)
      console.timeEnd(`PDF created in ${title}`)
      await browser.close();
    } catch (error) {
      console.error('生成 PDF 失败:', error);
      if (browser) {
        await browser.close();
      }

      const isSuccess = await genPdf(buf, fileName);

      if (!isSuccess) {
        const time = new Date().getTime();
        const filePreName = path.join(outputDir, `../${time}.txt`);
        const content = `${title} 生成失败: ${error}`;

        fs.writeFile(filePreName, content, 'utf8', (err) => {
          if (err) {
            console.error('写入文件时出错:', err);
          } else {
            console.log('内容已成功写入文件');
          }
        });

        let db = await connectDb();
        await db.run(`delete from download_his where book_id = ?`, enid);
        db.close();
      }
    }
  }

  module.exports = {
    Svg2Pdf
  };
})();