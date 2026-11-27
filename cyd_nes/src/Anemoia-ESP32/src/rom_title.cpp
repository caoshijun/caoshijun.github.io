#include "rom_title.h"
#include <SD.h>

#ifdef ANEMOIA_EMBED_ROM_FONT
extern const uint8_t romTitleFont[] asm("rom_title_font");
#endif

static uint32_t nextCharacter(const char*& text)
{
    uint8_t lead = *text++;
    if (lead < 128) return lead;
    if (lead < 0xc2 || lead > 0xf4) return 0xfffd;
    int count = lead < 0xe0 ? 1 : lead < 0xf0 ? 2 : 3;
    uint32_t code = lead & (0x7f >> (count + 1));
    while (count--) {
        uint8_t tail = *text;
        if ((tail & 0xc0) != 0x80) return 0xfffd;
        code = (code << 6) | (tail & 63);
        ++text;
    }
    return code;
}

static int glyphOffset(uint32_t code)
{
    static const uint16_t ranges[][2] = {
        {0x20, 0x7e}, {0x3000, 0x30ff}, {0x3400, 0x9fff},
        {0xf900, 0xfaff}, {0xff01, 0xff60}
    };
    int index = 0;
    for (const auto& range : ranges) {
        if (code >= range[0] && code <= range[1]) return (index + code - range[0]) * 32;
        index += range[1] - range[0] + 1;
    }
    return -1;
}

void drawRomTitle(TFT_eSPI& screen, const char* name, int x, int y, int width, uint16_t color)
{
    // Reserve space for an ellipsis only when the complete title cannot fit.
    int pixels = 0;
    for (const char* p = name; *p;) pixels += nextCharacter(p) < 128 ? 6 : 16;
    int remaining = pixels > width ? width - 18 : width;
    screen.setTextColor(color);
#ifndef ANEMOIA_EMBED_ROM_FONT
    File file;
#endif
    while (*name) {
        uint32_t code = nextCharacter(name);
        int advance = code < 128 ? 6 : 16;
        if (remaining < advance) {
            screen.drawString("...", x, y + 4, 1);
            break;
        }
        if (code < 128) screen.drawChar(code, x, y + 4, 1);
        else {
            int offset = glyphOffset(code);
            const uint8_t* bitmap = nullptr;
#ifdef ANEMOIA_EMBED_ROM_FONT
            if (offset >= 0) bitmap = romTitleFont + offset;
#else
            uint8_t glyph[32];
            if (!file) file = SD.open("/rom_names.bin");
            if (offset >= 0 && file && file.seek(offset) && file.read(glyph, 32) == 32) bitmap = glyph;
#endif
            if (bitmap) screen.drawBitmap(x, y, bitmap, 16, 16, color);
            else screen.drawRect(x + 2, y + 2, 12, 12, color);
        }
        x += advance;
        remaining -= advance;
    }
}
