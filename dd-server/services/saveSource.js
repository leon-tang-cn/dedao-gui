const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');

(async () => {
  async function saveSource(enid, outputDir, reTitle, svgContents, toc, category) {
    const saveData = {
      enid,
      outputDir,
      reTitle,
      svgContents,
      toc
    }

    fs.ensureDirSync(outputDir);
    try {
      const filePath = `${outputDir}/${reTitle}.json`;
      await fs.writeFile(filePath, JSON.stringify(saveData), 'utf8')

      // 创建输出流
      const output = fs.createWriteStream(`${outputDir}/${reTitle}.zip`);
      const archive = archiver('zip', {
        zlib: { level: 5 } // 最高压缩级别
      });

      // 监听事件
      output.on('close', () => {
        console.log(`📄 压缩源数据完成: [${outputDir}]${reTitle}.zip `);
        fs.unlinkSync(filePath);
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') console.warn('文件不存在警告:', err);
        else throw err;
      });

      archive.on('error', (err) => {
        throw err;
      });

      // 管道连接
      archive.pipe(output);

      archive.file(filePath, { name: path.basename(filePath) });

      // 完成压缩
      archive.finalize().then(() => {
      });

    } catch (error) {
      console.error('保存源数据失败:', error);
    }
  }

  module.exports = {
    saveSource
  };
})();