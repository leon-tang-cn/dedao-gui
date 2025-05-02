const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const { OneByOneHtml } = require('./svg2html');

(async () => {
  async function Svg2Pdf(outputDir, title, docName, svgContents, toc) {
    fs.ensureDirSync(outputDir);
    const filePreName = path.join(outputDir, title);
    const fileName = `${filePreName}.pdf`;

    const buf = [];

    svgContents.forEach((svgContent, k) => {
      const [chapter, coverContent] = OneByOneHtml('pdf', k, svgContent, toc);
      if (k === 0) {
        buf.unshift(coverContent);
      }
      buf.push(chapter);
      buf.push(`<P style="page-break-before: always">`);
    });

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(buf.join(''));
    await page.pdf({
      path: fileName,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      outline: true,
      headerTemplate: `<span style="padding: 0 30px; font-size: 14px; color: #333;">${docName}</span>`,
      footerTemplate: '<span style="padding: 0 30px; width: 100%; font-size: 14px; color: #333; text-align: right;"><span class="pageNumber"></span>/<span class="totalPages"></span></span>',
      margin: {
        top: '60px',
        right: '30px',
        bottom: '60px',
        left: '30px'
      }
    });
    await browser.close();
  }

  module.exports = {
    Svg2Pdf
  };
})();