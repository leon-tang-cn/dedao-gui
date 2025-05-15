const fs = require('fs-extra');
const { getDocument } = require('pdfjs-dist');
const { PDFDocument, PDFName, PDFArray, PDFNumber, PDFHexString, utf16Decode } = require('pdf-lib');
process.stdout.setEncoding('utf8');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
let dbFilePath = path.join("/Users/leon/Documents", './ddinfo.db');

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
  function convertText(text) {
    let textRep = text.replaceAll(" ", "");
    textRep = textRep.replace(/(\r\n|\n|\r)/g, '');
    textRep = textRep.replace(/\r/g, '');
    textRep = textRep.replace(/^\uFEFF/, '');
    textRep = textRep.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return textRep;
  }
  function buildTree(data) {
    const root = { children: [] };
    const lastNodes = []; // 记录各层级最新的节点

    for (const item of data) {
      if (!item.bookmark) {
        continue;
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
    for (let j = 0; j < pageDatas.length; j++) {
      if (j < lastPageIndex) {
        continue;
      }
      if (pageDatas[j].content.includes(text)) {
        return pageDatas[j].index;
      } else {
        if (j > 0) {
          let combinedText = convertText(pageDatas[j - 1] + pageDatas[j]);
          combinedText = combinedText.replace(/\s*\d+\/\d+\s*/g, "");
          if (combinedText.includes(text)) {
            foundPageIndex = pageDatas[j].index;
            break; // 立即退出循环
          }
        }
      }
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
    await generateOutline(mergedPdf, outputPath, toc);
    for (let i = 0; i < inputPaths.length; i++) {
      fs.unlinkSync(inputPaths[i]);
    }
  }

  async function loadAndGenerateOutline(filePath, toc) {
    const inputPdf = await PDFDocument.load(fs.readFileSync(filePath));
    await generateOutline(inputPdf, "./2.pdf", toc);
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
      contentStr = convertText(contentStr);
      contentStr = JSON.stringify(contentStr);
      pageDatas.push({
        index: i - 1,
        content: contentStr
      });
    }

    // 遍历toc，创建书签对象
    let lastPageIndex = 0;
    for (let i = 0; i < toc.length; i++) {
      let text = convertText(toc[i].text);
      const pageIndex = getPageIndex(pageDatas, text, lastPageIndex)
      if (pageIndex == "notfound") {
        console.log(`❌️ ${i}-[${text}] of [${outputPath}] not found.`)
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
    const tocTree = buildTree(toc);

    // 创建目录
    const outlineRoot = createOutline(tocTree, null, mergedPdf);

    const registed = mergedPdf.context.register(outlineRoot)
    // 注册大纲根节点
    mergedPdf.catalog.set(PDFName.of('Outlines'), registed);

    const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: false });

    fs.writeFileSync(outputPath, mergedPdfBytes)
  }


  const db = await connectDb();
  const data = await db.get(
    `select contents from download_data where enid = '/Users/leon/Documents/得到电子书/73857_精品咖啡学（总论篇）_韩怀宗.pdf'`
  );
  db.close();
  // await loadAndGenerateOutline("./1.pdf", JSON.parse(data.contents))
  // return;
  const pdfBytes = fs.readFileSync("./1.pdf")
  const doc = await getDocument(pdfBytes).promise;
  const keywords = JSON.parse(data.contents)

  const page = await doc.getPage(152);
  const content = await page.getTextContent({ disableCombineTextItems: true, normalizeWhitespace: true });

  let contentStr = content.items.map(item => {
    return item.str
  }).join('');
  contentStr = contentStr.replaceAll(" ", "");
  contentStr = contentStr.replace(/(\r\n|\n|\r)/g, '');
  contentStr = contentStr.replace(/\r/g, '');
  contentStr = contentStr.replace(/^\uFEFF/, '');
  contentStr = contentStr.replace(/[\u200B-\u200D\uFEFF]/g, '');
  contentStr = JSON.stringify(contentStr)
  console.log(contentStr)
  console.log(JSON.stringify(keywords[0]))

  const str1 = "抚瑶琴白□亭头";
  console.log(str1.replace(/[\u0000-\u001F\u25A0-\u25FF]/g, ''))

  const encoder = new TextEncoder();

  console.log(encoder.encode("……"))

})();