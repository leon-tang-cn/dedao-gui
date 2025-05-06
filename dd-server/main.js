const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const serverPath = path.join(app.getAppPath(), 'server.js');
const { getSavedCookies, saveCookie } = require('./cookie.js');
const userDataPath = app.getPath('documents');
const dbFilePath = path.join(userDataPath, 'ddinfo.db');

(async () => {
    let serverProcess;
    let mainWindow;
    let ddWindow;
    let ddWindowLoaded = false;
    let progressWindow;
    let logWindow;
    let cookies = await getSavedCookies(dbFilePath);
    let subWindows = [];

    function startServer() {
        serverProcess = spawn(process.execPath, [serverPath], { env: { ELECTRON_RUN_AS_NODE: "1", USER_DATA_PATH: userDataPath } })

        serverProcess.stdout.on('data', (data) => {
            console.log(`${data}`);
            const logMessage = data.toString();
            if (logWindow) {
                logWindow.webContents.send('server-log', logMessage);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server error: ${data}`);
            const logMessage = data.toString();
            if (logWindow) {
                logWindow.webContents.send('server-log', logMessage);
            }
        });

        serverProcess.on('close', (code) => {
            console.log(`Server process exited with code ${code}`);
            if (!code) {
                return;
            }
            const logMessage = code.toString();
            if (logWindow) {
                logWindow.webContents.send('server-log', logMessage);
            }
        });
    }

    const clearCookies = async (webContents) => {
        try {
            // 获取所有 cookies
            const cookies = await webContents.session.cookies.get({});
            // 遍历 cookies 并逐个移除
            for (const cookie of cookies) {
                await webContents.session.cookies.remove(cookie.domain, cookie.name);
            }
        } catch (error) {
            console.error('清空 cookies 时出错:', error);
        }
    }

    let closeAction = false
    let cookieSetted = false

    const setupWindow = (window, isMainWindow) => {
        if (!isMainWindow) handleWindowLoad(window);

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

            newWindow.on('close', (e) => {
                subWindows = subWindows.filter(id => id !== newWindow.id);
            });
            subWindows.push(newWindow.id);
            setupWindow(newWindow, false);
            return { action: 'deny' };
        });
    }

    const handleWindowLoad = (window) => {
        const handleUrlChange = async () => {
            const currentUrl = window.webContents.getURL();
            if (currentUrl.indexOf('https://www.dedao.cn/ebook/reader') >= 0) {
                if (!cookies && cookies.length === 0) {
                    const currentCookies = await window.webContents.session.cookies.get({});
                    cookies = currentCookies;
                    await saveCookie(currentCookies, dbFilePath);
                }
                await insertButton(window);
            } else if (currentUrl.indexOf('https://www.dedao.cn/ebook/detail') === 0) {
                if (!cookies && cookies.length === 0) {
                    const currentCookies = await window.webContents.session.cookies.get({});
                    cookies = currentCookies;
                    await saveCookie(currentCookies, dbFilePath);
                }
                await startObservingDOM(window);
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

    const startObservingDOM = async (window) => {
        const buttonText = '下载';
        const script = `
            (function() {
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
        try {
            await window.webContents.executeJavaScript(script);
        } catch (error) {
            console.error('启动 DOM 监听时出错:', error);
        }
    }

    const insertButton = async (window) => {
        const buttonText = '下载';

        const script = `
            (function() {
                const targetElement = document.querySelector('.iget-pc #content .right-button-group')
                if (targetElement) {
                    ${createButonScript}
                }
            })()
        `;
        try {
            await window.webContents.executeJavaScript(script);
        } catch (error) {
            console.error('execute JavaScript error:', error);
        }
    };

    // 定义 execute 方法
    const execute = (queryParams) => {
        const params = { queryParams };
        mainWindow.webContents.executeJavaScript(`window.electronAPI.setParams(${JSON.stringify(params)});`)
        let currentUrl = mainWindow.webContents.getURL();
        currentUrl = currentUrl + 'buttonAction';
        mainWindow.webContents.loadURL(currentUrl);
        mainWindow.focus();
    }

    // 监听来自渲染进程的消息
    ipcMain.on('execute-method', (event, queryParams) => {
        execute(queryParams);
    });

    // 监听来自渲染进程的消息
    ipcMain.on('open-window', (event, windowName) => {
        if (!ddWindow.isVisible() && !ddWindowLoaded) {

            progressWindow = new BrowserWindow({
                width: 300,
                height: 100,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: true,
                    webSecurity: false
                },
                autoHideMenuBar: true,
                center: true,
                fullscreenable: false,
                show: false,
                icon: path.join(app.getAppPath(), 'favicon.ico')
            })
    
            progressWindow.loadFile('notice.html');
            progressWindow.show();

            ddWindow.loadURL("https://www.dedao.cn/")

            ddWindow.webContents.on('did-finish-load', async () => {
                if (!cookieSetted) {
                    if (cookies && cookies.length > 0) {
                        await clearCookies(ddWindow.webContents);
                        cookies.forEach(async (cookie) => {
                            try {
                                await ddWindow.webContents.session.cookies.set(cookie);
                            } catch (error) {
                            }
                        });
                        cookieSetted = true;
                        ddWindow.reload();
                    }
                    progressWindow.close();
                    ddWindow.maximize();
                    setupWindow(ddWindow, true);
                    ddWindow.show();
                    ddWindowLoaded = true;
                }
            });
        } else if (!ddWindow.isVisible() && ddWindowLoaded) {
            ddWindow.show();
        } else {
            ddWindow.focus();
        }
    });

    const createDdWindow = () => {
        ddWindow = new BrowserWindow({
            width: 1440,
            height: 900,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true,
                webSecurity: false
            },
            autoHideMenuBar: true,
            center: true,
            fullscreenable: false,
            show: false,
            icon: path.join(app.getAppPath(), 'favicon.ico')
        });

        ddWindow.on('close', (e) => {
            if (!closeAction) {
                e.preventDefault();
                ddWindow.hide();
            }
        });
    }

    const createWindow = () => {
        mainWindow = new BrowserWindow({
            width: 1440,
            height: 900,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                enableRemoteModule: true,
                webSecurity: false,
                preload: `${__dirname}/custom.js`
            },
            autoHideMenuBar: true,
            center: true,
            fullscreenable: false,
            icon: path.join(app.getAppPath(), 'favicon.ico')
        });

        mainWindow.on('close', () => {
            closeAction = true;
            if (!ddWindow.isDestroyed()) ddWindow.close();
            if (!logWindow.isDestroyed()) logWindow.close();
            for (var i = 0; i < subWindows.length; i++) {
                const subWindow = BrowserWindow.fromId(subWindows[i]);
                if (subWindow && !subWindow.isDestroyed()) {
                    subWindow.close();
                }
            }
        });

        mainWindow.maximize();

        createDdWindow();

        if (process.platform === 'darwin') {
            const template = [{
                label: app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            }
            ];

            const menu = Menu.buildFromTemplate(template);
            Menu.setApplicationMenu(menu);
        }
        mainWindow.loadFile('index.html');

        logWindow = new BrowserWindow({
            width: 600,
            height: 400,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            fullscreenable: false,
            show: false, // 初始时隐藏日志窗口
            icon: path.join(app.getAppPath(), 'favicon.ico')
        });

        logWindow.loadFile('log.html');

        logWindow.on('close', (e) => {
            if (!closeAction) {
                e.preventDefault();
                logWindow.hide();
            }
        });

        logWindow.removeMenu();
    }

    app.whenReady().then(async () => {
        startServer();
        createWindow();

        globalShortcut.register('CommandOrControl+Shift+L', () => {
            if (logWindow.isVisible()) {
                logWindow.hide();
            } else {
                logWindow.show();
            }
        });

        globalShortcut.register('CommandOrControl+Shift+J', () => {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        });
    });

    app.on('window-all-closed', function () {
        if (serverProcess) {
            if (process.platform === 'win32') {
                serverProcess.kill();
            } else {
                process.kill(serverProcess.pid);
            }
        }
        app.quit();
    });

    app.on('will-quit', () => {
        // 注销所有快捷键
        globalShortcut.unregisterAll();
    });
})();