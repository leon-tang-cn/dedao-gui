const fs = require('fs-extra');
const { getDocument } = require('pdfjs-dist');
const { PDFDocument, PDFName, PDFArray, PDFNumber, PDFHexString } = require('pdf-lib');
process.stdout.setEncoding('utf8');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const zlib = require('node:zlib');
let dbFilePath = path.join(__dirname, './ddinfo.db');

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
    textRep = textRep.replace(/[\u0000-\u001F\u25A0-\u25FF]/g, '');
    textRep = textRep.replace(/\(\d+\)/g, '')
    textRep = textRep.replaceAll("…", "...")
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
    for (let j = 0; j < pageDatas.length; j++) {
      if (j < lastPageIndex) {
        continue;
      }
      if (tocTextArr.length > 1) {
        keyword = tocTextArr[1];
      } else {
        keyword = tocTextArr[0];
      }
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
      const pageIndex = getPageIndex(pageDatas, toc[i].href, lastPageIndex)
      console.log(`${toc[i].href}: ${pageIndex}`)
      if (pageIndex == "notfound") {
        console.log(`❌️ ${i}-[${toc[i].href}]-[${toc[i].text}] of [${outputPath}] not found.`)
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
    return;

    // 构建目录树
    const tocTree = buildTree(toc, mergedPdf);

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
    `select * from download_data where id = 1`
  );
  db.close();
  const pdfBytes = fs.readFileSync("./1.pdf")

  async function testPdflib() {

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(2);
    console.log(page.node)
    const image = pdfDoc.context.lookup(page.node.get(PDFName.of('Resources')).get(PDFName.of('XObject')).get(PDFName.of('X40'))).getContents()
    console.log(image)
  }

  async function testPdfjs() {
    const doc = await getDocument(pdfBytes).promise;
    const page = await doc.getPage(6);
    // console.log(page)
    const content = await page.getTextContent({ disableCombineTextItems: true, normalizeWhitespace: true });
    const contentStr = content.items.map(item => {
      return item.str
    }).join('')
    console.log(contentStr.includes('sigil_toc_id_5'))
  }

  // await testPdfjs();
  // await loadAndGenerateOutline("./1.pdf", JSON.parse(data.toc))
  await loadAndGenerateOutline("./1.pdf", [
    {
      "href": "copyright.xhtml#magic_copyright_title",
      "level": 0,
      "offset": 957,
      "playOrder": 1,
      "text": "版权信息"
    },
    {
      "href": "chapter01.xhtml#sigil_toc_id_1",
      "level": 0,
      "offset": 304,
      "playOrder": 2,
      "text": "前言 以学术研究提升学科尊严"
    },
    {
      "href": "chapter02.xhtml#sigil_toc_id_2",
      "level": 0,
      "offset": 304,
      "playOrder": 3,
      "text": "第一篇 思想政治教育的经典文本发掘"
    },
    {
      "href": "chapter03.xhtml#sigil_toc_id_3",
      "level": 1,
      "offset": 304,
      "playOrder": 4,
      "text": "一、马克思主义经典作家论思想政治教育的意义"
    },
    {
      "href": "chapter03.xhtml#sigil_toc_id_4",
      "level": 2,
      "offset": 994,
      "playOrder": 5,
      "text": "（一）统治阶级的思想在每一时代都是占统治地位的思想"
    },
    {
      "href": "chapter03.xhtml#sigil_toc_id_5",
      "level": 2,
      "offset": 9349,
      "playOrder": 6,
      "text": "（二）工人运动必须有科学的理论指导"
    },
    {
      "href": "chapter03.xhtml#sigil_toc_id_6",
      "level": 2,
      "offset": 16912,
      "playOrder": 7,
      "text": "（三）要从外部向工人群众灌输社会主义意识"
    },
    {
      "href": "chapter03.xhtml#sigil_toc_id_7",
      "level": 2,
      "offset": 27367,
      "playOrder": 8,
      "text": "（四）要加强无产阶级政党的宣传工作和政治教育"
    },
    {
      "href": "chapter04.xhtml#sigil_toc_id_8",
      "level": 1,
      "offset": 304,
      "playOrder": 9,
      "text": "二、《德国民间故事书》的思想政治教育意蕴"
    },
    {
      "href": "chapter04.xhtml#sigil_toc_id_9",
      "level": 2,
      "offset": 913,
      "playOrder": 10,
      "text": "（一）民间故事书承担着社会教化的重要使命"
    },
    {
      "href": "chapter04.xhtml#sigil_toc_id_10",
      "level": 2,
      "offset": 6059,
      "playOrder": 11,
      "text": "（二）民间故事书应具备的品格"
    },
    {
      "href": "chapter04.xhtml#sigil_toc_id_11",
      "level": 2,
      "offset": 13332,
      "playOrder": 12,
      "text": "（三）根据时代和人民的需要对民间故事书进行加工和改写"
    },
    {
      "href": "chapter04.xhtml#sigil_toc_id_12",
      "level": 2,
      "offset": 17729,
      "playOrder": 13,
      "text": "（四）如何看待恩格斯早期著作中的思想政治教育思想"
    },
    {
      "href": "chapter05.xhtml#sigil_toc_id_13",
      "level": 1,
      "offset": 304,
      "playOrder": 14,
      "text": "三、《〈黑格尔法哲学批判〉导言》的思想政治教育意蕴"
    },
    {
      "href": "chapter05.xhtml#sigil_toc_id_14",
      "level": 2,
      "offset": 941,
      "playOrder": 15,
      "text": "（一）丰富的思想政治教育学思想"
    },
    {
      "href": "chapter05.xhtml#sigil_toc_id_15",
      "level": 2,
      "offset": 8496,
      "playOrder": 16,
      "text": "（二）严整的思想政治教育学命题"
    },
    {
      "href": "chapter05.xhtml#sigil_toc_id_16",
      "level": 2,
      "offset": 24869,
      "playOrder": 17,
      "text": "（三）重要的思想政治教育学地位"
    },
    {
      "href": "chapter06.xhtml#sigil_toc_id_17",
      "level": 1,
      "offset": 304,
      "playOrder": 18,
      "text": "四、《共产党宣言》的思想政治教育价值"
    },
    {
      "href": "chapter07.xhtml#sigil_toc_id_18",
      "level": 1,
      "offset": 304,
      "playOrder": 19,
      "text": "五、《反杜林论》中的思想政治教育论断"
    },
    {
      "href": "chapter07.xhtml#sigil_toc_id_19",
      "level": 2,
      "offset": 1057,
      "playOrder": 20,
      "text": "（一）没有任何一种力量能够强制每一个健康清醒的人接受某种思想"
    },
    {
      "href": "chapter07.xhtml#sigil_toc_id_20",
      "level": 2,
      "offset": 7725,
      "playOrder": 21,
      "text": "（二）平等观念在现代社会主义运动中仍具有巨大的鼓动价值"
    },
    {
      "href": "chapter07.xhtml#sigil_toc_id_21",
      "level": 2,
      "offset": 12230,
      "playOrder": 22,
      "text": "（三）每一次革命的胜利都带来道德上和精神上的巨大跃进"
    },
    {
      "href": "chapter07.xhtml#sigil_toc_id_22",
      "level": 2,
      "offset": 18585,
      "playOrder": 23,
      "text": "（四）现代社会主义必胜的信心来源于社会发展中可感触的物质事实"
    },
    {
      "href": "chapter08.xhtml#sigil_toc_id_23",
      "level": 0,
      "offset": 304,
      "playOrder": 24,
      "text": "第二篇 思想政治教育的基本理论阐释"
    },
    {
      "href": "chapter09.xhtml#sigil_toc_id_24",
      "level": 1,
      "offset": 304,
      "playOrder": 25,
      "text": "一、思想教育与思想自由的关系"
    },
    {
      "href": "chapter09.xhtml#sigil_toc_id_25",
      "level": 2,
      "offset": 1181,
      "playOrder": 26,
      "text": "（一）马克思主义追求并尊重人的思想自由"
    },
    {
      "href": "chapter09.xhtml#sigil_toc_id_26",
      "level": 2,
      "offset": 8927,
      "playOrder": 27,
      "text": "（二）思想教育着力于思想自由基础上的引导"
    },
    {
      "href": "chapter09.xhtml#sigil_toc_id_27",
      "level": 2,
      "offset": 16772,
      "playOrder": 28,
      "text": "（三）不能用抽象的思想自由来否定思想教育的合法性"
    },
    {
      "href": "chapter10.xhtml#sigil_toc_id_28",
      "level": 1,
      "offset": 304,
      "playOrder": 29,
      "text": "二、思想政治教育的个人价值"
    },
    {
      "href": "chapter10.xhtml#sigil_toc_id_29",
      "level": 2,
      "offset": 1265,
      "playOrder": 30,
      "text": "（一）思想政治教育不仅具有重要的社会价值，而且具有不可忽视的个人价值"
    },
    {
      "href": "chapter10.xhtml#sigil_toc_id_30",
      "level": 2,
      "offset": 7281,
      "playOrder": 31,
      "text": "（二）思想政治教育在人的社会化方面的价值"
    },
    {
      "href": "chapter10.xhtml#sigil_toc_id_31",
      "level": 2,
      "offset": 11308,
      "playOrder": 32,
      "text": "（三）思想政治教育在人的全面发展方面的价值"
    },
    {
      "href": "chapter10.xhtml#sigil_toc_id_32",
      "level": 2,
      "offset": 15017,
      "playOrder": 33,
      "text": "（四）思想政治教育在解决人生课题方面的价值"
    },
    {
      "href": "chapter11.xhtml#sigil_toc_id_33",
      "level": 1,
      "offset": 304,
      "playOrder": 34,
      "text": "三、思想政治教育主客体难题的哲学求解"
    },
    {
      "href": "chapter11.xhtml#sigil_toc_id_34",
      "level": 2,
      "offset": 1091,
      "playOrder": 35,
      "text": "（一）如何安顿受教育者的能动性？"
    },
    {
      "href": "chapter11.xhtml#sigil_toc_id_35",
      "level": 2,
      "offset": 5538,
      "playOrder": 36,
      "text": "（二）从主体性中找出路"
    },
    {
      "href": "chapter11.xhtml#sigil_toc_id_36",
      "level": 2,
      "offset": 11650,
      "playOrder": 37,
      "text": "（三）反思哲学上的主客体范畴"
    },
    {
      "href": "chapter11.xhtml#sigil_toc_id_37",
      "level": 2,
      "offset": 19658,
      "playOrder": 38,
      "text": "（四）剖析主客体角色的内涵"
    },
    {
      "href": "chapter11.xhtml#sigil_toc_id_38",
      "level": 2,
      "offset": 30387,
      "playOrder": 39,
      "text": "（五）简单的解决方案"
    },
    {
      "href": "chapter12.xhtml#sigil_toc_id_39",
      "level": 1,
      "offset": 304,
      "playOrder": 40,
      "text": "四、思想政治教育的真理魅力"
    },
    {
      "href": "chapter12.xhtml#sigil_toc_id_40",
      "level": 2,
      "offset": 848,
      "playOrder": 41,
      "text": "（一）马克思主义思想政治教育的人性假设"
    },
    {
      "href": "chapter12.xhtml#sigil_toc_id_41",
      "level": 2,
      "offset": 6316,
      "playOrder": 42,
      "text": "（二）充分展现马克思主义的真理魅力"
    },
    {
      "href": "chapter12.xhtml#sigil_toc_id_42",
      "level": 2,
      "offset": 16184,
      "playOrder": 43,
      "text": "（三）也要讲讲其他的道理"
    },
    {
      "href": "chapter12.xhtml#sigil_toc_id_43",
      "level": 2,
      "offset": 19203,
      "playOrder": 44,
      "text": "（四）“真理的魅力”与“思想的魅力”"
    },
    {
      "href": "chapter12.xhtml#sigil_toc_id_44",
      "level": 2,
      "offset": 24364,
      "playOrder": 45,
      "text": "（五）“真理魅力”的认识论意义与价值观意义"
    },
    {
      "href": "chapter12.xhtml#sigil_toc_id_45",
      "level": 2,
      "offset": 29615,
      "playOrder": 46,
      "text": "（六）“魅力”的实质及对思想政治教育的启示"
    },
    {
      "href": "chapter13.xhtml#sigil_toc_id_46",
      "level": 1,
      "offset": 304,
      "playOrder": 47,
      "text": "五、思想政治教育的基本规律"
    },
    {
      "href": "chapter13.xhtml#sigil_toc_id_47",
      "level": 2,
      "offset": 1445,
      "playOrder": 48,
      "text": "（一）确认思想政治教育规律的客观存在和基本属性"
    },
    {
      "href": "chapter13.xhtml#sigil_toc_id_48",
      "level": 2,
      "offset": 7797,
      "playOrder": 49,
      "text": "（二）划分思想政治教育规律的基本领域和主要方面"
    },
    {
      "href": "chapter13.xhtml#sigil_toc_id_49",
      "level": 2,
      "offset": 16597,
      "playOrder": 50,
      "text": "（三）形成思想政治教育规律的理论内容和经典概括"
    },
    {
      "href": "chapter13.xhtml#sigil_toc_id_50",
      "level": 2,
      "offset": 23141,
      "playOrder": 51,
      "text": "（四）明确思想政治教育规律运用的规则和限制"
    },
    {
      "href": "chapter14.xhtml#sigil_toc_id_51",
      "level": 1,
      "offset": 304,
      "playOrder": 52,
      "text": "六、思想政治教育的主渠道与微循环"
    },
    {
      "href": "chapter14.xhtml#sigil_toc_id_52",
      "level": 2,
      "offset": 1546,
      "playOrder": 53,
      "text": "（一）思想政治教育的渠道与渠道网络"
    },
    {
      "href": "chapter14.xhtml#sigil_toc_id_53",
      "level": 2,
      "offset": 4154,
      "playOrder": 54,
      "text": "（二）思想政治教育的主渠道与微循环及其关系"
    },
    {
      "href": "chapter14.xhtml#sigil_toc_id_54",
      "level": 2,
      "offset": 7221,
      "playOrder": 55,
      "text": "（三）当前的主要问题：主渠道超载，微循环闲置"
    },
    {
      "href": "chapter14.xhtml#sigil_toc_id_55",
      "level": 2,
      "offset": 10513,
      "playOrder": 56,
      "text": "（四）破解之道：激活微循环，疏通主渠道"
    },
    {
      "href": "chapter15.xhtml#sigil_toc_id_56",
      "level": 1,
      "offset": 304,
      "playOrder": 57,
      "text": "七、思想政治教育过程中的重复施教"
    },
    {
      "href": "chapter15.xhtml#sigil_toc_id_57",
      "level": 2,
      "offset": 821,
      "playOrder": 58,
      "text": "（一）思想政治教育过程中存在着较多的重复施教现象"
    },
    {
      "href": "chapter15.xhtml#sigil_toc_id_58",
      "level": 2,
      "offset": 3126,
      "playOrder": 59,
      "text": "（二）一定的重复施教是必要的"
    },
    {
      "href": "chapter15.xhtml#sigil_toc_id_59",
      "level": 2,
      "offset": 8185,
      "playOrder": 60,
      "text": "（三）必要的重复与多余的重复"
    },
    {
      "href": "chapter15.xhtml#sigil_toc_id_60",
      "level": 2,
      "offset": 11336,
      "playOrder": 61,
      "text": "（四）过多的重复会影响教育的实效性"
    },
    {
      "href": "chapter15.xhtml#sigil_toc_id_61",
      "level": 2,
      "offset": 14307,
      "playOrder": 62,
      "text": "（五）努力减少重复施教带来的弊端"
    },
    {
      "href": "chapter16.xhtml#sigil_toc_id_62",
      "level": 1,
      "offset": 304,
      "playOrder": 63,
      "text": "八、思想政治教育的科学化"
    },
    {
      "href": "chapter16.xhtml#sigil_toc_id_63",
      "level": 2,
      "offset": 698,
      "playOrder": 64,
      "text": "（一）思想政治教育科学化的含义"
    },
    {
      "href": "chapter16.xhtml#sigil_toc_id_64",
      "level": 2,
      "offset": 5159,
      "playOrder": 65,
      "text": "（二）思想政治教育学术研究的科学化"
    },
    {
      "href": "chapter16.xhtml#sigil_toc_id_65",
      "level": 2,
      "offset": 12134,
      "playOrder": 66,
      "text": "（三）思想政治教育人才培养的科学化"
    },
    {
      "href": "chapter16.xhtml#sigil_toc_id_66",
      "level": 2,
      "offset": 15812,
      "playOrder": 67,
      "text": "（四）思想政治教育实际工作的科学化"
    },
    {
      "href": "chapter16.xhtml#sigil_toc_id_67",
      "level": 2,
      "offset": 19835,
      "playOrder": 68,
      "text": "（五）在思想政治教育科学化方面需要处理好的几种关系"
    },
    {
      "href": "chapter17.xhtml#sigil_toc_id_68",
      "level": 0,
      "offset": 304,
      "playOrder": 69,
      "text": "第三篇 思想政治教育的知识体系建构"
    },
    {
      "href": "chapter18.xhtml#sigil_toc_id_69",
      "level": 1,
      "offset": 304,
      "playOrder": 70,
      "text": "一、思想政治教育的学科独立性"
    },
    {
      "href": "chapter18.xhtml#sigil_toc_id_70",
      "level": 2,
      "offset": 1442,
      "playOrder": 71,
      "text": "（一）思想政治教育的学科对象是独特而不可替代的"
    },
    {
      "href": "chapter18.xhtml#sigil_toc_id_71",
      "level": 2,
      "offset": 7348,
      "playOrder": 72,
      "text": "（二）思想政治教育的学科基础是独特而不可替代的"
    },
    {
      "href": "chapter18.xhtml#sigil_toc_id_72",
      "level": 2,
      "offset": 12932,
      "playOrder": 73,
      "text": "（三）思想政治教育的学科地位是独特而不可替代的"
    },
    {
      "href": "chapter18.xhtml#sigil_toc_id_73",
      "level": 2,
      "offset": 18132,
      "playOrder": 74,
      "text": "（四）思想政治教育的学科体系是独特而不可替代的"
    },
    {
      "href": "chapter18.xhtml#sigil_toc_id_74",
      "level": 2,
      "offset": 25557,
      "playOrder": 75,
      "text": "（五）思想政治教育的学科价值是独特而不可替代的"
    },
    {
      "href": "chapter19.xhtml#sigil_toc_id_75",
      "level": 1,
      "offset": 304,
      "playOrder": 76,
      "text": "二、思想政治教育的学科内涵及建设思路"
    },
    {
      "href": "chapter19.xhtml#sigil_toc_id_76",
      "level": 2,
      "offset": 1084,
      "playOrder": 77,
      "text": "（一）思想政治教育的学科内涵"
    },
    {
      "href": "chapter19.xhtml#sigil_toc_id_77",
      "level": 2,
      "offset": 10694,
      "playOrder": 78,
      "text": "（二）思想政治教育学科的研究领域"
    },
    {
      "href": "chapter19.xhtml#sigil_toc_id_78",
      "level": 2,
      "offset": 18507,
      "playOrder": 79,
      "text": "（三）思想政治教育学科的人才培养"
    },
    {
      "href": "chapter20.xhtml#sigil_toc_id_79",
      "level": 1,
      "offset": 304,
      "playOrder": 80,
      "text": "三、思想政治教育的内容形态"
    },
    {
      "href": "chapter20.xhtml#sigil_toc_id_80",
      "level": 2,
      "offset": 1226,
      "playOrder": 81,
      "text": "（一）思想观念形态"
    },
    {
      "href": "chapter20.xhtml#sigil_toc_id_81",
      "level": 2,
      "offset": 5718,
      "playOrder": 82,
      "text": "（二）精神品格形态"
    },
    {
      "href": "chapter20.xhtml#sigil_toc_id_82",
      "level": 2,
      "offset": 9535,
      "playOrder": 83,
      "text": "（三）行为规范形态"
    },
    {
      "href": "chapter20.xhtml#sigil_toc_id_83",
      "level": 2,
      "offset": 14108,
      "playOrder": 84,
      "text": "（四）心理情感形态"
    },
    {
      "href": "chapter20.xhtml#sigil_toc_id_84",
      "level": 2,
      "offset": 18614,
      "playOrder": 85,
      "text": "（五）四种基本形态的关系"
    },
    {
      "href": "chapter21.xhtml#sigil_toc_id_85",
      "level": 1,
      "offset": 304,
      "playOrder": 86,
      "text": "四、思想政治教育的理论研究方法"
    },
    {
      "href": "chapter21.xhtml#sigil_toc_id_86",
      "level": 2,
      "offset": 1118,
      "playOrder": 87,
      "text": "（一）理论研究方法的内涵与特点"
    },
    {
      "href": "chapter21.xhtml#sigil_toc_id_87",
      "level": 2,
      "offset": 10823,
      "playOrder": 88,
      "text": "（二）思想政治教育学研究中的概念辨析"
    },
    {
      "href": "chapter21.xhtml#sigil_toc_id_88",
      "level": 2,
      "offset": 16806,
      "playOrder": 89,
      "text": "（三）思想政治教育学研究中的命题阐释"
    },
    {
      "href": "chapter21.xhtml#sigil_toc_id_89",
      "level": 2,
      "offset": 21718,
      "playOrder": 90,
      "text": "（四）思想政治教育学研究中的体系建构"
    },
    {
      "href": "chapter21.xhtml#sigil_toc_id_90",
      "level": 2,
      "offset": 25913,
      "playOrder": 91,
      "text": "（五）思想政治教育学研究中的分层叙述"
    },
    {
      "href": "chapter22.xhtml#sigil_toc_id_91",
      "level": 1,
      "offset": 304,
      "playOrder": 92,
      "text": "五、选列思想政治教育的基本文献"
    },
    {
      "href": "chapter22.xhtml#sigil_toc_id_92",
      "level": 2,
      "offset": 737,
      "playOrder": 93,
      "text": "（一）从中国人民大学开设博士生基本文献课程谈起"
    },
    {
      "href": "chapter22.xhtml#sigil_toc_id_93",
      "level": 2,
      "offset": 2778,
      "playOrder": 94,
      "text": "（二）选列思想政治教育基本文献的必要性"
    },
    {
      "href": "chapter22.xhtml#sigil_toc_id_94",
      "level": 2,
      "offset": 6817,
      "playOrder": 95,
      "text": "（三）选列思想政治教育基本文献的原则和做法"
    },
    {
      "href": "chapter23.xhtml#sigil_toc_id_95",
      "level": 1,
      "offset": 304,
      "playOrder": 96,
      "text": "六、思想政治教育学理论基础的体系建构"
    },
    {
      "href": "chapter23.xhtml#sigil_toc_id_96",
      "level": 2,
      "offset": 1211,
      "playOrder": 97,
      "text": "（一）“思想政治教育学理论基础”的必要性"
    },
    {
      "href": "chapter23.xhtml#sigil_toc_id_97",
      "level": 2,
      "offset": 6000,
      "playOrder": 98,
      "text": "（二）“思想政治教育学理论基础”的科学内涵"
    },
    {
      "href": "chapter23.xhtml#sigil_toc_id_98",
      "level": 2,
      "offset": 12355,
      "playOrder": 99,
      "text": "（三）“思想政治教育学理论基础”的层次架构"
    },
    {
      "href": "chapter24.xhtml#sigil_toc_id_99",
      "level": 1,
      "offset": 304,
      "playOrder": 100,
      "text": "七、思想政治教育内容体系的学理化建构"
    },
    {
      "href": "chapter24.xhtml#sigil_toc_id_100",
      "level": 2,
      "offset": 1025,
      "playOrder": 101,
      "text": "（一）思想政治教育内容体系学理化建构的重要意义"
    },
    {
      "href": "chapter24.xhtml#sigil_toc_id_101",
      "level": 2,
      "offset": 5252,
      "playOrder": 102,
      "text": "（二）“思想政治教育内容体系”的概念辨析"
    },
    {
      "href": "chapter24.xhtml#sigil_toc_id_102",
      "level": 2,
      "offset": 14749,
      "playOrder": 103,
      "text": "（三）“思想政治教育内容体系”的基本特点"
    },
    {
      "href": "chapter24.xhtml#sigil_toc_id_103",
      "level": 2,
      "offset": 24117,
      "playOrder": 104,
      "text": "（四）“思想政治教育内容体系”的把握方式"
    },
    {
      "href": "chapter24.xhtml#sigil_toc_id_104",
      "level": 2,
      "offset": 30995,
      "playOrder": 105,
      "text": "（五）思想政治教育内容体系的建构方案"
    },
    {
      "href": "chapter25.xhtml#sigil_toc_id_105",
      "level": 1,
      "offset": 304,
      "playOrder": 106,
      "text": "八、哲学思维在建构思想政治教育学原理中的运用"
    },
    {
      "href": "chapter25.xhtml#sigil_toc_id_106",
      "level": 2,
      "offset": 990,
      "playOrder": 107,
      "text": "（一）思想政治教育学原理建构中哲学思维运用的必要性"
    },
    {
      "href": "chapter25.xhtml#sigil_toc_id_107",
      "level": 2,
      "offset": 7163,
      "playOrder": 108,
      "text": "（二）把握好运用哲学思维特别是哲学概念的度"
    },
    {
      "href": "chapter25.xhtml#sigil_toc_id_108",
      "level": 2,
      "offset": 13260,
      "playOrder": 109,
      "text": "（三）必要的分支学科：思想政治教育哲学"
    },
    {
      "href": "chapter26.xhtml#sigil_toc_id_109",
      "level": 1,
      "offset": 304,
      "playOrder": 110,
      "text": "九、思想政治教育学自主知识体系的建构"
    },
    {
      "href": "chapter26.xhtml#sigil_toc_id_110",
      "level": 2,
      "offset": 1285,
      "playOrder": 111,
      "text": "（一）“建构中国自主知识体系”的思想内涵与基本要求"
    },
    {
      "href": "chapter26.xhtml#sigil_toc_id_111",
      "level": 2,
      "offset": 7707,
      "playOrder": 112,
      "text": "（二）增强思想政治教育学科的自主性意识"
    },
    {
      "href": "chapter26.xhtml#sigil_toc_id_112",
      "level": 2,
      "offset": 11522,
      "playOrder": 113,
      "text": "（三）注重思想政治教育学科的知识化"
    },
    {
      "href": "chapter26.xhtml#sigil_toc_id_113",
      "level": 2,
      "offset": 18631,
      "playOrder": 114,
      "text": "（四）推进思想政治教育学科的体系性建构"
    },
    {
      "href": "chapter27.xhtml#sigil_toc_id_114",
      "level": 0,
      "offset": 304,
      "playOrder": 115,
      "text": "第四篇 思想政治教育的时代创新发展"
    },
    {
      "href": "chapter28.xhtml#sigil_toc_id_115",
      "level": 1,
      "offset": 304,
      "playOrder": 116,
      "text": "一、新时代思想政治教育的精神气质"
    },
    {
      "href": "chapter28.xhtml#sigil_toc_id_116",
      "level": 2,
      "offset": 1050,
      "playOrder": 117,
      "text": "（一）学习把握新时代的新思想、新论断、新提法"
    },
    {
      "href": "chapter28.xhtml#sigil_toc_id_117",
      "level": 2,
      "offset": 3668,
      "playOrder": 118,
      "text": "（二）新时代的精神状态与风貌"
    },
    {
      "href": "chapter28.xhtml#sigil_toc_id_118",
      "level": 2,
      "offset": 6913,
      "playOrder": 119,
      "text": "（三）新时代思想政治教育的精神气质"
    },
    {
      "href": "chapter29.xhtml#sigil_toc_id_119",
      "level": 1,
      "offset": 304,
      "playOrder": 120,
      "text": "二、激活思想是思想政治教育的重要功能"
    },
    {
      "href": "chapter29.xhtml#sigil_toc_id_120",
      "level": 2,
      "offset": 744,
      "playOrder": 121,
      "text": "（一）思想政治教育不仅要传授思想，而且要激活思想"
    },
    {
      "href": "chapter29.xhtml#sigil_toc_id_121",
      "level": 2,
      "offset": 8522,
      "playOrder": 122,
      "text": "（二）激活思想就是让既有思想重新具有活力"
    },
    {
      "href": "chapter29.xhtml#sigil_toc_id_122",
      "level": 2,
      "offset": 13702,
      "playOrder": 123,
      "text": "（三）思想政治教育要善于激活思想"
    },
    {
      "href": "chapter30.xhtml#sigil_toc_id_123",
      "level": 1,
      "offset": 304,
      "playOrder": 124,
      "text": "三、减压是现代思想政治教育的新职责"
    },
    {
      "href": "chapter30.xhtml#sigil_toc_id_124",
      "level": 2,
      "offset": 1071,
      "playOrder": 125,
      "text": "（一）思想政治教育既要为人们增动力又要替人们减压力"
    },
    {
      "href": "chapter30.xhtml#sigil_toc_id_125",
      "level": 2,
      "offset": 3458,
      "playOrder": 126,
      "text": "（二）“减压”是思想政治教育功能的应有之义"
    },
    {
      "href": "chapter30.xhtml#sigil_toc_id_126",
      "level": 2,
      "offset": 6403,
      "playOrder": 127,
      "text": "（三）思想政治教育能够从多方面发挥减压作用"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_127",
      "level": 1,
      "offset": 304,
      "playOrder": 128,
      "text": "四、思想政治教育的话语转换"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_128",
      "level": 2,
      "offset": 690,
      "playOrder": 129,
      "text": "（一）思想政治教育话语转换的特殊重要性"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_129",
      "level": 2,
      "offset": 5992,
      "playOrder": 130,
      "text": "（二）思想政治教育话语转换的基本路径"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_130",
      "level": 2,
      "offset": 20750,
      "playOrder": 131,
      "text": "（三）思想政治教育话语转换的其他路径"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_131",
      "level": 2,
      "offset": 27379,
      "playOrder": 132,
      "text": "（四）社会主义核心价值观：一种新的话语系统"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_132",
      "level": 2,
      "offset": 32067,
      "playOrder": 133,
      "text": "（五）用价值观话语来表述思想政治教育话题"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_133",
      "level": 2,
      "offset": 37589,
      "playOrder": 134,
      "text": "（六）思想政治教育应掌握自由、平等的话语权"
    },
    {
      "href": "chapter31.xhtml#sigil_toc_id_134",
      "level": 2,
      "offset": 40144,
      "playOrder": 135,
      "text": "（七）思想政治教育应发挥柔性话语的亲和力量"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_135",
      "level": 1,
      "offset": 304,
      "playOrder": 136,
      "text": "五、改革开放以来思想政治工作的十八个转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_136",
      "level": 2,
      "offset": 801,
      "playOrder": 137,
      "text": "（一）从实施领导向注重服务的转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_137",
      "level": 2,
      "offset": 2951,
      "playOrder": 138,
      "text": "（二）从“以事为本”向“以人为本”转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_138",
      "level": 2,
      "offset": 4057,
      "playOrder": 139,
      "text": "（三）从泛政治化到以政治为核心的综合文化转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_139",
      "level": 2,
      "offset": 6519,
      "playOrder": 140,
      "text": "（四）从“小政工”向“大政工”格局转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_140",
      "level": 2,
      "offset": 11072,
      "playOrder": 141,
      "text": "（五）从孤立地解决思想问题，向解决思想问题与解决实际问题相结合转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_141",
      "level": 2,
      "offset": 13099,
      "playOrder": 142,
      "text": "（六）从单纯工作视野向工作与生活视野的融合转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_142",
      "level": 2,
      "offset": 15609,
      "playOrder": 143,
      "text": "（七）从超功利教育向关照物质利益与引导精神追求相结合转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_143",
      "level": 2,
      "offset": 18053,
      "playOrder": 144,
      "text": "（八）从单纯增动力向增动力与减压力相结合转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_144",
      "level": 2,
      "offset": 19768,
      "playOrder": 145,
      "text": "（九）以集中型、运动式思想政治工作为主向日常性、渗透式思想政治工作为主转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_145",
      "level": 2,
      "offset": 21579,
      "playOrder": 146,
      "text": "（十）从单向灌输向双向对话转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_146",
      "level": 2,
      "offset": 24218,
      "playOrder": 147,
      "text": "（十一）从常规被动型向主动创造型转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_147",
      "level": 2,
      "offset": 25999,
      "playOrder": 148,
      "text": "（十二）从外部实施教育向发动群众自我教育转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_148",
      "level": 2,
      "offset": 27674,
      "playOrder": 149,
      "text": "（十三）从权威指令式向平等商量式转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_149",
      "level": 2,
      "offset": 28873,
      "playOrder": 150,
      "text": "（十四）从政治优势向政治优势与专业优势相结合转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_150",
      "level": 2,
      "offset": 30570,
      "playOrder": 151,
      "text": "（十五）从只允许一种道理向引领各种不同思想转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_151",
      "level": 2,
      "offset": 31754,
      "playOrder": 152,
      "text": "（十六）从注重说理向情理交融转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_152",
      "level": 2,
      "offset": 33214,
      "playOrder": 153,
      "text": "（十七）从只讲大道理向大小道理相结合转变"
    },
    {
      "href": "chapter32.xhtml#sigil_toc_id_153",
      "level": 2,
      "offset": 34911,
      "playOrder": 154,
      "text": "（十八）从主要依靠传统媒体向更多地利用新兴媒体转变"
    },
    {
      "href": "chapter33.xhtml#sigil_toc_id_154",
      "level": 0,
      "offset": 304,
      "playOrder": 155,
      "text": "主要参考文献"
    },
    {
      "href": "chapter34.xhtml#sigil_toc_id_155",
      "level": 0,
      "offset": 304,
      "playOrder": 156,
      "text": "后记"
    }
  ])
  return;
  // const keywords = JSON.parse(data.contents)

  // const pageBytes = pdfDoc.context.lookup(page.node.get(PDFName.of('Contents'))).getContents();
  // console.log(pageBytes)

  // zlib.unzip(pageBytes, (err, result) => {
  //   console.log(result.toString())
  // })


  // let contentStr = content.items.map(item => {
  //   return item.str
  // }).join('');
  // contentStr = contentStr.replaceAll(" ", "");
  // contentStr = contentStr.replace(/(\r\n|\n|\r)/g, '');
  // contentStr = contentStr.replace(/\r/g, '');
  // contentStr = contentStr.replace(/^\uFEFF/, '');
  // contentStr = contentStr.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // contentStr = contentStr.replace(/[\u0000-\u001F\u25A0-\u25FF]/g, '');
  // contentStr = JSON.stringify(contentStr)
  // console.log(contentStr)
  // console.log(JSON.stringify(keywords[0]).replace(/\(\d+\)/g, ''))


})();