const { app, BrowserWindow, Menu, dialog, shell, ipcMain, Notification, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const IntranetMappingManager = require('./intranetMapping');
const ProxyServer = require('./proxyServer');

app.setName('RUC Portal'); 

// 配置存储
const store = new Store({
  defaults: {
    outputDirectory: path.join(os.homedir(), 'Downloads'),
    internalNetworkMode: false,
    windowBounds: {
      width: 1200,
      height: 800
    },
    isFirstLaunch: true
  }
});

let mainWindow;
let settingsWindow;
let intranetMapping;
let proxyServer;

function createMainWindow() {
  const bounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Relaxed for intranet mode proxy
      allowRunningInsecureContent: true,
      experimentalFeatures: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // 可选：应用图标
    show: false
  });

  // 加载 RUC Learn 网站
  mainWindow.loadURL('https://learn.ruc.edu.kg');

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Initialize intranet mode based on settings
    initializeIntranetMode();
    
    // Check if this is the first launch
    const isFirstLaunch = store.get('isFirstLaunch', true);
    if (isFirstLaunch) {
      // Mark as no longer first launch
      store.set('isFirstLaunch', false);
      // Open settings window on first launch
      setTimeout(() => {
        createSettingsWindow();
      }, 1000); // Delay to ensure main window is fully loaded
    }
  });

  // 保存窗口大小和位置
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', bounds);
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 拦截下载请求
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    handleDownload(item);
  });

  // 设置菜单
  createMenu();
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 410,
    parent: mainWindow,
    modal: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          role: 'togglefindbar'
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  // 根据平台添加应用菜单
  if (process.platform === 'darwin') {
    // macOS: 添加应用菜单（包含设置）
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'Cmd+,',
          click: () => createSettingsWindow()
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  } else {
    // Windows/Linux: 添加应用菜单
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'Ctrl+,',
          click: () => createSettingsWindow()
        }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function handleDownload(item) {
  const outputDir = store.get('outputDirectory');
  const fileName = item.getFilename();
  const filePath = path.join(outputDir, fileName);

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
      dialog.showErrorBox('Download Error', `Failed to create output directory: ${outputDir}`);
      return;
    }
  }

  // 设置保存路径
  item.setSavePath(filePath);

  // 监听下载进度
  item.on('updated', (event, state) => {
    if (state === 'interrupted') {
      console.log('Download is interrupted but can be resumed');
    } else if (state === 'progressing') {
      if (item.isPaused()) {
        console.log('Download is paused');
      } else {
        const received = item.getReceivedBytes();
        const total = item.getTotalBytes();
        const progress = Math.round((received / total) * 100);

        // 发送进度到渲染进程
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', {
            fileName,
            progress,
            received,
            total
          });
        }
      }
    }
  });

  // 下载完成
  item.once('done', (event, state) => {
    if (state === 'completed') {
      console.log('Download successfully completed:', filePath);

      // 发送完成通知到渲染进程
      if (mainWindow) {
        mainWindow.webContents.send('download-completed', {
          fileName,
          filePath
        });
      }

      // 显示系统原生通知
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'Download Completed',
          body: `${fileName} has been saved to ${outputDir}`,
          silent: false
        });

        // 点击通知时打开文件所在目录
        notification.on('click', () => {
          shell.showItemInFolder(filePath);
        });

        notification.show();
      }

    } else {
      console.log('Download failed:', state);


      // 显示下载失败的系统通知
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'Download Failed',
          body: `Failed to download ${fileName}: ${state}`,
          silent: false
        });
        notification.show();
      }

      if (mainWindow) {
        mainWindow.webContents.send('download-failed', {
          fileName,
          error: state
        });
      }
    }
  });
}

