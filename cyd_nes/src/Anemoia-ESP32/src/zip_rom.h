#pragma once

// Extract the single NES file in a ZIP archive. Returns an error message on failure.
const char* extractZipRom(const char* zipPath, const char* outputPath);
