const fs = require('fs-extra');
const { getDocument } = require('pdfjs-dist');
const { PDFDocument, PDFName, PDFArray, PDFNumber, PDFHexString } = require('pdf-lib');

(async () => {

  function getChapterId(href) {
    const match = href.split('#');
    return match ? match[0] : null;
  }

  function itrateChild(targetLevel, parentLevel, data) {
    let subMap = {};
    let currentLevels = [];
    const parentChapterId = getChapterId(parentLevel.href)
    for (let j = 0; j < data.length; j++) {
      if (data[j].level !== targetLevel) {
        continue;
      }
      const chapterId = getChapterId(data[j].href);
      if (!chapterId || !chapterId.startsWith(parentChapterId)) {
        continue;
      }
      currentLevels.push(data[j]);
      const childMap = itrateChild(targetLevel + 1, data[j], data);
      subMap[data[j].text] = { ...data[j], children: childMap }
    }
    return subMap;
  }
  function itrateChild(targetLevel, parent, data) {
    let nodes = []
    const parentChapterId = getChapterId(parent.href)
    for (let j = 0; j < data.length; j++) {
      if (!data[j].bookmark) {
        continue;
      }
      if (data[j].level !== targetLevel) {
        continue;
      }
      const chapterId = getChapterId(data[j].href);
      if (!chapterId || !chapterId.startsWith(parentChapterId)) {
        continue;
      }
      const childs = itrateChild(targetLevel + 1, data[j], data);
      nodes.push({ ...data[j], children: childs })
    }
    return nodes;
  }

  function buildTocTree(data) {
    const rootNodes = [];

    data.forEach(node => {
      if (!node.bookmark) {
        return;
      }
      if (node.level === 0) {
        rootNodes.push({ ...node, children: {} });
      }
    });

    for (let i = 0; i < rootNodes.length; i++) {
      const childs = itrateChild(1, rootNodes[i], data);
      rootNodes[i].children = childs;
    }

    return rootNodes;
  }

  function getPageIndex(pageDatas, text) {
    for (let j = 0; j < pageDatas.length; j++) {
      if (pageDatas[j].content.includes(text)) {
        return pageDatas[j].index;
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
  }

  async function loadAndGenerateOutline(filePath, toc) {
    const inputPdf = await PDFDocument.load(fs.readFileSync(filePath));
    await generateOutline(inputPdf, filePath, toc);
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
      contentStr = contentStr.replaceAll(" ", "");
      contentStr = contentStr.replace(/(\r\n|\n|\r)/g, '');
      contentStr = contentStr.replace(/\r/g, '');
      contentStr = contentStr.replace(/^\uFEFF/, '');
      contentStr = contentStr.replace(/[\u200B-\u200D\uFEFF]/g, '');
      pageDatas.push({
        index: i - 1,
        content: contentStr
      });
    }

    // 遍历toc，创建书签对象
    for (let i = 0; i < toc.length; i++) {
      let text = toc[i].text.replaceAll(" ", "");
      text = text.replace(/(\r\n|\n|\r)/g, '');
      text = text.replace(/\r/g, '');
      text = text.replace(/^\uFEFF/, '');
      text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
      const pageIndex = getPageIndex(pageDatas, text)
      if (pageIndex == "notfound") {
        continue;
      }
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
    const tocTree = buildTocTree(toc);

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