// Wiring (SparkFun MMA8452Q breakout):
// VCC -> 3.3V, GND -> GND, SDA -> hardware SDA (A4 on Uno), SCL -> hardware SCL (A5 on Uno).
// INT1/INT2 are not used in this sketch; leave unconnected or pulled high. Sensor is 3.3V only.

#include <Wire.h>

const byte MMA8452Q_ADDRESS = 0x1D; // SA0 pulled high on SparkFun board
const byte MMA8452Q_WHO_AM_I = 0x0D;
const byte MMA8452Q_CTRL_REG1 = 0x2A;
const byte MMA8452Q_CTRL_REG2 = 0x2B;
const byte MMA8452Q_XYZ_DATA_CFG = 0x0E;
const byte MMA8452Q_OUT_X_MSB = 0x01;

const byte EXPECTED_ID = 0x2A;
const float COUNTS_PER_G = 4096.0f; // 2 g scale, 14-bit mode

unsigned long lastSampleMs = 0;
const unsigned long samplePeriodMs = 50; // 20 Hz logging

// Gesture thresholds
const float bumpThresholdG = 1.2f;        // Additional g over baseline Z to count as a bump (more sensitive)
const unsigned long bumpCooldownMs = 200; // Debounce bump events
const float tiltOnDeg = 30.0f;            // Angle to trigger tilt event
const float tiltOffDeg = 20.0f;           // Angle to clear latch (hysteresis)

// Gesture state (debounce and velocity tracking)
unsigned long lastBumpMs = 0;  // Last time a bump was emitted
int lastTiltDir = 0;           // -1 left, 0 none, +1 right
float lastAngleDeg = 0.0f;     // Previous angle for velocity
unsigned long lastAngleMs = 0; // Timestamp for velocity

// Calibration baseline
float restXg = 0.0f;
float restYg = 0.0f;
float restZg = 1.0f;
bool calibrated = false;

void setup()
{
    Serial.begin(115200);
    while (!Serial)
    {
        ;
    }

    Serial.println(F("SparkFun MMA8452Q quick test"));

    Wire.begin();
    Wire.setClock(400000); // Sensor supports 400 kHz fast mode

    if (!initMMA8452Q())
    {
        Serial.println(F("Initialization failed. Check wiring and power."));
        while (true)
        {
            delay(1000);
        }
    }

    Serial.println(F("Sensor ready. Calibrating..."));
    calibrateRestPosition();
    Serial.println(F("READY"));
}

void loop()
{
    if (millis() - lastSampleMs < samplePeriodMs)
    {
        return;
    }
    lastSampleMs = millis();

    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
    int16_t rawX = 0;
    int16_t rawY = 0;
    int16_t rawZ = 0;

    if (!readAcceleration(rawX, rawY, rawZ, x, y, z))
    {
        Serial.println(F("Read error"));
        return;
    }

    detectBump(z);
    detectTilt(x, y, z);
}

bool initMMA8452Q()
{
    byte id = 0;
    if (!readRegister(MMA8452Q_WHO_AM_I, id))
    {
        Serial.println(F("WHO_AM_I read failed"));
        return false;
    }

    if (id != EXPECTED_ID)
    {
        Serial.print(F("Unexpected WHO_AM_I: 0x"));
        Serial.println(id, HEX);
        return false;
    }

    if (!standbyMMA8452Q())
    {
        return false;
    }

    // +/-2g range, high-resolution oversampling
    if (!writeRegister(MMA8452Q_XYZ_DATA_CFG, 0x00))
    {
        return false;
    }

    // Control register 2: high-res mode
    if (!writeRegister(MMA8452Q_CTRL_REG2, 0x02))
    {
        return false;
    }

    // Activate, 100 Hz ODR (0b0100), low-noise off
    byte ctrl1 = 0x01 | (0x02 << 3);
    if (!writeRegister(MMA8452Q_CTRL_REG1, ctrl1))
    {
        return false;
    }

    delay(10);
    return true;
}

bool standbyMMA8452Q()
{
    byte current = 0;
    if (!readRegister(MMA8452Q_CTRL_REG1, current))
    {
        return false;
    }

    if ((current & 0x01) == 0)
    {
        return true; // Already in standby
    }

    byte standbyValue = current & ~0x01;
    if (!writeRegister(MMA8452Q_CTRL_REG1, standbyValue))
    {
        return false;
    }

    delay(1);
    return true;
}

