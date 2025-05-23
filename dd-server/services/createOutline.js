const fs = require('fs-extra');
const { getDocument } = require('pdfjs-dist');
const { PDFDocument, PDFName, PDFArray, PDFNumber, PDFHexString } = require('pdf-lib');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const archiver = require('archiver');
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
      return await open({
        filename: dbFilePath,
        driver: sqlite3.Database
      });
    } catch (error) {
      console.error('无法连接到数据库:', error);
      return null;
    }
  }
  function convertText(text) {
    let textRep = text.replaceAll(" ", "");
    textRep = textRep.replace(/(\r\n|\n|\r)/g, '');
    textRep = textRep.replace(/\r/g, '');
    textRep = textRep.replace(/^\uFEFF/, '');
    textRep = textRep.replace(/[\u200B-\u200D\uFEFF]/g, '');
    textRep = textRep.replace(/[\u0000-\u001F\u25A0-\u25FF]/g, '');
    textRep = textRep.replace(/\(\d+\)/g, '');
    textRep = textRep.replaceAll("…", "...");
    textRep = textRep.replace(/[\u3000-\u303F\uFF00-\uFFEF!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/gu, '');
    return textRep;
  }
  function buildTree(data, mergedPdf) {
    const root = { children: [] };
    const lastNodes = []; // 记录各层级最新的节点

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item.bookmark) {
        if (item.level == 0 && (i + 1) < data.length) {
          const replaceItem = data[i + 1];
          if (!replaceItem.bookmark) {
            continue;
          }
          const destArray = replaceItem.bookmark.get(PDFName.of('Dest'))
          const bookmark = mergedPdf.context.obj({});
          bookmark.set(PDFName.of('Title'), PDFHexString.fromText(item.text));
          bookmark.set(PDFName.of('Dest'), destArray);
          const ref = mergedPdf.context.register(bookmark);

          item.bookmark = bookmark;
          item.ref = ref;
        } else {
          continue;
        }
      }
      const currentLevel = item.level;
      const newNode = {
        ...item,
        children: []
      };

      // 找到父节点
      if (currentLevel === 0) {
        // 顶层节点，父节点是根节点
        root.children.push(newNode);
      } else {
        // 父节点是上一层的最后一个节点
        const parent = lastNodes[currentLevel - 1];
        if (!parent) {
          continue;
        }
        parent.children.push(newNode);
      }

      // 更新lastNodes数组
      lastNodes[currentLevel] = newNode;
      // 截断数组，确保长度正确
      lastNodes.length = currentLevel + 1;
    }

    return root.children;
  }

  function getPageIndex(pageDatas, text, lastPageIndex) {
    const tocTextArr = text.split("#");
    let keyword = "";
    for (let j = lastPageIndex; j < pageDatas.length; j++) {
      if (tocTextArr.length > 1) {
        keyword = `[${tocTextArr[1]}]`;
      } else {
        keyword = `[${tocTextArr[0]}]`;
      }
      if (pageDatas[j].content.includes(keyword)) {
        return pageDatas[j].index;
      }
      keyword = keyword.replaceAll("_", " ");
      if (pageDatas[j].content.includes(keyword)) {
        return pageDatas[j].index;
      }
    }

    for (let j = 0; j < lastPageIndex; j++) {
      if (tocTextArr.length > 1) {
        keyword = `[${tocTextArr[1]}]`;
      } else {
        keyword = `[${tocTextArr[0]}]`;
      }
      if (pageDatas[j].content.includes(keyword)) {
        return pageDatas[j].index;
      }
      keyword = keyword.replaceAll("_", " ");
      if (pageDatas[j].content.includes(keyword)) {
        return pageDatas[j].index;
      }
    }

    if (tocTextArr.length > 1) {
      keyword = tocTextArr[0];
      return getPageIndex(pageDatas, keyword, lastPageIndex);
    }
    return "notfound";
  }

  function createOutline(nodes, parent, mergedPdf) {
    if (nodes.length <= 0) {
      return [];
    }
    let outline = null;
    if (!parent) {
      outline = mergedPdf.context.obj({
        Type: 'Outlines',
        First: undefined,
        Last: undefined,
        Count: 0
      });
    } else {
      outline = parent.bookmark;
    }

    for (let i = 0; i < nodes.length; i++) {
      if (i > 0) {
        nodes[i].bookmark.set(PDFName.of('Prev'), nodes[i - 1].ref);
      }
      if (i < nodes.length - 1) {
        nodes[i].bookmark.set(PDFName.of('Next'), nodes[i + 1].ref);
      }
      if (nodes[i].children) {
        createOutline(nodes[i].children, nodes[i], mergedPdf);
      }
    }

    outline.set(PDFName.of('First'), nodes[0].ref);
    outline.set(PDFName.of('Last'), nodes[nodes.length - 1].ref);
    outline.set(PDFName.of('Count'), PDFNumber.of(nodes.length));
    return outline;
  }

  async function mergePdfFiles(inputPaths, outputPath, toc) {
    const mergedPdf = await PDFDocument.create();
    for (let i = 0; i < inputPaths.length; i++) {
      const inputPdf = await PDFDocument.load(fs.readFileSync(inputPaths[i]));
      const copiedPages = await mergedPdf.copyPages(inputPdf, Array.from({ length: inputPdf.getPageCount() }, (_, i) => i));
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }
    const { hasError, missedKeys } = await generateOutline(mergedPdf, outputPath, toc);
    if (!hasError) {
      for (let i = 0; i < inputPaths.length; i++) {
        fs.unlinkSync(inputPaths[i]);
      }
    } else {
      const db = await connectDb();
      if (!db) {
        return;
      }
      await db.run(`insert into download_data(enid, contents) values(?,?)`, [JSON.stringify(inputPaths), JSON.stringify(missedKeys)]);
      await db.close();
    }
  }

  async function loadAndGenerateOutline(filePath, toc) {
    const inputBytes = fs.readFileSync(filePath);
    const inputPdf = await PDFDocument.load(inputBytes);
    const { hasError, missedKeys } = await generateOutline(inputPdf, filePath, toc);
    if (hasError) {
      fs.writeFileSync(filePath.replace(".pdf", ".bak.pdf"), inputBytes)
      const db = await connectDb();
      if (!db) {
        return;
      }
      await db.run(`insert into download_data(enid, contents) values(?,?)`, [filePath, JSON.stringify(missedKeys)]);
      await db.close();
    }
  }

  async function generateOutline(mergedPdf, outputPath, toc) {
    const pdfBytes = await mergedPdf.save({ useObjectStreams: false })
    const doc = await getDocument(pdfBytes).promise;

    const pageDatas = [];
    // 创建页面查找用的map
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let contentStr = content.items.map(item => item.str).join('');
      pageDatas.push({
        index: i - 1,
        content: contentStr
      });
    }

    // 遍历toc，创建书签对象
    let lastPageIndex = 0;
    let hasError = false;
    let missedKeys = [];
    for (let i = 0; i < toc.length; i++) {
      const pageIndex = getPageIndex(pageDatas, toc[i].href, lastPageIndex);
      if (pageIndex == "notfound") {
        console.log(`❌️ ${i}-[${toc[i].href}]-[${toc[i].text}] of [${outputPath}] not found.`)
        hasError = true;
        missedKeys.push(toc[i].href);
        continue;
      }
      lastPageIndex = pageIndex;
      const pageRef = mergedPdf.getPage(pageIndex).ref;
      const destArray = PDFArray.withContext(mergedPdf.context);
      destArray.push(pageRef);
      destArray.push(PDFName.of('Fit'));
      const bookmark = mergedPdf.context.obj({});
      bookmark.set(PDFName.of('Title'), PDFHexString.fromText(toc[i].text));
      bookmark.set(PDFName.of('Dest'), destArray);
      const ref = mergedPdf.context.register(bookmark);

      toc[i].bookmark = bookmark;
      toc[i].ref = ref;
    }

    // 构建目录树
    const tocTree = buildTree(toc, mergedPdf);

    // 创建目录
    const outlineRoot = createOutline(tocTree, null, mergedPdf);

    const registed = mergedPdf.context.register(outlineRoot)
    // 注册大纲根节点
    mergedPdf.catalog.set(PDFName.of('Outlines'), registed);

    const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: false });

    fs.writeFileSync(outputPath, mergedPdfBytes);

    // let zipPath = outputPath.replace(".pdf", ".zip");

    // const output = fs.createWriteStream(zipPath);
    // const archive = archiver('zip', {
    //   zlib: { level: 5 } // 最高压缩级别
    // });

    // // 监听事件
    // output.on('close', () => {
    //   console.log(`📄 压缩PDF: ${zipPath} `);
    //   fs.unlinkSync(outputPath);
    // });

    // archive.on('warning', (err) => {
    //   if (err.code === 'ENOENT') console.warn('文件不存在警告:', err);
    //   else throw err;
    // });

    // archive.on('error', (err) => {
    //   throw err;
    // });

    // // 管道连接
    // archive.pipe(output);

    // archive.file(outputPath, { name: path.basename(outputPath) });

    // // 完成压缩
    // archive.finalize().then(() => {
    // });

    return { hasError, missedKeys };
  }

  module.exports = {
    mergePdfFiles,
    loadAndGenerateOutline
  };
})();