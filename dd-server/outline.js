const fs = require('fs-extra');
const { PDFDocument, PDFName, PDFRef, PDFDict, PDFRawStream, PDFArray, PDFString, PDFNumber, PDFHexString, arrayAsString } = require('pdf-lib');

(async () => {

  function getRef(item, name) {
    return item.get(PDFName.of(name))
  }

  function getRefEle(pdfDoc, ref) {
    return pdfDoc.context.lookup(ref)
  }

  function getLinkRef(item) {
    if (item.array) {
      for (let i = 0; i < item.array.length; i++) {
        if (item.array[i] instanceof PDFRef) {
          return item.array[i];
        }
      }
    }
  }

  function getRootEle(origin, name) {
    const outlinesRef = getRef(origin.catalog, 'Outlines');
    const outlines = getRefEle(origin, outlinesRef);
    const eleRef = getRef(outlines, name);
    return getRefEle(origin, eleRef);
  }

  function getMergedPageRef(pdfDoc, mergedPdf, dictItem) {
    const destRef = getRef(dictItem, 'Dest');
    if (!destRef) {
      return null;
    }
    const dest = getRefEle(pdfDoc, destRef);
    const destLinkRef = getLinkRef(dest);
    const destLink = getRefEle(pdfDoc, destLinkRef);
    let destContent = null;
    if (destLink instanceof PDFRawStream) {
      destContent = destLink;
    } else {
      const destContentRef = getRef(destLink, 'Contents');
      destContent = getRefEle(pdfDoc, destContentRef);
    }
    const mergedPages = mergedPdf.getPages();
    let targetRef = null;

    for (let i = 0; i < mergedPages.length; i++) {
      const pageContentRef = getRef(mergedPages[i].node, 'Contents');
      const pageContent = getRefEle(mergedPdf, pageContentRef);

      if (pageContent.getContentsString() == destContent.getContentsString()) {
        targetRef = pageContentRef;
        break;
      }
    }
    return targetRef;
  }

  function createOutlineItem(pdfDoc, mergedPdf, currentDict, prevRef, parentRef) {
    if (!currentDict instanceof PDFDict) {
      return null;
    }
    const newItem = PDFDict.withContext(mergedPdf.context);
    const keys = currentDict.keys();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === PDFName.of('Dest')) {
        newItem.set(keys[i], getMergedPageRef(pdfDoc, mergedPdf, currentDict))
      } else if (keys[i] === PDFName.of('Parent')) {
        newItem.set(PDFName.of('Parent'), parentRef)
      } else if (keys[i] === PDFName.of('Prev')) {
        newItem.set(PDFName.of('Prev'), prevRef)
      } else if (keys[i] === PDFName.of('SE')) {
        // console.log("SE:", getRefEle(pdfDoc, currentDict.get(keys[i])))
      } else if (keys[i] === PDFName.of('Title')) {
        newItem.set(keys[i], currentDict.get(keys[i]));
      }
    }

    const newItemRef = mergedPdf.context.register(newItem);
    const nextRef = getRef(currentDict, 'Next');
    if (nextRef) {
      const nextDict = getRefEle(pdfDoc, nextRef);
      const { newNextRef, last } = createOutlineItem(pdfDoc, mergedPdf, nextDict, newItemRef, parentRef)
      newItem.set(PDFName.of('Next'), newNextRef);
      return { newNextRef: newItemRef, last };
    } else {
      return { newNextRef: newItemRef, last: newItemRef };
    }
  }

  function getRootEle(pdfDoc, name) {
    const outlinesRef = getRef(pdfDoc.catalog, 'Outlines');
    const outlines = getRefEle(pdfDoc, outlinesRef);
    const eleRef = getRef(outlines, name);
    return getRefEle(pdfDoc, eleRef);
  }

  function createPartOutline(pdfDoc, mergedPdf, outlineRoot, prev) {
    const first = getRootEle(pdfDoc, 'First');
    return createOutlineItem(pdfDoc, mergedPdf, first, prev, outlineRoot);
  }

  function createRootDict(originFirst, mergedPdf) {
    const outlineRoot = mergedPdf.context.obj({
      Type: 'Outlines',
      First: undefined,
      Last: undefined,
      Count: mergedPdf.getPageCount(),
    });
    const first = getRootEle(originFirst, 'First');
    const { newNextRef, last } = createOutlineItem(originFirst, mergedPdf, first, null, outlineRoot);
    outlineRoot.set(PDFName.of('First'), newNextRef);
    return { outlineRoot, last };
  }

  const mergedPdf = await PDFDocument.create();
  const inputPaths = ["D:\\电子书\\1.pdf", "D:\\电子书\\2.pdf", "D:\\电子书\\3.pdf", "D:\\电子书\\4.pdf"];
  const pdfDocs = [];
  for (const inputPath of inputPaths) {
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageIndices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
    const pages = await mergedPdf.copyPages(pdfDoc, pageIndices);
    pages.forEach((page) => {
      mergedPdf.addPage(page);
    });
    pdfDocs.push(pdfDoc);
  }

  const res = createRootDict(pdfDocs[0], mergedPdf);
  const outlineRoot = res.outlineRoot;
  let newlastRef = res.last;
  for (let i = 1; i < pdfDocs.length; i++) {
    const { newNextRef, last } = createPartOutline(pdfDocs[i], mergedPdf, outlineRoot, newlastRef);
    newlastRef = last
  }
  outlineRoot.set(PDFName.of('Last'), newlastRef);
  console.log(outlineRoot.dict)
  const registed = mergedPdf.context.register(outlineRoot)
  // 注册大纲根节点
  mergedPdf.catalog.set(PDFName.of('Outlines'), registed);

  const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: false });

  fs.writeFileSync("D:\\电子书\\new_with_outline.pdf", mergedPdfBytes);

  console.log('✅ 新 PDF 已生成，包含原始目录结构！');
})();