bool readAcceleration(int16_t &rawX, int16_t &rawY, int16_t &rawZ, float &x, float &y, float &z)
{
    byte buffer[6] = {0};
    if (!readRegisters(MMA8452Q_OUT_X_MSB, buffer, sizeof(buffer)))
    {
        return false;
    }

    rawX = (int16_t)((buffer[0] << 8) | buffer[1]) >> 2;
    rawY = (int16_t)((buffer[2] << 8) | buffer[3]) >> 2;
    rawZ = (int16_t)((buffer[4] << 8) | buffer[5]) >> 2;

    x = rawX / COUNTS_PER_G;
    y = rawY / COUNTS_PER_G;
    z = rawZ / COUNTS_PER_G;
    return true;
}

bool writeRegister(byte reg, byte value)
{
    Wire.beginTransmission(MMA8452Q_ADDRESS);
    Wire.write(reg);
    Wire.write(value);
    return Wire.endTransmission() == 0;
}

bool readRegister(byte reg, byte &value)
{
    if (!readRegisters(reg, &value, 1))
    {
        return false;
    }
    return true;
}

bool readRegisters(byte startReg, byte *buffer, byte length)
{
    Wire.beginTransmission(MMA8452Q_ADDRESS);
    Wire.write(startReg);
    if (Wire.endTransmission(false) != 0)
    {
        return false;
    }

    byte received = Wire.requestFrom(MMA8452Q_ADDRESS, length, true);
    if (received != length)
    {
        return false;
    }

    for (byte i = 0; i < length; ++i)
    {
        buffer[i] = Wire.read();
    }
    return true;
}

void detectBump(float zG)
{
    unsigned long nowMs = millis();
    if (nowMs - lastBumpMs < bumpCooldownMs)
    {
        return;
    }

    // Detect bump as deviation from calibrated rest Z
    float deltaZ = zG - restZg;
    if (deltaZ > bumpThresholdG)
    {
        Serial.println(F("WAVE"));
        lastBumpMs = nowMs;
    }
}

void detectTilt(float xG, float yG, float zG)
{
    unsigned long nowMs = millis();
    // Calculate tilt angle around the X-axis relative to calibrated rest position
    // Subtract rest baseline to get relative tilt
    float relX = xG - restXg;
    float relY = yG - restYg;
    float relZ = zG - restZg;

    // Angle sign: positive = right tilt, negative = left tilt
    float angleDeg = atan2f(relX, sqrtf((relY * relY) + (relZ * relZ))) * (180.0f / PI);

    // Angular velocity (deg/s)
    float velocityDegPerSec = 0.0f;
    if (lastAngleMs != 0 && lastTiltDir != 0) // Only calculate velocity when actively tilted
    {
        unsigned long dt = nowMs - lastAngleMs;
        if (dt > 0)
        {
            velocityDegPerSec = (angleDeg - lastAngleDeg) * 1000.0f / dt;
        }
    }
    lastAngleDeg = angleDeg;
    lastAngleMs = nowMs;

    // Hysteresis: enter when beyond tiltOnDeg, exit when within tiltOffDeg
    if (angleDeg > tiltOnDeg && lastTiltDir != 1)
    {
        // Right tilt event
        Serial.print(F("TILT_RIGHT:"));
        Serial.print((int)abs(velocityDegPerSec));
        Serial.print(F(":"));
        Serial.println(angleDeg, 1);
        lastTiltDir = 1;
    }
    else if (angleDeg < -tiltOnDeg && lastTiltDir != -1)
    {
        // Left tilt event
        Serial.print(F("TILT_LEFT:"));
        Serial.print((int)abs(velocityDegPerSec));
        Serial.print(F(":"));
        Serial.println(angleDeg, 1);
        lastTiltDir = -1;
    }
    else if (fabs(angleDeg) < tiltOffDeg)
    {
        if (lastTiltDir != 0)
        {
            // Reset velocity tracking when returning to center
            lastAngleMs = 0;
        }
        lastTiltDir = 0;
    }
}

void calibrateRestPosition()
{
    // Take 20 samples over 1 second to average out noise
    const int numSamples = 20;
    float sumX = 0.0f;
    float sumY = 0.0f;
    float sumZ = 0.0f;

    for (int i = 0; i < numSamples; i++)
    {
        float x, y, z;
        int16_t rawX, rawY, rawZ;
        if (readAcceleration(rawX, rawY, rawZ, x, y, z))
        {
            sumX += x;
            sumY += y;
            sumZ += z;
        }
        delay(50);
    }

    restXg = sumX / numSamples;
    restYg = sumY / numSamples;
    restZg = sumZ / numSamples;
    calibrated = true;

    Serial.print(F("Calibrated rest: X="));
    Serial.print(restXg, 3);
    Serial.print(F("g Y="));
    Serial.print(restYg, 3);
    Serial.print(F("g Z="));
    Serial.print(restZg, 3);
    Serial.println(F("g"));
}
