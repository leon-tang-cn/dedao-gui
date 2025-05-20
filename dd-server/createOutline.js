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
        keyword = `[${tocTextArr[1]}]`;
      } else {
        keyword = `[${tocTextArr[0]}]`;
      }
      if (pageDatas[j].content.includes(keyword)) {
        console.log(pageDatas[j].content, keyword, lastPageIndex)
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
      if (contentStr.indexOf("V01-cov1_1") > -1) {
        console.log(`found ${i}`)
      }
      pageDatas.push({
        index: i - 1,
        content: contentStr
      });
    }

    // 遍历toc，创建书签对象
    let lastPageIndex = 0;
    for (let i = 0; i < toc.length; i++) {
      if (toc[i].href != "chapter0_0008.xhtml#sigil_toc_id_46") {
        continue;
      }
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
    const page = await doc.getPage(71);
    // console.log(page)
    const content = await page.getTextContent({ disableCombineTextItems: true, normalizeWhitespace: true });
    const contentStr = content.items.map(item => {
      return item.str
    }).join('')
    console.log(contentStr, contentStr.includes('sigil_toc_id_46'))
  }

  await testPdfjs();
  return;
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
      "href": "chapter0.xhtml#title",
      "level": 0,
      "offset": 386,
      "playOrder": 2,
      "text": "序"
    },
    {
      "href": "chapter0_0001.xhtml#sigil_toc_id_1",
      "level": 0,
      "offset": 386,
      "playOrder": 3,
      "text": "第1章 不能丢失真实的自我"
    },
    {
      "href": "chapter0_0001.xhtml#sigil_toc_id_2",
      "level": 1,
      "offset": 778,
      "playOrder": 4,
      "text": "认清自己，做自己的主人"
    },
    {
      "href": "chapter0_0001.xhtml#sigil_toc_id_3",
      "level": 1,
      "offset": 8374,
      "playOrder": 5,
      "text": "不失本色，保持纯朴的面目"
    },
    {
      "href": "chapter0_0001.xhtml#sigil_toc_id_4",
      "level": 1,
      "offset": 15822,
      "playOrder": 6,
      "text": "人无信而不立"
    },
    {
      "href": "chapter0_0001.xhtml#sigil_toc_id_5",
      "level": 1,
      "offset": 20218,
      "playOrder": 7,
      "text": "不要虚荣，做最真实的自己"
    },
    {
      "href": "chapter0_0001.xhtml#sigil_toc_id_6",
      "level": 1,
      "offset": 28147,
      "playOrder": 8,
      "text": "丢下包袱，不要为外物所累"
    },
    {
      "href": "chapter0_0002.xhtml#sigil_toc_id_7",
      "level": 0,
      "offset": 386,
      "playOrder": 9,
      "text": "第2章 不能丢失善良的本性"
    },
    {
      "href": "chapter0_0002.xhtml#sigil_toc_id_8",
      "level": 1,
      "offset": 868,
      "playOrder": 10,
      "text": "勿以恶小而为之，勿以善小而不为"
    },
    {
      "href": "chapter0_0002.xhtml#sigil_toc_id_9",
      "level": 1,
      "offset": 9012,
      "playOrder": 11,
      "text": "赠人玫瑰之手，经久犹有余香"
    },
    {
      "href": "chapter0_0002.xhtml#sigil_toc_id_10",
      "level": 1,
      "offset": 14686,
      "playOrder": 12,
      "text": "乐善好施是一种智慧投资"
    },
    {
      "href": "chapter0_0002.xhtml#sigil_toc_id_11",
      "level": 1,
      "offset": 22162,
      "playOrder": 13,
      "text": "积小善终成大德，积小功终成大功"
    },
    {
      "href": "chapter0_0002.xhtml#sigil_toc_id_12",
      "level": 1,
      "offset": 27278,
      "playOrder": 14,
      "text": "少一份冷漠，多一份善念"
    },
    {
      "href": "chapter0_0003.xhtml#sigil_toc_id_13",
      "level": 0,
      "offset": 386,
      "playOrder": 15,
      "text": "第3章 不能丢失美好的心态"
    },
    {
      "href": "chapter0_0003.xhtml#sigil_toc_id_14",
      "level": 1,
      "offset": 1022,
      "playOrder": 16,
      "text": "自己的微笑是世界上最美丽的"
    },
    {
      "href": "chapter0_0003.xhtml#sigil_toc_id_15",
      "level": 1,
      "offset": 8488,
      "playOrder": 17,
      "text": "成功是经验的累积"
    },
    {
      "href": "chapter0_0003.xhtml#sigil_toc_id_16",
      "level": 1,
      "offset": 14391,
      "playOrder": 18,
      "text": "凡事往好处想，好事会从凡事来"
    },
    {
      "href": "chapter0_0003.xhtml#sigil_toc_id_17",
      "level": 1,
      "offset": 21804,
      "playOrder": 19,
      "text": "永远怀有一颗感恩的心"
    },
    {
      "href": "chapter0_0003.xhtml#sigil_toc_id_18",
      "level": 1,
      "offset": 27388,
      "playOrder": 20,
      "text": "冷静平和，心如止水"
    },
    {
      "href": "chapter0_0004.xhtml#sigil_toc_id_19",
      "level": 0,
      "offset": 386,
      "playOrder": 21,
      "text": "第4章 不涂不要真傻"
    },
    {
      "href": "chapter0_0004.xhtml#sigil_toc_id_20",
      "level": 1,
      "offset": 818,
      "playOrder": 22,
      "text": "大智若愚是智者的自保方式"
    },
    {
      "href": "chapter0_0004.xhtml#sigil_toc_id_21",
      "level": 1,
      "offset": 5601,
      "playOrder": 23,
      "text": "难得糊涂真聪明"
    },
    {
      "href": "chapter0_0004.xhtml#sigil_toc_id_22",
      "level": 1,
      "offset": 11704,
      "playOrder": 24,
      "text": "睁一只眼，闭一只眼"
    },
    {
      "href": "chapter0_0004.xhtml#sigil_toc_id_23",
      "level": 1,
      "offset": 16136,
      "playOrder": 25,
      "text": "大智若愚，大巧若拙"
    },
    {
      "href": "chapter0_0004.xhtml#sigil_toc_id_24",
      "level": 1,
      "offset": 22056,
      "playOrder": 26,
      "text": "聪明的拒绝就是装糊涂"
    },
    {
      "href": "chapter0_0005.xhtml#sigil_toc_id_25",
      "level": 0,
      "offset": 386,
      "playOrder": 27,
      "text": "第5章 生气不如争气"
    },
    {
      "href": "chapter0_0005.xhtml#sigil_toc_id_26",
      "level": 1,
      "offset": 848,
      "playOrder": 28,
      "text": "与人方便，自己方便"
    },
    {
      "href": "chapter0_0005.xhtml#sigil_toc_id_27",
      "level": 1,
      "offset": 6522,
      "playOrder": 29,
      "text": "消除抱怨，不要怨天尤人"
    },
    {
      "href": "chapter0_0005.xhtml#sigil_toc_id_28",
      "level": 1,
      "offset": 11095,
      "playOrder": 30,
      "text": "正确面对他人的凌辱"
    },
    {
      "href": "chapter0_0005.xhtml#sigil_toc_id_29",
      "level": 1,
      "offset": 17929,
      "playOrder": 31,
      "text": "豁达一些，凡事看开一点"
    },
    {
      "href": "chapter0_0005.xhtml#sigil_toc_id_30",
      "level": 1,
      "offset": 21455,
      "playOrder": 32,
      "text": "将羞辱化为一种动力"
    },
    {
      "href": "chapter0_0006.xhtml#sigil_toc_id_31",
      "level": 0,
      "offset": 386,
      "playOrder": 33,
      "text": "第6章 平凡不能平庸"
    },
    {
      "href": "chapter0_0006.xhtml#sigil_toc_id_32",
      "level": 1,
      "offset": 821,
      "playOrder": 34,
      "text": "从每一件小事做起"
    },
    {
      "href": "chapter0_0006.xhtml#sigil_toc_id_33",
      "level": 1,
      "offset": 6156,
      "playOrder": 35,
      "text": "活在当下才是现实之道"
    },
    {
      "href": "chapter0_0006.xhtml#sigil_toc_id_34",
      "level": 1,
      "offset": 12123,
      "playOrder": 36,
      "text": "一份耕耘，一份收获"
    },
    {
      "href": "chapter0_0006.xhtml#sigil_toc_id_35",
      "level": 1,
      "offset": 17388,
      "playOrder": 37,
      "text": "勤奋是通往荣誉圣殿的必经之路"
    },
    {
      "href": "chapter0_0006.xhtml#sigil_toc_id_36",
      "level": 1,
      "offset": 22954,
      "playOrder": 38,
      "text": "改变不能接受的，接受不能改变的"
    },
    {
      "href": "chapter0_0007.xhtml#sigil_toc_id_37",
      "level": 0,
      "offset": 386,
      "playOrder": 39,
      "text": "第7章 忍耐不要懦弱"
    },
    {
      "href": "chapter0_0007.xhtml#sigil_toc_id_38",
      "level": 1,
      "offset": 809,
      "playOrder": 40,
      "text": "放长线，钓大鱼"
    },
    {
      "href": "chapter0_0007.xhtml#sigil_toc_id_39",
      "level": 1,
      "offset": 4134,
      "playOrder": 41,
      "text": "从来好事多磨难"
    },
    {
      "href": "chapter0_0007.xhtml#sigil_toc_id_40",
      "level": 1,
      "offset": 12243,
      "playOrder": 42,
      "text": "小不忍则乱大谋"
    },
    {
      "href": "chapter0_0007.xhtml#sigil_toc_id_41",
      "level": 1,
      "offset": 19306,
      "playOrder": 43,
      "text": "退步原来是向前"
    },
    {
      "href": "chapter0_0007.xhtml#sigil_toc_id_42",
      "level": 1,
      "offset": 25783,
      "playOrder": 44,
      "text": "不败人生，忍者无敌"
    },
    {
      "href": "chapter0_0008.xhtml#sigil_toc_id_43",
      "level": 0,
      "offset": 386,
      "playOrder": 45,
      "text": "第8章 执著不要固执"
    },
    {
      "href": "chapter0_0008.xhtml#sigil_toc_id_44",
      "level": 1,
      "offset": 875,
      "playOrder": 46,
      "text": "好马可以吃回头草"
    },
    {
      "href": "chapter0_0008.xhtml#sigil_toc_id_45",
      "level": 1,
      "offset": 7875,
      "playOrder": 47,
      "text": "懂得变通才能成事"
    },
    {
      "href": "chapter0_0008.xhtml#sigil_toc_id_46",
      "level": 1,
      "offset": 15766,
      "playOrder": 48,
      "text": "看云识天气，对症下药"
    },
    {
      "href": "chapter0_0008.xhtml#sigil_toc_id_47",
      "level": 1,
      "offset": 23207,
      "playOrder": 49,
      "text": "此路不通，换一条路"
    },
    {
      "href": "chapter0_0009.xhtml#sigil_toc_id_48",
      "level": 0,
      "offset": 386,
      "playOrder": 50,
      "text": "第9章 宽容不是放纵"
    },
    {
      "href": "chapter0_0009.xhtml#sigil_toc_id_49",
      "level": 1,
      "offset": 809,
      "playOrder": 51,
      "text": "人情留一线，日后好相处"
    },
    {
      "href": "chapter0_0009.xhtml#sigil_toc_id_50",
      "level": 1,
      "offset": 6096,
      "playOrder": 52,
      "text": "留有余地是一种智慧"
    },
    {
      "href": "chapter0_0009.xhtml#sigil_toc_id_51",
      "level": 1,
      "offset": 14407,
      "playOrder": 53,
      "text": "凡事要留有余地"
    },
    {
      "href": "chapter0_0009.xhtml#sigil_toc_id_52",
      "level": 1,
      "offset": 21749,
      "playOrder": 54,
      "text": "不得罪人是一门艺术"
    },
    {
      "href": "chapter0_0010.xhtml#sigil_toc_id_53",
      "level": 0,
      "offset": 386,
      "playOrder": 55,
      "text": "第10章 随意不可随便"
    },
    {
      "href": "chapter0_0010.xhtml#sigil_toc_id_54",
      "level": 1,
      "offset": 801,
      "playOrder": 56,
      "text": "不管怎样，始终不要抢风头"
    },
    {
      "href": "chapter0_0010.xhtml#sigil_toc_id_55",
      "level": 1,
      "offset": 6188,
      "playOrder": 57,
      "text": "人格无贵贱，人品有高低"
    },
    {
      "href": "chapter0_0010.xhtml#sigil_toc_id_56",
      "level": 1,
      "offset": 13047,
      "playOrder": 58,
      "text": "雄辩是银，沉默是金"
    },
    {
      "href": "chapter0_0010.xhtml#sigil_toc_id_57",
      "level": 1,
      "offset": 20278,
      "playOrder": 59,
      "text": "低调的人离成功最近"
    },
    {
      "href": "chapter0_0011.xhtml#sigil_toc_id_58",
      "level": 0,
      "offset": 386,
      "playOrder": 60,
      "text": "第11章 老实不是愚笨"
    },
    {
      "href": "chapter0_0011.xhtml#sigil_toc_id_59",
      "level": 1,
      "offset": 927,
      "playOrder": 61,
      "text": "一定要学会表现自己"
    },
    {
      "href": "chapter0_0011.xhtml#sigil_toc_id_60",
      "level": 1,
      "offset": 6262,
      "playOrder": 62,
      "text": "必要的客套有利于办事"
    },
    {
      "href": "chapter0_0011.xhtml#sigil_toc_id_61",
      "level": 1,
      "offset": 13430,
      "playOrder": 63,
      "text": "精明谨慎一生不误"
    },
    {
      "href": "chapter0_0011.xhtml#sigil_toc_id_62",
      "level": 1,
      "offset": 20277,
      "playOrder": 64,
      "text": "做人不能太老实"
    },
    {
      "href": "chapter0_0012.xhtml#sigil_toc_id_63",
      "level": 0,
      "offset": 386,
      "playOrder": 65,
      "text": "第12章 面子是自己挣的，不是别人给的"
    },
    {
      "href": "chapter0_0012.xhtml#sigil_toc_id_64",
      "level": 1,
      "offset": 1041,
      "playOrder": 66,
      "text": "没了面子，生活可以更实在"
    },
    {
      "href": "chapter0_0012.xhtml#sigil_toc_id_65",
      "level": 1,
      "offset": 6259,
      "playOrder": 67,
      "text": "要勇于承认自己的错误"
    },
    {
      "href": "chapter0_0012.xhtml#sigil_toc_id_66",
      "level": 1,
      "offset": 11418,
      "playOrder": 68,
      "text": "越舍不得面子，越丢面子"
    },
    {
      "href": "chapter0_0012.xhtml#sigil_toc_id_67",
      "level": 1,
      "offset": 16615,
      "playOrder": 69,
      "text": "借口是走向失败的前奏"
    },
    {
      "href": "chapter0_0012.xhtml#sigil_toc_id_68",
      "level": 1,
      "offset": 22255,
      "playOrder": 70,
      "text": "脚踏实地才能实现梦想"
    },
    {
      "href": "chapter0_0013.xhtml#sigil_toc_id_69",
      "level": 0,
      "offset": 386,
      "playOrder": 71,
      "text": "第13章 不是所有人都能做朋友"
    },
    {
      "href": "chapter0_0013.xhtml#sigil_toc_id_70",
      "level": 1,
      "offset": 969,
      "playOrder": 72,
      "text": "别为你有众多的“朋友”而得意"
    },
    {
      "href": "chapter0_0013.xhtml#sigil_toc_id_71",
      "level": 1,
      "offset": 8160,
      "playOrder": 73,
      "text": "不要掉进美丽的陷阱里"
    },
    {
      "href": "chapter0_0013.xhtml#sigil_toc_id_72",
      "level": 1,
      "offset": 18805,
      "playOrder": 74,
      "text": "认清良伴，能者争庸者舍"
    },
    {
      "href": "chapter0_0013.xhtml#sigil_toc_id_73",
      "level": 1,
      "offset": 25274,
      "playOrder": 75,
      "text": "交友之道，要有心机和策略"
    },
    {
      "href": "chapter0_0013.xhtml#sigil_toc_id_74",
      "level": 1,
      "offset": 30801,
      "playOrder": 76,
      "text": "朋友不在多，在精"
    },
    {
      "href": "chapter0_0014.xhtml#sigil_toc_id_75",
      "level": 0,
      "offset": 386,
      "playOrder": 77,
      "text": "第14章 环境不会适应你，只有你去适应并改变环境"
    },
    {
      "href": "chapter0_0014.xhtml#sigil_toc_id_76",
      "level": 1,
      "offset": 888,
      "playOrder": 78,
      "text": "埋怨环境，不如改变自己"
    },
    {
      "href": "chapter0_0014.xhtml#sigil_toc_id_77",
      "level": 1,
      "offset": 4624,
      "playOrder": 79,
      "text": "能屈能伸是条龙"
    },
    {
      "href": "chapter0_0014.xhtml#sigil_toc_id_78",
      "level": 1,
      "offset": 12227,
      "playOrder": 80,
      "text": "适时而动，适时而变"
    },
    {
      "href": "chapter0_0014.xhtml#sigil_toc_id_79",
      "level": 1,
      "offset": 16170,
      "playOrder": 81,
      "text": "唯一可以改变的就是你自己"
    },
    {
      "href": "chapter0_0014.xhtml#sigil_toc_id_80",
      "level": 1,
      "offset": 20251,
      "playOrder": 82,
      "text": "物竞天择，适者生存"
    },
    {
      "href": "chapter0_0015.xhtml#sigil_toc_id_81",
      "level": 0,
      "offset": 386,
      "playOrder": 83,
      "text": "第15章 你若不勇敢，谁替你坚强"
    },
    {
      "href": "chapter0_0015.xhtml#sigil_toc_id_82",
      "level": 1,
      "offset": 975,
      "playOrder": 84,
      "text": "只有傻瓜才会守株待兔"
    },
    {
      "href": "chapter0_0015.xhtml#sigil_toc_id_83",
      "level": 1,
      "offset": 5935,
      "playOrder": 85,
      "text": "走运的人一般都是大胆的"
    },
    {
      "href": "chapter0_0015.xhtml#sigil_toc_id_84",
      "level": 1,
      "offset": 11068,
      "playOrder": 86,
      "text": "冒险才能突破办事障碍"
    },
    {
      "href": "chapter0_0015.xhtml#sigil_toc_id_85",
      "level": 1,
      "offset": 16157,
      "playOrder": 87,
      "text": "不入虎穴焉得虎子"
    },
    {
      "href": "chapter0_0015.xhtml#sigil_toc_id_86",
      "level": 1,
      "offset": 20264,
      "playOrder": 88,
      "text": "我愿赌服输"
    },
    {
      "href": "chapter0_0015.xhtml#sigil_toc_id_87",
      "level": 1,
      "offset": 24591,
      "playOrder": 89,
      "text": "遇事不能左思右想"
    },
    {
      "href": "chapter0_0016.xhtml#sigil_toc_id_88",
      "level": 0,
      "offset": 386,
      "playOrder": 90,
      "text": "第16章 大智若愚，大巧若拙"
    },
    {
      "href": "chapter0_0016.xhtml#sigil_toc_id_89",
      "level": 1,
      "offset": 777,
      "playOrder": 91,
      "text": "人心叵测，凡事最好留一手"
    },
    {
      "href": "chapter0_0016.xhtml#sigil_toc_id_90",
      "level": 1,
      "offset": 4282,
      "playOrder": 92,
      "text": "保持距离，防患于未然"
    },
    {
      "href": "chapter0_0016.xhtml#sigil_toc_id_91",
      "level": 1,
      "offset": 7760,
      "playOrder": 93,
      "text": "做事懂得进退有度"
    },
    {
      "href": "chapter0_0016.xhtml#sigil_toc_id_92",
      "level": 1,
      "offset": 12981,
      "playOrder": 94,
      "text": "扬长避短，从优势上突围"
    },
    {
      "href": "chapter0_0016.xhtml#sigil_toc_id_93",
      "level": 1,
      "offset": 21192,
      "playOrder": 95,
      "text": "办事要懂得绕路攻关"
    },
    {
      "href": "chapter0_0016.xhtml#sigil_toc_id_94",
      "level": 1,
      "offset": 27748,
      "playOrder": 96,
      "text": "做人要善于隐匿"
    },
    {
      "href": "chapter0_0017.xhtml#sigil_toc_id_95",
      "level": 0,
      "offset": 386,
      "playOrder": 97,
      "text": "第17章 求变通，水无常态随方亦圆"
    },
    {
      "href": "chapter0_0017.xhtml#sigil_toc_id_96",
      "level": 1,
      "offset": 822,
      "playOrder": 98,
      "text": "引而不发，学会吊胃口"
    },
    {
      "href": "chapter0_0017.xhtml#sigil_toc_id_97",
      "level": 1,
      "offset": 6999,
      "playOrder": 99,
      "text": "在别人朦胧之中窥见星光"
    },
    {
      "href": "chapter0_0017.xhtml#sigil_toc_id_98",
      "level": 1,
      "offset": 17887,
      "playOrder": 100,
      "text": "独辟蹊径，出奇制胜"
    },
    {
      "href": "chapter0_0017.xhtml#sigil_toc_id_99",
      "level": 1,
      "offset": 22655,
      "playOrder": 101,
      "text": "先苦后甜，运用让步方能成功"
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