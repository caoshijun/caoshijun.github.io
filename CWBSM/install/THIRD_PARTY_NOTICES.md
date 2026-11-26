# Third-party notices

- ESP Web Tools **10.5.2**, ESPHome contributors, Apache License 2.0. Source: https://github.com/esphome/esp-web-tools . Official documentation: https://esphome.github.io/esp-web-tools/ . Distributed prebuilt browser bundle from the official npm pack (one change: the install dialog writes at the baud rate chosen on the page, 460800 by default, instead of 115200, see `vendor/esp-web-tools/version.json`)age; its LICENSE is in `vendor/esp-web-tools/LICENSE`, package provenance and integrity in `vendor/esp-web-tools/version.json`. Bundled dependencies retain their upstream copyright and license notices in the JavaScript distribution; consult the upstream package for dependency sources.
- Lucide icons, ISC License. License: `assets/icons/LICENSE`. Source: https://lucide.dev/ . Five existing project icons are used for clock, weather, Bitcoin, stocks and MFA.
- Firmware is the CWBSM Arduino project build. It is built with ESP-IDF v4.4.7 and Arduino-ESP32 2.0.17; the other component versions are pinned in the source project's `tools/idf_setup.sh`; the binary packages do not grant ownership of third-party code. Preserve applicable upstream notices when redistributing or modifying the project.

The installer layout, device illustration and remaining simple SVG assets were created for CWBSM. No endorsement by ESPHome, Espressif or board manufacturers is implied.