// Initialize intranet mode
async function initializeIntranetMode() {
  // Initialize intranet mapping manager
  intranetMapping = new IntranetMappingManager();

  // Get intranet mode setting
  const intranetModeEnabled = store.get('internalNetworkMode', false);
  intranetMapping.setEnabled(intranetModeEnabled);

  if (intranetModeEnabled) {
    console.log('Intranet mode is enabled, starting proxy server...');
    try {
      // Initialize proxy server
      proxyServer = new ProxyServer(intranetMapping);
      const proxyPort = await proxyServer.start();
      console.log(`Proxy server started on port ${proxyPort}`);

      // Disable private network access restrictions
      setupPrivateNetworkAccess();
    } catch (error) {
      console.error('Failed to start proxy server:', error);
    }
  }
}

// Set up private network access for intranet mode
function setupPrivateNetworkAccess() {
  if (!mainWindow || !intranetMapping.isEnabled()) return;

  const ses = mainWindow.webContents.session;

  // Set permission handler to allow private network access
  ses.setPermissionRequestHandler((_, permission, callback) => {
    if (permission === 'private-network-access') {
      console.log('Allowing private network access for intranet mode');
      callback(true);
      return;
    }
    callback(false);
  });

  // Set permission check handler
  ses.setPermissionCheckHandler((_, permission, requestingOrigin) => {
    if (permission === 'private-network-access') {
      console.log('Checking private network access permission for:', requestingOrigin);
      return true;
    }
    return false;
  });
}

// IPC 处理程序
ipcMain.handle('get-config', (_, key) => {
  if (key) {
    return store.get(key);
  }
  return store.store;
});

ipcMain.handle('set-config', (_, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
    properties: ['openDirectory'],
    defaultPath: store.get('outputDirectory')
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('open-directory', (_, dirPath) => {
  shell.openPath(dirPath);
});

// IPC handlers for intranet mode
ipcMain.handle('toggle-intranet-mode', async (_, enabled) => {
  try {
    console.log(`Toggling intranet mode: ${enabled}`);

    // Update store
    store.set('internalNetworkMode', enabled);

    if (!intranetMapping) {
      intranetMapping = new IntranetMappingManager();
    }

    intranetMapping.setEnabled(enabled);

    if (enabled) {
      // Start proxy server if not already running
      if (!proxyServer) {
        proxyServer = new ProxyServer(intranetMapping);
        await proxyServer.start();
        console.log(`Proxy server started on port ${proxyServer.getPort()}`);
      }

      // Set up private network access
      setupPrivateNetworkAccess();
    } else {
      // Stop proxy server
      if (proxyServer) {
        proxyServer.stop();
        proxyServer = null;
      }

      // Reload the page to clear any proxy overrides
      if (mainWindow) {
        mainWindow.reload();
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error toggling intranet mode:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-intranet-status', (_) => {
  if (!intranetMapping) {
    return { enabled: false, status: 'Not initialized' };
  }

  return {
    enabled: intranetMapping.isEnabled(),
    status: intranetMapping.getNetworkStatus(),
    proxyPort: proxyServer ? proxyServer.getPort() : null
  };
});

// Add command line switches before app is ready
app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-running-insecure-content');

// 应用事件处理
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Handle certificate errors globally for intranet mode
app.on('certificate-error', (event, _, url, __, ___, callback) => {
  if (intranetMapping && intranetMapping.isEnabled()) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check if this is an IP address that was rewritten from a domain
    const isRewrittenIP = Object.values(intranetMapping.mappings).some(mapping => {
      if (mapping.type === 'single') {
        return mapping.ip === hostname;
      } else if (mapping.type === 'loadbalance') {
        return mapping.ips.includes(hostname);
      }
      return false;
    });

    if (isRewrittenIP) {
      console.log(`Bypassing certificate error for intranet IP: ${hostname}`);
      event.preventDefault();
      callback(true); // Trust the certificate
      return;
    }
  }

  // Use default behavior for other certificates
  callback(false);
});

app.on('window-all-closed', () => {
  // Clean up proxy server
  if (proxyServer) {
    proxyServer.stop();
    proxyServer = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up proxy server
  if (proxyServer) {
    proxyServer.stop();
    proxyServer = null;
  }
});

// 安全性：防止新窗口创建
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});