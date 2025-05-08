const fs = require('fs-extra');
const path = require('path');
const { parse } = require('svg-parser');
const htmlEscaper = require('html-escaper');

(async () => {
  const footNoteImgW = 20;
  const footNoteImgH = 20;
  const reqEbookPageWidth = 60000;

  function GenHeadHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN" xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <style>
    @font-face { font-family: "FZFangSong-Z02"; src:local("FZFangSong-Z02"), url("https://imgcdn.umiwi.com/ttf/fangzhengfangsong_gbk.ttf"); }
    @font-face { font-family: "FZKai-Z03"; src:local("FZFangSong-Z02S"), url("https://imgcdn.umiwi.com/ttf/0315911813008928624065681028886857980055.ttf"); }
    @font-face { font-family: "FZKai-Z03"; src:local("FZKai-Z03"), url("https://imgcdn.umiwi.com/ttf/fangzhengkaiti_gbk.ttf"); }
    @font-face { font-family: "PingFang SC"; src:local("PingFang SC"); }
    @font-face { font-family: "DeDaoJinKai"; src:local("DeDaoJinKai"), url("https://imgcdn.umiwi.com/ttf/dedaojinkaiw03.ttf");}
    @font-face { font-family: "Source Code Pro"; src:local("Source Code Pro"), url("https://imgcdn.umiwi.com/ttf/0315911806889993935644188722660020367983.ttf"); }
    table, tr, td, th, tbody, thead, tfoot {page-break-inside: avoid !important;}
    img { page-break-inside: avoid !important; max-width: 100% !important;}
    img.epub-footnote { margin-right:5px;display: inline;font-size: 12px;}
  </style>
</head>
<body>`;
  }

  function parseAttrHref(attr) {
    return attr.href || '';
  }

  function parseAttrAlt(attr) {
    if (attr.alt) {
      return String(attr.alt).replace(/"/g, '&quot;');
    }
    return String('').replace(/"/g, '&quot;');
  }

  function parseAttrNewline(attr) {
    return attr.newline === 'true';
  }

  function GenLineContentByElement(chapterID, element) {
    const lineContent = {};
    let offset = '';
    let lastY = '';
    let lastTop = '';
    let lastH = '';
    let lastNewLine = false;
    let lastName = '';

    element.children.forEach((child, k) => {
      child.children.forEach((children, k) => {
        const ele = {
          X: '',
          Y: '',
          ID: '',
          Width: '',
          Height: '',
          Offset: '',
          Href: '',
          Name: '',
          Style: '',
          Content: '',
          Class: '',
          Alt: '',
          Len: '',
          Newline: false,
          IsBold: false,
          IsItalic: false,
          IsFn: false,
          IsSub: false,
          Fn: { Href: '' }
        };

        const attr = children.properties;
        if (children.children.length == 0) {
          children.children.push(
            {
              "type": "text",
              "value": "&nbsp;"
            })
        }
        const content = children.children?.[0]?.value || '';

        if (attr.y) {
          ele.Newline = parseAttrNewline(attr);
          if (children.tagName === 'text') {
            if (content) {
              ele.Content = content;
            } else if (children.children) {
              children.children.forEach(child => {
                if (child.tagName === 'a') {
                  ele.Content += child.children?.[0]?.value || '';
                  if (child.properties.href) {
                    const hrefArr = child.properties.href.split('/');
                    const href = hrefArr[hrefArr.length - 1];
                    const tagArr = href.split('#');
                    if (tagArr.length > 1) {
                      ele.Fn.Href = `#${tagArr[0]}_${tagArr[1]}`;
                      attr.id = `${chapterID}_${tagArr[1]}`;
                    } else {
                      ele.Fn.Href = `#${tagArr[0]}`;
                      attr.id = chapterID;
                    }
                    ele.Fn.Style = child.properties.style;
                  }
                }
              });
            } else {
              ele.Content = '&nbsp;';
            }

            if (attr.top) {
              const topInt = parseFloat(attr.top);
              const heightInt = parseFloat(attr.height);
              const lenInt = parseFloat(attr.len);
              const lastTopInt = parseFloat(lastTop);
              const lastHInt = parseFloat(lastH);

              if (!lastNewLine && heightInt < lastHInt && heightInt <= 20 && lenInt < 3 && children.tagName === lastName) {
                if (topInt < lastTopInt) {
                  ele.IsFn = true;
                } else {
                  ele.IsSub = true;
                }
                attr.style = '';
              } else {
                lastTop = attr.top;
                lastH = attr.height;
              }
            }
          } else {
            ele.Content = '';
          }

          ele.Len = attr.len || '';
          ele.Class = attr.class || '';

          if (attr.style) {
            const style = attr.style.replace(/fill/g, 'color');
            ele.Style = style;
            ele.IsBold = style.includes('font-weight: bold;');
            ele.IsItalic = style.includes('font-style: oblique') || style.includes('font-style: italic');
          }

          ele.X = attr.x;
          if (ele.IsFn || ele.IsSub) {
            ele.Y = lastY;
          } else {
            ele.Y = attr.y;
            if (children.tagName === 'text') {
              lastY = attr.y;
            }
          }

          ele.Width = attr.width;
          ele.Height = attr.height;

          const yInt = parseFloat(ele.Y);
          const w = parseFloat(ele.Width);
          if (children.tagName === 'image' && w < footNoteImgW) {
            const attrPre = child.children[k - 1].properties;
            ele.Y = attrPre.y;
          }

          if (attr.id) {
            ele.ID = attr.id;
            if (attr.offset) {
              offset = attr.offset;
            }
          }
          ele.Offset = offset;
          ele.Href = parseAttrHref(attr);
          ele.Alt = parseAttrAlt(attr);
          ele.Name = children.tagName;

          if (['text', 'image'].includes(children.tagName)) {
            if (!lineContent[yInt]) {
              lineContent[yInt] = [];
            }
            lineContent[yInt].push(ele);
          }
          lastNewLine = ele.Newline;
          lastName = children.tagName;
        }
      });
    });

    return lineContent;
  }

  function OneByOneHtml(eType, index, svgContent, toc) {
    let result = '';
    let cover = '';

    if (eType === 'html') {
      if (index === 1 && toc.length > 0) {
        result += GenTocHtml(toc);
      }
      result += `<p style="page-break-after: always;">`;
    } else if (['pdf', 'epub'].includes(eType)) {
      result += GenHeadHtml();
    }

    svgContent.Contents.forEach(content => {
      result += `<div id="${svgContent.ChapterID}">`;
      const element = parse(content);
      const lineContent = GenLineContentByElement(svgContent.ChapterID, element);

      const keys = Object.keys(lineContent).map(Number).sort((a, b) => a - b);

      keys.forEach(v => {
        let cont = '';
        let id = '';
        let contWOTag = '';
        let firstX = 0;

        const items = lineContent[v];
        if (items[0].ID) {
          id = items[0].ID;
        }

        let lineStyle = '';
        let currentSpanStyle = '';
        let hasUncloseSpan = false;

        items.forEach((item, i) => {
          let style = item.Style || '';

          if (i === 0) {
            firstX = parseFloat(item.X);
            const lastIndex = items.length - 1;
            if (items[lastIndex].Name !== 'image') {
              lineStyle = items[lastIndex].Style;
            } else if (lastIndex - 1 >= 0) {
              lineStyle = items[lastIndex - 1].Style;
            } else {
              lineStyle = item.Style;
            }
          }

          const centerL = (reqEbookPageWidth / 2) * 0.9;
          const centerH = (reqEbookPageWidth / 2) * 1.1;
          const rightL = reqEbookPageWidth * 0.9;

          let w = parseFloat(item.Width);
          let h = parseFloat(item.Height);

          if (w > 900) {
            h = 900 * h / w;
            w = 900;
          }

          if (item.Name === 'image') {
            let img = '';
            if (firstX >= centerL && firstX <= centerH) {
              style += 'display: block;text-align:center;';
            } else if (firstX >= rightL) {
              style += 'display: block;text-align:right;';
            }

            if (eType === 'html' || eType === 'pdf') {
              img = `<img width="${w}" src="${item.Href}" alt="${item.Alt}" title="${item.Alt}"/>`;
              if (style) {
                img = `<div style="${style}">${img}</div>`;
              }
              if (w < footNoteImgW || h < footNoteImgH) {
                img = `<sup><img width="${w}" src="${item.Href}" alt="${item.Alt}" title="${item.Alt}" class="${item.Class}"/></sup>`;
              }
            } else if (eType === 'epub') {
              img = `<img width="${w}" src="${item.Href}" alt="${item.Alt}"/>`;
              if (style) {
                img = `<div style="${style}">${img}</div>`;
              }
              if (w < footNoteImgW && item.Class) {
                const footnoteId = `footnote-${index}-${i}`;
                img = `<sup><a class="duokan-footnote" epub:type="noteref" href="#${footnoteId}"> <img width="${w}" src="${item.Href}" alt="${item.Alt}" zy-footnote="${item.Alt}" class="${item.Class} zhangyue-footnote qqreader-footnote"/></a></sup>`;
                result += `<aside epub:type="footnote" id="${footnoteId}"><ol class="duokan-footnote-content" style="list-style:none;padding:0px;margin:0px;"><li class="duokan-footnote-item" id="${footnoteId}">${item.Alt}</li></ol></aside>`;
              }
            }

            if (eType === 'pdf') {
              if (index === 0) {
                cover = `${GenHeadHtml()}${img}</body></html>`;
              }
            } else if (eType === 'epub') {
              cover = item.Href;
            }

            if (w < footNoteImgW) {
              cont += img;
            }

            if (eType === 'html') {
              if (w >= footNoteImgW) {
                result += img;
              }
            } else if (eType === 'pdf' || eType === 'epub') {
              if (index !== 0 && w >= footNoteImgW) {
                result += img;
              }
            }
          } else if (item.Name === 'text') {
            if (hasUncloseSpan && item.Style !== currentSpanStyle) {
              cont += '</span>';
              hasUncloseSpan = false;
            }

            if (item.Style !== lineStyle && !hasUncloseSpan) {
              cont += `<span style="${item.Style}">`;
              currentSpanStyle = item.Style;
              hasUncloseSpan = true;
            }

            if (firstX >= centerL && firstX <= centerH) {
              style += 'display: block;text-align:center;';
            } else if (firstX >= rightL) {
              style += 'display: block;text-align:right;';
            }

            item.Content = htmlEscaper.escape(item.Content);

            const tags = [
              { condition: item.IsBold, open: '<b>', close: '</b>' },
              { condition: item.IsItalic, open: '<i>', close: '</i>' },
              { condition: item.IsFn, open: '<sup>', close: '</sup>' },
              { condition: item.IsSub, open: '<sub>', close: '</sub>' }
            ];

            tags.forEach(tag => {
              if (tag.condition) {
                cont += tag.open;
              }
            });

            if (item.Fn.Href) {
              cont += `<a id="${item.ID}" href="${item.Fn.Href}"`;
              if (item.Fn.Style) {
                cont += ` style="${item.Fn.Style}"`;
              }
              cont += '>';
            }

            cont += item.Content;

            if (item.Fn.Href) {
              cont += '</a>';
            }

            for (let i = tags.length - 1; i >= 0; i--) {
              if (tags[i].condition) {
                cont += tags[i].close;
              }
            }

            contWOTag += item.Content;
          }
        });

        if (items.length > 0) {
          let matchH = false;
          let level = 0;
          contWOTag = htmlEscaper.unescape(contWOTag).replace(/&nbsp;/g, '');

          toc.forEach(({ text, level: l }) => {
            const contWOTagMatch = contWOTag.replace(/&nbsp;/g, '');
            if (text.replace(/ /g, '').includes(contWOTagMatch)) {
              matchH = true;
              level = l;
            }
          });

          if (contWOTag) {
            if (matchH) {
              result += `</div><div class='header${level}'>${GenTocLevelHtml(level, true)}`;
            } else {
              result += `<p>`;
            }
          }

          if (items.length > 1 && items[items.length - 1].Name === 'image') {
            lineStyle = items[items.length - 2].Style;
          }

          if (cont) {
            if (id && lineStyle) {
              result += `<span id="${id}" style="${lineStyle}">`;
            } else if (id) {
              result += `<span id="${id}">`;
            } else if (lineStyle) {
              result += `<span style="${lineStyle}">`;
            }
            result += cont + `</span>`;
          }

          if (contWOTag) {
            if (matchH) {
              result += GenTocLevelHtml(level, false) + `</div><div class="part">`;
            } else {
              result += `</p>`;
            }
          }
        }
      });

      result += `</div>`;

      if (['pdf', 'epub'].includes(eType)) {
        result += `</body></html>`;
      }
    });

    result = htmlEscaper.unescape(result);
    return [result, cover];
  }

  function AllInOneHtml(svgContents, toc) {
    let result = GenHeadHtml();

    svgContents.forEach((svgContent, k) => {
      const [chapter] = OneByOneHtml('html', k, svgContent, toc);
      result += chapter;
    });

    result += `</body></html>`;
    result = htmlEscaper.unescape(result);
    return result;
  }

  function Svg2Html(outputDir, title, svgContents, toc) {
    const result = AllInOneHtml(svgContents, toc);
    fs.ensureDirSync(outputDir);
    const fileName = path.join(outputDir, `${title}.html`);
    fs.writeFileSync(fileName, result);
    return fileName;
  }

  function GenTocHtml(toc) {
    if (toc.length === 0) {
      return '';
    }

    let result = `<div id="toc"><p style="page-break-after: always;"><p><span style="font-size:24px;font-weight: bold;color:rgb(0, 0, 0);font-family:'PingFang SC';">目 录</span></p>`;

    toc.forEach(ebookToc => {
      let style = "font-size:18px;color:rgb(0, 0, 0);font-family:'PingFang SC';text-decoration: none;";
      if (ebookToc.Level === 0) {
        style = "font-size:20px;font-weight: bold;color:rgb(0, 0, 0);font-family:'PingFang SC';text-decoration: none;";
      }
      const href = ebookToc.href.split('#');
      const text = '&nbsp;'.repeat(ebookToc.level * 4) + ebookToc.text;

      if (href.length > 1) {
        result += `<p><a href="#${href[1]}" style="${style}">${text}</a></p>`;
      } else {
        result += `<p><a style="${style}">${text}</a></p>`;
      }
    });

    result += `</div>`;
    return result;
  }

  function GenTocLevelHtml(level, startTag) {
    const sTag = { 0: '<h1>', 1: '<h2>', 2: '<h3>', 3: '<h4>', 4: '<h5>', 5: '<h6>' };
    const eTag = { 0: '</h1>', 1: '</h2>', 2: '</h3>', 3: '</h4>', 4: '</h5>', 5: '</h6>' };

    if (startTag) {
      return sTag[level] || '';
    } else {
      return eTag[level] || '';
    }
  }

  module.exports = {
    Svg2Html,
    OneByOneHtml
  };
})();