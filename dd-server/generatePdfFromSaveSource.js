const path = require('path');
const { Svg2Pdf } = require('./services/svg2pdf');
const jsonData = require('./1.json');
process.stdout.setEncoding('utf8');


Svg2Pdf(jsonData.outputDir,
  jsonData.reTitle,
  "2025国家统一法律职业资格考试应试法律法规全书（上下册）",
  jsonData.svgContents,
  jsonData.toc,
  "xGM6Evn5byxq2PnXBz71AjZaol6R8WJrgRaWOKpGkd4gmMLEJrYNQe9VvD8P4jLk",
  true);