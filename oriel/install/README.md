# Oriel v3.2.0 Web Installer

在本目录执行 `python3 -m http.server 8766 --bind 127.0.0.1`，使用桌面 Chrome 或 Edge 打开 http://127.0.0.1:8766 。不能直接双击 HTML 烧录。

按开发板（CYD / E32R28T）和屏幕（ILI9341 / ST7789）选择四种固件之一，等待固件 SHA-256 校验通过，再连接 USB 烧录。从 v3.0 升级保留设置时不要选择擦除。页面同时写入 bootloader 与分区表，无需另外刷入。

本地资源完整打包，无需 CDN。测试清单见 TESTING.md。
