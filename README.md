# dedao-nodejs-gui

### 技术栈：
nodejs > 20
</br>VUE3
</br>Element Plus
</br>SQLITE3
</br>Electron
</br>
</br>epub：EPUB-GEN
</br>pdf：puppeteer

### 编译
1.windows
```
cd dd-server
npm i
npm run prebuild
npm run dist:win
```
2.mac环境下请分别编译前后端，并将前端编译后的dist文件夹中内容全部复制到dd-server目录下，再执行npm run dist:mac。

### 部分截图
1.app内访问得到官网，如已扫码登陆，将替换cookie，访问官网时无需登陆
<img width="1024" alt="image" src="https://github.com/user-attachments/assets/1cbe5270-6b67-4970-a093-be3ebd39096a" />
2.从官网阅读电子书，在上方工具栏会出现下载按钮，点击跳转下载页面
<img width="1247" alt="image" src="https://github.com/user-attachments/assets/3023c36f-1333-4752-9c9d-6e7c57762050" />
3.下载单本
<img width="1617" alt="image" src="https://github.com/user-attachments/assets/3260b9ea-249b-4bd1-af3d-91d56eecea6e" />
4.列表形式展示书库
<img width="1489" alt="image" src="https://github.com/user-attachments/assets/67d47e67-341c-4eb6-9770-53c22e779166" />
5.列表形式展示书架
<img width="1489" alt="截屏2025-05-03 10 57 29" src="https://github.com/user-attachments/assets/055ea3ba-6602-48ef-9890-6c856c1702e5" />
