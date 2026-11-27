#ifdef ANEMOIA_BLUEPAD32
#include "bluetooth_input.h"
#include "controller.h"
#include <Bluepad32.h>
#include <atomic>

static ControllerPtr pad = nullptr;
static std::atomic<uint8_t> buttons{0};

static void connected(ControllerPtr device)
{
    if (!pad && device->isGamepad()) pad = device;
}

static void disconnected(ControllerPtr device)
{
    if (pad == device) pad = nullptr;
}

static uint8_t readPad(ControllerPtr p)
{
    if (!p || !p->isConnected()) return 0;
    uint8_t state = 0;
    const uint8_t d = p->dpad();
    if ((d & DPAD_UP) || p->axisY() < -220) state |= uint8_t(CONTROLLER::Up);
    if ((d & DPAD_DOWN) || p->axisY() > 220) state |= uint8_t(CONTROLLER::Down);
    if ((d & DPAD_LEFT) || p->axisX() < -220) state |= uint8_t(CONTROLLER::Left);
    if ((d & DPAD_RIGHT) || p->axisX() > 220) state |= uint8_t(CONTROLLER::Right);
    if (p->a()) state |= uint8_t(CONTROLLER::A);
    if (p->b()) state |= uint8_t(CONTROLLER::B);
    if (p->miscStart()) state |= uint8_t(CONTROLLER::Start);
    if (p->miscSelect()) state |= uint8_t(CONTROLLER::Select);
    return state;
}

static void pollBluetooth(void*)
{
    for (;;) {
        BP32.update();
        buttons.store(readPad(pad), std::memory_order_relaxed);
        vTaskDelay(pdMS_TO_TICKS(8));
    }
}

void startBluetoothInput()
{
    BP32.setup(connected, disconnected);
    BP32.enableVirtualDevice(false);
    BP32.enableNewBluetoothConnections(true);
    xTaskCreatePinnedToCore(pollBluetooth, "Gamepad", 3072, nullptr, 2, nullptr, 0);
}

uint8_t bluetoothButtons()
{
    return buttons.load(std::memory_order_relaxed);
}
#endif
