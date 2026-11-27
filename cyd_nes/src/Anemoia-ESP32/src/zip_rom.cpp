#include "zip_rom.h"
#include <Arduino.h>
#include <SD.h>
#include <strings.h>
#include "miniz/miniz.h"

namespace {
uint16_t le16(const uint8_t* p) { return p[0] | (uint16_t(p[1]) << 8); }
uint32_t le32(const uint8_t* p) { return le16(p) | (uint32_t(le16(p + 2)) << 16); }

bool readAt(File& file, uint32_t offset, uint8_t* buffer, size_t size)
{
    return file.seek(offset) && file.read(buffer, size) == size;
}

uint32_t updateCrc(uint32_t crc, const uint8_t* data, size_t length)
{
    while (length--) {
        crc ^= *data++;
        for (int i = 0; i < 8; ++i) crc = (crc >> 1) ^ (0xedb88320u & -(crc & 1));
    }
    return crc;
}
}

const char* extractZipRom(const char* zipPath, const char* outputPath)
{
    File zip = SD.open(zipPath, FILE_READ);
    if (!zip || zip.size() < 22 || zip.size() > UINT32_MAX) return "Cannot open ZIP";
    uint32_t zipSize = zip.size();
    uint32_t first = zipSize > 65557 ? zipSize - 65557 : 0;
    uint8_t end[22];
    uint32_t endOffset = zipSize - 22;
    bool found = false;
    for (;;) {
        if (!readAt(zip, endOffset, end, sizeof(end))) return "ZIP read error";
        if (le32(end) == 0x06054b50 && endOffset + 22u + le16(end + 20) == zipSize) {
            found = true;
            break;
        }
        if (endOffset == first) break;
        --endOffset;
    }
    if (!found || le16(end + 4) || le16(end + 6) || le16(end + 8) != le16(end + 10))
        return "Unsupported ZIP directory";
    uint32_t directory = le32(end + 16);
    uint32_t dirSize = le32(end + 12);
    if (directory > endOffset || dirSize > endOffset - directory) return "Invalid ZIP directory";

    uint32_t dataOffset = 0, compressed = 0, uncompressed = 0, expectedCrc = 0;
    uint16_t method = 0;
    int matches = 0;
    for (uint16_t i = 0; i < le16(end + 10); ++i) {
        uint8_t header[46];
        if (directory > endOffset || endOffset - directory < sizeof(header) ||
            !readAt(zip, directory, header, sizeof(header)) || le32(header) != 0x02014b50)
            return "Invalid ZIP entry";
        uint16_t nameLen = le16(header + 28), extraLen = le16(header + 30), commentLen = le16(header + 32);
        uint32_t entrySize = 46u + nameLen + extraLen + commentLen;
        if (entrySize > endOffset - directory) return "Invalid ZIP entry";
        uint8_t suffix[4];
        if (nameLen >= 4 && readAt(zip, directory + 46u + nameLen - 4, suffix, 4) &&
            suffix[0] == '.' && (suffix[1] | 32) == 'n' && (suffix[2] | 32) == 'e' && (suffix[3] | 32) == 's') {
            if (++matches > 1) return "ZIP has multiple NES files";
            if ((le16(header + 8) & 1) || le16(header + 34)) return "Encrypted or split ZIP";
            method = le16(header + 10);
            if (method != 0 && method != 8) return "Unsupported ZIP compression";
            compressed = le32(header + 20);
            uncompressed = le32(header + 24);
            expectedCrc = le32(header + 16);
            uint32_t local = le32(header + 42);
            uint8_t localHeader[30];
            if (!readAt(zip, local, localHeader, sizeof(localHeader)) ||
                le32(localHeader) != 0x04034b50 || le16(localHeader + 8) != method)
                return "Invalid ZIP header";
            uint64_t offset = uint64_t(local) + 30 + le16(localHeader + 26) + le16(localHeader + 28);
            if (offset > zipSize || compressed > zipSize - offset || uncompressed < 16)
                return "Invalid ZIP size";
            dataOffset = offset;
        }
        directory += entrySize;
    }
    if (!matches) return "No NES file in ZIP";
    if (method == 0 && compressed != uncompressed) return "Invalid ZIP size";
    if (!zip.seek(dataOffset)) return "ZIP seek failed";

    SD.remove(outputPath);
    File output = SD.open(outputPath, FILE_WRITE);
    if (!output) return "Cannot create temp file";
    uint8_t* input = (uint8_t*)malloc(4096);
    uint8_t* dictionary = (uint8_t*)malloc(32768);
    tinfl_decompressor* inflater = (tinfl_decompressor*)malloc(sizeof(tinfl_decompressor));
    const char* error = nullptr;
    uint32_t written = 0, crc = 0xffffffff, remaining = compressed;
    if (!input || !dictionary || !inflater) error = "Not enough memory";
    if (!error && method == 0) {
        while (remaining) {
            size_t count = min(remaining, uint32_t(4096));
            if (zip.read(input, count) != count || output.write(input, count) != count) { error = "ZIP read/write failed"; break; }
            crc = updateCrc(crc, input, count);
            written += count;
            remaining -= count;
        }
    } else if (!error) {
        tinfl_init(inflater);
        size_t offset = 0, available = 0, outOffset = 0;
        tinfl_status status = TINFL_STATUS_NEEDS_MORE_INPUT;
        while (status != TINFL_STATUS_DONE) {
            if (offset == available && remaining) {
                available = min(remaining, uint32_t(4096));
                if (zip.read(input, available) != available) { error = "ZIP read failed"; break; }
                remaining -= available;
                offset = 0;
            }
            size_t consumed = available - offset;
            size_t produced = 32768 - outOffset;
            status = tinfl_decompress(inflater, input + offset, &consumed, dictionary,
                                      dictionary + outOffset, &produced,
                                      remaining ? TINFL_FLAG_HAS_MORE_INPUT : 0);
            offset += consumed;
            if (produced > uncompressed - written ||
                (produced && output.write(dictionary + outOffset, produced) != produced)) {
                error = "ZIP output failed"; break;
            }
            crc = updateCrc(crc, dictionary + outOffset, produced);
            written += produced;
            outOffset = (outOffset + produced) % 32768;
            if (status < 0 || (!consumed && !produced && status != TINFL_STATUS_DONE)) {
                error = "Invalid deflate stream"; break;
            }
        }
        if (!error && (remaining || offset != available)) error = "Invalid ZIP size";
    }
    free(input);
    free(dictionary);
    free(inflater);
    output.close();
    if (!error && (written != uncompressed || (crc ^ 0xffffffff) != expectedCrc))
        error = "ZIP checksum mismatch";
    if (error) SD.remove(outputPath);
    return error;
}
