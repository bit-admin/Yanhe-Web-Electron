const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置管理
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),

  // 目录选择
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openDirectory: (path) => ipcRenderer.invoke('open-directory', path),

  // 内网模式管理
  toggleIntranetMode: (enabled) => ipcRenderer.invoke('toggle-intranet-mode', enabled),
  getIntranetStatus: () => ipcRenderer.invoke('get-intranet-status'),

  // 下载事件监听
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, data) => callback(data));
  },
  onDownloadCompleted: (callback) => {
    ipcRenderer.on('download-completed', (_, data) => callback(data));
  },
  onDownloadFailed: (callback) => {
    ipcRenderer.on('download-failed', (_, data) => callback(data));
  },

  // 移除监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// 注入下载增强脚本到网页
window.addEventListener('DOMContentLoaded', () => {
  // 创建下载进度显示器
  const progressContainer = document.createElement('div');
  progressContainer.id = 'electron-download-progress';
  progressContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    z-index: 10000;
    display: none;
    min-width: 250px;
  `;
  document.body.appendChild(progressContainer);

  // 监听下载事件
  if (window.electronAPI) {
    window.electronAPI.onDownloadProgress((data) => {
      progressContainer.style.display = 'block';
      progressContainer.innerHTML = `
        <div style="margin-bottom: 5px;">${data.fileName}</div>
        <div style="background: #333; border-radius: 3px; overflow: hidden;">
          <div style="background: #4CAF50; height: 6px; width: ${data.progress}%; transition: width 0.3s;"></div>
        </div>
        <div style="margin-top: 5px; font-size: 12px; opacity: 0.8;">
          ${Math.round(data.received / 1024 / 1024 * 100) / 100} MB / ${Math.round(data.total / 1024 / 1024 * 100) / 100} MB (${data.progress}%)
        </div>
      `;
    });

    window.electronAPI.onDownloadCompleted((data) => {
      progressContainer.innerHTML = `
        <div style="color: #4CAF50;">✓ Download completed</div>
        <div style="margin-top: 5px; font-size: 12px;">${data.fileName}</div>
        <button onclick="window.electronAPI.openDirectory('${data.filePath.replace(/\\/g, '\\\\')}')"
                style="margin-top: 8px; padding: 4px 8px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">
          Show in Folder
        </button>
      `;

      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 5000);
    });

    window.electronAPI.onDownloadFailed((data) => {
      progressContainer.innerHTML = `
        <div style="color: #f44336;">✗ Download failed</div>
        <div style="margin-top: 5px; font-size: 12px;">${data.fileName}</div>
        <div style="margin-top: 5px; font-size: 11px; opacity: 0.8;">Error: ${data.error}</div>
      `;

      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 5000);
    });
  }

  // 在Electron中隐藏复制按钮（因为剪贴板权限问题）
  const hideCopyButtons = () => {
    // 隐藏主要的复制URL按钮
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    if (copyUrlBtn) {
      copyUrlBtn.style.display = 'none';
    }

    // 隐藏相机流URL旁的复制按钮
    const cameraUrlContainer = document.getElementById('cameraUrl');
    if (cameraUrlContainer && cameraUrlContainer.nextElementSibling) {
      cameraUrlContainer.nextElementSibling.style.display = 'none';
    }

    // 隐藏屏幕流URL旁的复制按钮
    const screenUrlContainer = document.getElementById('screenUrl');
    if (screenUrlContainer && screenUrlContainer.nextElementSibling) {
      screenUrlContainer.nextElementSibling.style.display = 'none';
    }

    // 隐藏整个URL显示区域，因为复制功能不可用
    const urlSection = document.querySelector('.stream-url-section');
    if (urlSection) {
      urlSection.style.display = 'none';
    }
  };

  // 延迟执行以确保DOM完全加载
  setTimeout(hideCopyButtons, 100);
});