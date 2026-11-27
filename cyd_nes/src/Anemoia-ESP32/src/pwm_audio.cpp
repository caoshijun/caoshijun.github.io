#ifdef ANEMOIA_BLUEPAD32
#include "pwm_audio.h"
#include <Arduino.h>
#include <soc/ledc_struct.h>

static constexpr int channel = 2;
static constexpr unsigned capacity = 1024;
static uint16_t samples[capacity];
static volatile unsigned head = 0;
static volatile unsigned tail = 0;

static void IRAM_ATTR audioInterrupt()
{
    uint16_t sample = 0;
    if (tail != head) {
        sample = samples[tail];
        tail = (tail + 1) % capacity;
    }
    LEDC.channel_group[0].channel[channel].duty.duty = sample << 4;
    LEDC.channel_group[0].channel[channel].conf0.sig_out_en = 1;
    LEDC.channel_group[0].channel[channel].conf1.duty_start = 1;
}

void pwmAudioBegin()
{
    ledcSetup(channel, 78125, 10);
    ledcAttachPin(26, channel);
    ledcWrite(channel, 0);
    hw_timer_t* timer = timerBegin(1, 80, true);
    timerAttachInterrupt(timer, &audioInterrupt, true);
    timerAlarmWrite(timer, 45, true);
    timerAlarmEnable(timer);
    Serial.println("[AUDIO] PWM audio on GPIO26");
}

void pwmAudioWrite(const uint16_t* data, size_t frames)
{
    for (size_t i = 0; i < frames; i += 2) {
        unsigned next = (head + 1) % capacity;
        while (next == tail) vTaskDelay(1);
        samples[head] = (data[i * 2] >> 8) * 4;
        head = next;
    }
}
#endif
