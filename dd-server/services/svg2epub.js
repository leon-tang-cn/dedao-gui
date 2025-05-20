const { OneByOneHtml } = require('./svg2html');
const path = require('path');
const fsExtra = require('fs-extra');
const EPUB = require('epub-gen');

(async () => {
  async function Svg2Epub(outputDir, title, docName, author, svgContents, opt) {
    await fsExtra.ensureDir(outputDir);
    const fileName = path.join(outputDir, `${title}.epub`);
    const coverDir = path.join(outputDir, 'covers');

    const chapters = [];
    let coverPath = null;

    const chapterAndCoverInfo = await Promise.all(
      svgContents.map(async (svgContent, k) => {
        const [chapterContent, coverUrl] = OneByOneHtml('epub', k, svgContent, opt.toc);
        return { chapterContent, coverUrl, k };
      })
    );

    const firstChapter = chapterAndCoverInfo[0];

    chapterAndCoverInfo.forEach(({ chapterContent, k }) => {
      if (k === 0) {
        return;
      }
      let currentToc = opt.toc.filter(toc => toc.href.split('#')[0] === svgContents[k].ChapterID)[0];
      chapters.push({
        title: currentToc ? currentToc.text : svgContents[k].ChapterID,
        data: chapterContent,
        excludeFromToc: currentToc ? false : true
      });
    });

    const epubOptions = {
      title: docName,
      tocTitle: "目录",
      author: author,
      publisher: "得到图书",
      content: chapters,
      cover: firstChapter.coverUrl,
      appendChapterTitles: false,
      tempDir: path.join(outputDir, 'tempDir'),
      css: `
        @font-face { font-family: "FZFangSong-Z02"; src:local("FZFangSong-Z02"), url("https://imgcdn.umiwi.com/ttf/fangzhengfangsong_gbk.ttf"); }
        @font-face { font-family: "FZKai-Z03"; src:local("FZFangSong-Z02S"), url("https://imgcdn.umiwi.com/ttf/0315911813008928624065681028886857980055.ttf"); }
        @font-face { font-family: "FZKai-Z03"; src:local("FZKai-Z03"), url("https://imgcdn.umiwi.com/ttf/fangzhengkaiti_gbk.ttf"); }
        @font-face { font-family: "PingFang SC"; src:local("PingFang SC"); }
        @font-face { font-family: "DeDaoJinKai"; src:local("DeDaoJinKai"), url("https://imgcdn.umiwi.com/ttf/dedaojinkaiw03.ttf");}
        @font-face { font-family: "Source Code Pro"; src:local("Source Code Pro"), url("https://imgcdn.umiwi.com/ttf/0315911806889993935644188722660020367983.ttf"); }
        table, tr, td, th, tbody, thead, tfoot {page-break-inside: avoid !important;}
        img { page-break-inside: avoid !important; max-width: 100% !important;}
        img.epub-footnote { margin-right:5px;display: inline;font-size: 12px;}
      `
    };

    if (coverPath) {
      epubOptions.cover = coverPath;
    }

    try {
      await new EPUB(epubOptions, fileName).promise;
      await fsExtra.remove(coverDir);
    } catch (error) {
      console.error('Error generating EPUB file:', error);
    }
  }

  module.exports = {
    Svg2Epub
  };
})();