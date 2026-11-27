#pragma once
#include <stdint.h>
#include <stddef.h>
void pwmAudioBegin();
void pwmAudioWrite(const uint16_t* samples, size_t frames);
