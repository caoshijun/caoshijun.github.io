#!/usr/bin/env bash
set -euo pipefail
# Use Arduino CLI with ESP32 3.2.1 and TFT_eSPI 2.5.43 installed.
# Supply ARDUINO_CONFIG_FILE if using an isolated Arduino CLI installation.
root="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$root/Anemoia-ESP32" "$work/Anemoia-ESP32"
font="$work/Anemoia-ESP32/fonts/rom_names.bin"
printf '.section .rodata.rom_title_font,"a",@progbits\n.global rom_title_font\nrom_title_font:\n.incbin "%s"\n' "$font" > "$work/Anemoia-ESP32/src/rom_font.S"
cli="${ARDUINO_CLI:-arduino-cli}"
cfg=()
if [[ -n "${ARDUINO_CONFIG_FILE:-}" ]]; then cfg=(--config-file "$ARDUINO_CONFIG_FILE"); fi
arduino_data="$("$cli" "${cfg[@]}" config dump --format json | python3 -c 'import json,sys;print(json.load(sys.stdin)["config"]["directories"]["data"])')"
arduino_user="$("$cli" "${cfg[@]}" config dump --format json | python3 -c 'import json,sys;print(json.load(sys.stdin)["config"]["directories"]["user"])')"
core="$arduino_data/packages/esp32/hardware/esp32/3.2.1"
lib="$arduino_user/libraries/TFT_eSPI"
[[ -f "$core/platform.txt" && -f "$lib/User_Setup.h" ]] || { echo 'Install ESP32 3.2.1 and TFT_eSPI 2.5.43 first.' >&2; exit 1; }
# Isolate the patched platform and TFT_eSPI setup from the user's existing installation.
mkdir -p "$work/data/packages/esp32/hardware/esp32" "$work/user/libraries"
cp -R "$core" "$work/data/packages/esp32/hardware/esp32/3.2.1"
ln -s "$arduino_data/packages/esp32/tools" "$work/data/packages/esp32/tools"
ln -s "$arduino_data/packages/builtin" "$work/data/packages/builtin"
for index in "$arduino_data"/*index*.json; do
 [[ -f "$index" ]] && ln -s "$index" "$work/data/"
done
cp "$root/Anemoia-ESP32/platform.txt" "$work/data/packages/esp32/hardware/esp32/3.2.1/platform.txt"
cp -R "$lib" "$work/user/libraries/TFT_eSPI"
cat > "$work/arduino.yaml" <<YAML
directories:
  data: $work/data
  downloads: $work/downloads
  user: $work/user
YAML
common="-DOPTIMIZATION_FLAGS -Ofast -ffunction-sections -fdata-sections -funroll-loops -fno-tree-vectorize -frename-registers -fno-plt -flto -DSCREEN_SWAP_BYTES -DCHEAP_YELLOW_DISPLAY_CONF -DANEMOIA_EMBED_ROM_FONT"
mkdir -p "$root/build"
for display in st7789 ili9341; do
 cp "$root/Anemoia-ESP32/User_Setups/CYD/User_Setup.h" "$work/user/libraries/TFT_eSPI/User_Setup.h"
 flags="-UFRAMESKIP"
 if [[ "$display" == ili9341 ]]; then
  python3 - "$work/user/libraries/TFT_eSPI/User_Setup.h" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1])
s=p.read_text().replace('#define ST7789_DRIVER','// #define ST7789_DRIVER').replace('// #define ILI9341_DRIVER','#define ILI9341_DRIVER').replace('#define SPI_FREQUENCY 80000000','#define SPI_FREQUENCY 40000000')
p.write_text(s)
PY
  flags="-DFRAMESKIP"
 fi
 "$cli" --config-file "$work/arduino.yaml" compile --fqbn 'esp32:esp32:esp32:PartitionScheme=custom,EventsCore=0'   --build-property "compiler.cpp.extra_flags=$common -fno-exceptions -fno-rtti $flags"   --build-property "compiler.c.extra_flags=$common $flags"   --build-path "$work/build-$display" --output-dir "$root/build/$display" "$work/Anemoia-ESP32"
done
