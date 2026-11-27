# CYD NES 源码与编译

本目录基于上游 Anemoia-ESP32 提交 7cdf2814c8560436f9001dc3d43c89e391035781。游戏目录为 SD 卡上的 /roms/nes/，支持 .nes 和包含单个 .nes 文件的 ZIP（stored / deflate）。ZIP 解压至 /.anemoia/rom.tmp，启动时校验 CRC。

固件配置为经典 ESP32 CYD、串口控制器、横屏、GPIO26 DAC、80 MHz SD。ST7789 屏幕 SPI 80 MHz，ILI9341 屏幕 SPI 40 MHz。设备已保存的 runtime_config.bin 可以覆盖设置。

安装 Arduino CLI 1.4.1、ESP32 开发板核心 3.2.1 和 TFT_eSPI 2.5.43，运行 ./build.sh。脚本使用临时构建目录输出 build/st7789 和 build/ili9341。可通过 ARDUINO_CLI 和 ARDUINO_CONFIG_FILE 指定 CLI 和配置文件。

源代码采用上游 GPL-3.0，中文字体使用 GNU Unifont 16.0.04（SIL OFL 1.1），ZIP 解压使用 miniz（MIT）。许可文件位于 Anemoia-ESP32/fonts/ 和 Anemoia-ESP32/src/miniz/。
