const { app, BrowserWindow, Menu, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const serverPath = path.join(app.getAppPath(), 'server.js');

let serverProcess;
let mainWindow;
let logWindow;

function startServer() {
    serverProcess = spawn(process.execPath, [serverPath], { env: { ELECTRON_RUN_AS_NODE: "1" } })

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

let closeAction = false

function createWindow() {
    mainWindow = new BrowserWindow({
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
        icon: path.join(app.getAppPath(), 'favicon.ico')
    });

    mainWindow.on('close', () => {
        closeAction = true
        logWindow.close();
    });

    mainWindow.maximize();

    const menu = Menu.buildFromTemplate([]);
    Menu.setApplicationMenu(menu);
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
        serverProcess.kill();
    }
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    // 注销所有快捷键
    globalShortcut.unregisterAll();
});