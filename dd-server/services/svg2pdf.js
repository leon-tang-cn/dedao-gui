const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const { OneByOneHtml } = require('./svg2html');
const { mergePdfFiles, loadAndGenerateOutline } = require('./createOutline');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
let dbFilePath = "";
if (process.env.USER_DATA_PATH) {
  dbFilePath = path.join(process.env.USER_DATA_PATH, 'ddinfo.db');
} else {
  dbFilePath = path.join(__dirname, '../ddinfo.db');
}
process.stdout.setEncoding('utf8');

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

  async function browserGenPdf(buf, outputDir, reTitle, index, genOutline = false) {
    let browser = null;
    try {
      const filePreName = path.join(outputDir, reTitle);
      let fileName = "";
      if (index) {
        fileName = `${filePreName}-${index}.pdf`;
      } else {
        fileName = `${filePreName}.pdf`;
      }
      browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.setContent(buf.join(''), { timeout: 60000000 });
      page.setDefaultTimeout(60000000);
      fs.ensureDirSync(outputDir);
      page.emulateMediaType('print');
      await page.pdf({
        path: fileName,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        outline: genOutline,
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
      if (index) {
        console.log('\x1b[32m%s\x1b[0m', `created PDF part-${index}: ${fileName}`);
      }
      await browser.close();
      return fileName;
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      return null;
    }
  }

  function chunkArray(arr, chunkSize) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async function Svg2Pdf(outputDir, title, docName, svgContents, toc, enid, saveHis) {
    let buf = [];
    const filePreName = path.join(outputDir, title);
    const fileName = `${filePreName}.pdf`;
    try {
      fs.ensureDirSync(outputDir);

      svgContents.forEach((svgContent, k) => {
        const [chapter, coverContent] = OneByOneHtml('pdf', k, svgContent, toc);
        if (k === 0) {
          buf.unshift(`<p style="page-break-before: always;">`);
          buf.unshift(coverContent);
          return;
        }
        if (!chapter || chapter === '') {
          return;
        }
        buf.push(chapter);
        if (k < svgContents.length - 1) {
          buf.push(`<p style="page-break-before: always;">`);
        }
      });

      if (buf.length <= 200) {
        const pdfFileName = await browserGenPdf(buf, outputDir, title, null, false);
        await loadAndGenerateOutline(pdfFileName, toc);
        console.log('\x1b[32m%s\x1b[0m', `✅ created PDF: ${pdfFileName}`);
      } else {
        const splitSize = Math.ceil(buf.length / Math.ceil(buf.length / 200));
        const splitParts = chunkArray(buf, splitSize);
        console.error(`pdf toc length: ${buf.length}, Contents too loog, split to:${splitParts.length} parts`);
        const mergeFileMap = {};
        const chunks = chunkArray(splitParts, 4);
        for (let i = 0; i < chunks.length; i++) {
          const subParts = chunks[i];
          const promises = subParts.map(async (chunk, index) => {
            const pdfFileName = await browserGenPdf(chunk, outputDir, title, (i * 4) + index + 1);
            if (pdfFileName) {
              mergeFileMap[index] = pdfFileName;
            }
          });

          await Promise.all(promises);
        }

        let mergeFiles = [];
        for (let i = 0; i < splitParts.length; i++) {
          mergeFiles.push(mergeFileMap[i]);
        }
        // for (let i = 0; i < chunks.length; i++) {
        //   const chunk = chunks[i];
        //   const pdfFileName = await browserGenPdf(chunk, outputDir, title, i + 1);
        //   if (pdfFileName) {
        //     mergeFiles.push(pdfFileName);
        //   }
        // }

        if (mergeFiles.length > 0) {
          await mergePdfFiles(mergeFiles, fileName, toc);
          console.log('\x1b[32m%s\x1b[0m', `✅ merged PDF: ${fileName}`);
        }
      }
      // console.timeEnd(`PDF created in ${title}`)
      if (saveHis) {
        const db = await connectDb();
        if (db) {
          await db.run(
            `update download_his set uploaded = 1 where book_id = '${enid}'`
          );
          db.close();
        }
      }
      return true;
    } catch (error) {
      console.error('❌️ create PDF failed:', error);
      const time = new Date().getTime();
      const filePreName = path.join(outputDir, `../${time}.txt`);
      const content = `${title} 生成失败: ${error}`;

      fs.writeFile(filePreName, content, 'utf8', (err) => {
        if (err) {
          console.error('写入文件时出错:', err);
        } else {
          console.log('Failed file info created.');
        }
      });
      return false;
    }
  }

  module.exports = {
    Svg2Pdf
  };
})();