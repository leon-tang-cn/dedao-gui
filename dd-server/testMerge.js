const fs = require('fs-extra');
const { PDFDocument, PDFName, PDFArray, PDFString, PDFNumber } = require('pdf-lib');

(async () => {
  async function loadFile(filePath) {
    const pdfBytes = fs.readFileSync(filePath);
    return await PDFDocument.load(pdfBytes);
  }

  function processOutlineItem(pdfDoc, itemRef, level = 1) {
    let outlineItems = [];
    if (!itemRef) return;

    const item = pdfDoc.context.lookup(itemRef);
    const title = item.get(PDFName.of('Title'));

    const outlineItem = {
      title,
      level,
      page: null
    };

    // 尝试获取页码
    const destRef = item.get(PDFName.of('Dest'));
    if (destRef) {
      const pageRef = destRef.lookup(0);
      const pageIndex = pdfDoc.getPages().findIndex(
        page => {
          const findItem = pdfDoc.context.lookup(page.ref)
          if (findItem.toString() === pageRef.toString()) {
            return true;
          }
        }
      );
      if (pageIndex !== -1) {
        outlineItem.page = pageIndex;
      }
    }

    outlineItems.push(outlineItem);

    // 处理子项
    const kidsRef = item.get(PDFName.of('Kids'));
    if (kidsRef && kidsRef.isArray()) {
      kidsRef.array.forEach(kidRef => {
        outlineItems = outlineItems.concat(
          processOutlineItem(pdfDoc, kidRef, level + 1)
        )
      });
    }

    // 处理下一个同级项
    const nextRef = item.get(PDFName.of('Next'));
    if (nextRef) {
      outlineItems = outlineItems.concat(
        processOutlineItem(pdfDoc, nextRef, level)
      )
    }
    return outlineItems;
  }

  async function processPartFile(filePath, offset = 0) {

    const pdfDoc = await loadFile(filePath);
    const outlinesRef = pdfDoc.catalog.get(PDFName.of('Outlines'));
    const outlines = pdfDoc.context.lookup(outlinesRef)

    const firstItemRef = outlines.get(PDFName.of('First'));
    if (!firstItemRef) {
      return [];
    }

    // 递归解析大纲条目
    let outlineItems = processOutlineItem(pdfDoc, firstItemRef);
    outlineItems.forEach(item => {
      item.page += offset;
    })
    return { pdfDoc, outlineItems }
  }

  function createOutlineTree(pdf, items) {
    if (!items.length) return;

    const outlineRoot = pdf.context.obj({
      Type: 'Outlines',
      First: undefined,
      Last: undefined,
      Count: 0,
    });

    // let currentLevel = 1;
    // let parentStack = [outlineRoot];
    // let lastAtEachLevel = {};
    let prevBookmark = null;

    items.forEach((item, idx) => {

      // 确保 page 存在且合法
      const pageIndex = item.page;
      if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
        console.warn(`跳过无效书签，页码越界: ${pageIndex}`);
        return;
      }

      const pageRef = pdf.getPage(pageIndex).ref;

      const destArray = PDFArray.withContext(pdf.context);
      destArray.push(pageRef);
      destArray.push(PDFName.of('Fit'));

      // 创建书签对象
      const bookmark = pdf.context.obj({});
      bookmark.set(PDFName.of('Title'), item.title);
      bookmark.set(PDFName.of('Dest'), destArray);
      // bookmark.set(PDFName.of('Parent'), outlineRoot.ref);

      const ref = pdf.context.register(bookmark);

      if (prevBookmark) {
        bookmark.set(PDFName.of('Prev'), prevBookmark.ref);
        bookmark.set(PDFName.of('Next'), ref);
        console.log(prevBookmark.dict)
      } else {
        outlineRoot.set(PDFName.of('First'), ref);
      }

      prevBookmark = bookmark;

      outlineRoot.set(PDFName.of('Last'), ref);
      outlineRoot.set(PDFName.of('Count'), PDFNumber.of(idx + 1));

      // // 设置 Parent
      // const parent = parentStack[item.level - 1] || parentStack[parentStack.length - 1];
      // if (parent && parent.ref) {
      //   bookmark.set(PDFName.of('Parent'), parent.ref);
      // }

      // // 链接 Prev / Next
      // if (lastAtEachLevel[item.level]) {
      //   const prevRef = lastAtEachLevel[item.level].ref;
      //   if (prevRef) {
      //     bookmark.set(PDFName.of('Prev'), prevRef);
      //   }
      //   bookmark.set(PDFName.of('Next'), ref);
      // }

      // if (item.level > currentLevel) {
      //   const lastParent = parentStack[parentStack.length - 1];
      //   lastParent.set(PDFName.of('First'), ref);
      // } else if (item.level < currentLevel) {
      //   for (let i = item.level; i < currentLevel; i++) {
      //     const last = lastAtEachLevel[i + 1];
      //     if (last) last.set(PDFName.of('Last'), lastAtEachLevel[i + 1].ref);
      //   }
      // }

      // if (!outlineRoot.get(PDFName.of('First'))) {
      //   outlineRoot.set(PDFName.of('First'), ref);
      // }

      // outlineRoot.set(PDFName.of('Last'), ref);
      // outlineRoot.set(PDFName.of('Count'), PDFNumber.of(Number(outlineRoot.get(PDFName.of('Count')) || 0) + 1));

      // lastAtEachLevel[item.level] = bookmark;
      // parentStack[item.level] = bookmark;
      // currentLevel = item.level;
    });

    const registed = pdf.context.register(outlineRoot)
    // 注册大纲根节点
    pdf.catalog.set(PDFName.of('Outlines'), registed);
  };

  let outlineItems = [];
  const mergedPdf = await PDFDocument.create();
  const inputPaths = ["D:\\电子书\\1.pdf", "D:\\电子书\\2.pdf"];
  let offset = 0;

  for (let i = 0; i < inputPaths.length; i++) {
    let outlineObj = await processPartFile(inputPaths[i], offset)
    offset += outlineObj.pdfDoc.getPageCount()
    outlineItems = outlineItems.concat(outlineObj.outlineItems)
    const copiedPages = await mergedPdf.copyPages(outlineObj.pdfDoc, Array.from({ length: outlineObj.pdfDoc.getPageCount() }, (_, i) => i));
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }

  // console.log(outlineItems);
  createOutlineTree(mergedPdf, outlineItems);
  const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: false });

  fs.writeFileSync("D:\\电子书\\new_with_outline.pdf", mergedPdfBytes);

  console.log('✅ 新 PDF 已生成，包含原始目录结构！');

  // // 假设你只是复制源PDF的页面（也可以替换为你自己的内容）
  // const copiedPages = await mergedPdf.copyPages(pdfDoc, Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i));
  // copiedPages.forEach(page => mergedPdf.addPage(page));

  // const createOutlineTree = (pdf, items) => {
  //   if (!items.length) return;

  //   const outlineRoot = pdf.context.obj({
  //     Type: 'Outlines',
  //     First: undefined,
  //     Last: undefined,
  //     Count: 0,
  //   });

  //   let currentLevel = 1;
  //   let parentStack = [outlineRoot];
  //   let lastAtEachLevel = {};

  //   items.forEach((item, idx) => {

  //     // 确保 page 存在且合法
  //     const pageIndex = item.page;
  //     if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
  //       console.warn(`跳过无效书签，页码越界: ${pageIndex}`);
  //       return;
  //     }

  //     const pageRef = pdf.getPage(pageIndex).ref;

  //     const destArray = PDFArray.withContext(pdf.context);
  //     destArray.push(pageRef);
  //     destArray.push(PDFName.of('Fit'));

  //     const bookmark = pdf.context.obj({});
  //     bookmark.set(PDFName.of('Title'), item.title);
  //     bookmark.set(PDFName.of('Dest'), destArray);

  //     const ref = pdf.context.register(bookmark);

  //     // 设置 Parent
  //     const parent = parentStack[item.level - 1] || parentStack[parentStack.length - 1];
  //     if (parent && parent.ref) {
  //       bookmark.set(PDFName.of('Parent'), parent.ref);
  //     }

  //     // 链接 Prev / Next
  //     if (lastAtEachLevel[item.level]) {
  //       const prevRef = lastAtEachLevel[item.level].ref;
  //       bookmark.set(PDFName.of('Prev'), prevRef);
  //       pdf.context.assignXrefEntry(prevRef, PDFName.of('Next'), ref);
  //     }

  //     if (item.level > currentLevel) {
  //       const lastParent = parentStack[parentStack.length - 1];
  //       lastParent.set(PDFName.of('First'), ref);
  //     } else if (item.level < currentLevel) {
  //       for (let i = item.level; i < currentLevel; i++) {
  //         const last = lastAtEachLevel[i + 1];
  //         if (last) last.set(PDFName.of('Last'), lastAtEachLevel[i + 1].ref);
  //       }
  //     }

  //     if (!outlineRoot.get(PDFName.of('First'))) {
  //       outlineRoot.set(PDFName.of('First'), ref);
  //     }

  //     outlineRoot.set(PDFName.of('Last'), ref);
  //     outlineRoot.set(PDFName.of('Count'), PDFNumber.of(Number(outlineRoot.get(PDFName.of('Count')) || 0) + 1));

  //     lastAtEachLevel[item.level] = bookmark;
  //     parentStack[item.level] = bookmark;
  //     currentLevel = item.level;
  //   });

  //   const registed = pdf.context.register(outlineRoot)
  //   // 注册大纲根节点
  //   pdf.catalog.set(PDFName.of('Outlines'), registed);
  // };

  // createOutlineTree(mergedPdf, outlineItems);

  // const mergedPdfBytes = await mergedPdf.save({useObjectStreams: false});

  // fs.writeFileSync("D:\\电子书\\new_with_outline.pdf", mergedPdfBytes);

  // console.log('✅ 新 PDF 已生成，包含原始目录结构！');
})();