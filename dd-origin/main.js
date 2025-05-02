const { app, BrowserWindow, ipcMain } = require('electron');

// 定义需要插入按钮的特定 URL
// 'https://www.dedao.cn/ebook/reader';
// https://www.dedao.cn/ebook/detail

let cookieArr = [];

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: `${__dirname}/preload.js`
        }
    });
    mainWindow.maximize();

    // 替换为你要加载的外部官网页面的 URL
    const externalUrl = 'https://www.dedao.cn/';
    mainWindow.loadURL(externalUrl);

    setupWindow(mainWindow);
}

function setupWindow(window) {
    handleWindowLoad(window);
    // window.webContents.openDevTools({ mode: 'detach' });

    // 处理新窗口创建事件
    window.webContents.setWindowOpenHandler(({ url }) => {
        const newWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: `${__dirname}/preload.js`
            }
        });
        newWindow.maximize();
        newWindow.loadURL(url);
        setupWindow(newWindow);
        return { action: 'deny' };
    });
}

function handleWindowLoad(window) {
    const handleUrlChange = () => {
        const currentUrl = window.webContents.getURL();
        console.log('URL:', currentUrl);
        if (currentUrl.indexOf('https://www.dedao.cn/ebook/reader') >= 0) {
            insertButton(window);
            getCookies(window);
        } else if (currentUrl.indexOf('https://www.dedao.cn/ebook/detail') === 0) {
            startObservingDOM(window);
            getCookies(window);
        }
    };

    // 监听窗口加载完成事件
    window.webContents.on('did-finish-load', handleUrlChange);
}

const createButonScript = `
    const button = document.createElement('button');
    button.classList.add('reader-tool-button');
    button.classList.add('tool-margin-left');
    const iconSpan = document.createElement('span');
    iconSpan.classList.add('iconfont');
    iconSpan.classList.add('border-type-0');
    iconSpan.classList.add('iget-icon-read');
    button.appendChild(iconSpan);
    const textSpan = document.createElement('span');
    textSpan.classList.add('iget-common-f7');
    textSpan.textContent = '下载';
    button.appendChild(textSpan);
    targetElement.insertAdjacentElement('afterend', button);
    button.addEventListener('click', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const queryParams = {};
        urlParams.forEach((value, key) => {
            queryParams[key] = value;
        });
        window.electronAPI.sendExecuteMessage(queryParams);
    });
`

function startObservingDOM(window) {
    const buttonText = '下载';
    const script = `
        (function() {
            console.log('DOM listener started');
            const targetNode = document.querySelector('.iget-pc');
            const config = { attributes: true, childList: true, subtree: true };
            const callback = (mutationsList, observer) => {
                const targetElement = document.querySelector('.iget-pc #content .right-button-group')
                if (targetElement) {
                    ${createButonScript}
                    observer.disconnect();
                }
            };
            const observer = new MutationObserver(callback);
            observer.observe(targetNode, config);
        })()
    `;

    window.webContents.executeJavaScript(script)
        .catch((error) => {
            console.error('启动 DOM 监听时出错:', error);
        });
}

function getCookies(window) {
    const session = window.webContents.session;
    session.cookies.get({ url: window.webContents.getURL() })
        .then((cookies) => {
            console.log('page Cookie:', cookies);
            cookieArr = cookies;
            // 这里可以添加处理 Cookie 的逻辑
        })
        .catch((error) => {
            console.error('获取 Cookie 时出错:', error);
        });
}

const insertButton = (window) => {
    const buttonText = '下载';

    const script = `
        (function() {
            const targetElement = document.querySelector('.iget-pc #content .right-button-group')
            if (targetElement) {
                ${createButonScript}
            }
        })()
    `;

    window.webContents.executeJavaScript(script).catch((error) => {
        console.error('execute JavaScript error:', error);
    });
};

// 定义 execute 方法
function execute(queryParams) {
    console.log('local execute called', queryParams);
    // 这里可以添加你想要执行的具体逻辑
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: `${__dirname}/custom.js`,
        }
    });

    win.loadFile('index.html');

    const params = { queryParams, cookieArr };
    win.webContents.executeJavaScript(`window.electronAPI.setParams(${JSON.stringify(params)});`)

    win.webContents.openDevTools({ mode: 'detach' });
}

// 监听来自渲染进程的消息
ipcMain.on('execute-method', (event, queryParams) => {
    execute(queryParams);
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
