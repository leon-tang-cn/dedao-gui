const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const { OneByOneHtml } = require('./svg2html');
const { PDFDocument } = require('pdf-lib');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
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

  async function mergePDFs(inputPaths, outputPath) {
    const mergedPdf = await PDFDocument.create();

    for (const inputPath of inputPaths) {
      const pdfBytes = fs.readFileSync(inputPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pageIndices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
      const pages = await mergedPdf.copyPages(pdfDoc, pageIndices);
      pages.forEach((page) => {
        mergedPdf.addPage(page);
      });
    }

    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync(outputPath, mergedPdfBytes);
    for (const inputPath of inputPaths) {
      fs.unlinkSync(inputPath);
    }
  }

  async function browserGenPdf(buf, outputDir, reTitle, index) {
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
      if (index) {
        console.log('\x1b[32m%s\x1b[0m', `created PDF part-${index}: ${fileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', `created PDF: ${fileName}`);
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

  async function Svg2Pdf(outputDir, title, docName, svgContents, toc, enid) {
    let reTitle = title.replace(/\//g, '_');
    reTitle = reTitle.replace(/\\/g, '_');
    reTitle = reTitle.replace(/\:/g, '_');
    reTitle = reTitle.replace(/\*/g, '_');
    reTitle = reTitle.replace(/\?/g, '_');
    reTitle = reTitle.replace(/\"/g, '_');
    reTitle = reTitle.replace(/\n/g, '');
    let buf = [];
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

      if (buf.length <= 500) {
        await browserGenPdf(buf, outputDir, reTitle);
      } else {
        const chunks = chunkArray(buf, 500);
        console.error(`pdf toc length: ${buf.length}, Contents too loog, split to:${chunks.length} parts`);
        const mergeFiles = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const pdfFileName = await browserGenPdf(chunk, outputDir, reTitle, i + 1);
          if (pdfFileName) {
            mergeFiles.push(pdfFileName);
          }
        }

        if (mergeFiles.length > 0) {
          mergePDFs(mergeFiles, fileName);
        }
      }
      // console.timeEnd(`PDF created in ${title}`)
      const db = await connectDb();
      if (db) {
        await db.run(
          `update download_his set uploaded = 1 where book_id = '${enid}'`
        );
        db.close();
      }
      return true;
    } catch (error) {
      console.error('create PDF failed:', error);
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