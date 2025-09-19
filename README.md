# RUC Portal Desktop

RUC Portal Desktop 是为 [RUC Student Portal](https://learn.ruc.edu.kg) 设计的 Electron 外壳。
- 可配置文件保存路径
- 可配置内网模式，增强在校园网内的使用体验

前端代码详见 [Yanhe-Web](https://github.com/bit-admin/Yanhe-Web)。

## 安装

### macOS

1. 前往发布（Releases）页面下载最新版本
2. 下载适用于您架构（Intel `x64` 或 Apple Silicon `arm64`）的最新 `.dmg` 文件
3. 打开 `.dmg` 文件，将应用拖入 `Applications` 文件夹
4. 首次运行应用程序时，您可能会收到安全警告。要绕过此警告，请执行以下命令：
   ```bash
   sudo xattr -d com.apple.quarantine /Applications/RUC\ Portal.app
   ```
5. 现在您可以从 `Applications` 启动应用

### Windows

1. 前往发布（Releases）页面下载最新版本
2. 下载适用于您架构（通常为 `x64`）的最新 `.exe` 安装包。
3. 运行安装包，按向导完成安装
4. 可选择安装路径、是否创建桌面快捷方式等
5. 安装完成后，从开始菜单或桌面快捷方式启动应用