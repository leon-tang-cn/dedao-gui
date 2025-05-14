const fs = require('fs-extra');
const { PdfReader } = require("pdfreader");
const { PDFDocument, PDFName, PDFArray, PDFNumber, PDFHexString } = require('pdf-lib');
process.stdout.setEncoding('utf8');

(async () => {
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

  function getPageIndex(pageDatas, keyword, lastPageIndex) {
    let foundPageIndex = "notfound";

    const entries = Object.entries(pageDatas);
    for (let i = 0; i < entries.length; i++) {
      const [page, text] = entries[i]; // 解构当前条目
      const pageIndex = Number(page) - 1;
      if (pageIndex < lastPageIndex) {
        continue;
      }

      const textRep = convertText(text);
      const regexDynamic = new RegExp(keyword)

      // 如果当前文本包含关键词
      if (regexDynamic.test(textRep)) {
        foundPageIndex = pageIndex;
        break; // 立即退出循环
      } else {
        if (i > 0) {
          const [prevPage, prevText] = entries[i - 1]
          const combinedText = prevText + text;
          let combinedTextRep = convertText(combinedText);
          combinedTextRep = combinedTextRep.replace(/\s*\d+\/\d+\s*/g, "");
          if (regexDynamic.test(combinedTextRep)) {
            foundPageIndex = pageIndex;
            break; // 立即退出循环
          }
        }
      }
      // 如果不包含关键词，继续下一轮循环
    }

    return foundPageIndex;
  }

  async function parsePDFAsync(pdfBytes) {
    const reader = new PdfReader();
    return new Promise((resolve, reject) => {
      const pages = {}; // 按页码存储文本
      let currentPage = 0;

      reader.parseBuffer(pdfBytes, (err, item) => {
        if (err) reject(err);
        else if (!item) resolve(pages); // 解析结束时返回结果
        else {
          if (item.page) currentPage = item.page; // 更新当前页码
          if (item.text) {
            pages[currentPage] = (pages[currentPage] || "") + item.text + "";
          }
        }
      });
    });
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
    await generateOutline(inputPdf, filePath, toc);
  }

  async function generateOutline(mergedPdf, outputPath, toc) {
    const pdfBytes = await mergedPdf.save({ useObjectStreams: false })
    const pageDatas = await parsePDFAsync(pdfBytes);

    // 遍历toc，创建书签对象
    let lastPageIndex = 0;
    for (let i = 0; i < toc.length; i++) {
      let text = convertText(toc[i].text);
      const pageIndex = getPageIndex(pageDatas, text, lastPageIndex)
      if (pageIndex == "notfound") {
        console.log(`❌️ [${text}] of [${outputPath}] not found.`)
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

  module.exports = {
    mergePdfFiles,
    loadAndGenerateOutline
  };
})();