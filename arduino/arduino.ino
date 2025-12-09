/*
  Wavy Bird - MMA8452Q Accelerometer Integration

    Serial Monitor: 9600 baud

  Hardware hookup:
  Arduino --------------- MMA8452Q Breakout
    3.3V  ---------------     3.3V
    GND   ---------------     GND
  SDA (A4) --\/330 Ohm\/--    SDA
  SCL (A5) --\/330 Ohm\/--    SCL

  The MMA8452Q is a 3.3V max sensor, so you'll need to do some
  level-shifting between the Arduino and the breakout. Series
  resistors on the SDA and SCL lines should do the trick.
*/

#include <Wire.h>
#include "SparkFun_MMA8452Q.h"

MMA8452Q accel; // Create instance of the MMA8452Q class

unsigned long lastSampleMs = 0;
const unsigned long samplePeriodMs = 50; // 20 Hz sampling

// Gesture thresholds
const float waveThresholdG = 0.5f;        // Minimum g-force below rest to trigger wave (lower = more sensitive)
const unsigned long waveCooldownMs = 200; // Minimum time between wave events (ms)
const float tiltOnDeg = 30.0f;            // Tilt angle required to trigger event (lower = more sensitive)
const float tiltOffDeg = 20.0f;           // Angle below which tilt resets (hysteresis prevents flicker)

// Gesture state
unsigned long lastWaveMs = 0;  // Last time a wave was emitted
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
    Serial.begin(9600);
    while (!Serial)
    {
        ;
    }

    Serial.println(F("MMA8452Q Gesture Detection"));

    Wire.begin();
    Wire.setClock(400000); // Fast I2C mode (400 kHz)

    if (accel.begin() == false)
    {
        Serial.println(F("Sensor not connected. Check wiring."));
        while (true)
        {
            delay(1000);
        }
    }

    // Set output data rate to 100 Hz (balances responsiveness and power)
    accel.setDataRate(ODR_100);

    Serial.println(F("Sensor ready. Send '0' to calibrate."));
    Serial.println(F("READY"));
}

void loop()
{
    // Check for serial commands
    if (Serial.available() > 0)
    {
        char cmd = Serial.read();
        if (cmd == '0')
        {
            Serial.println(F("Calibrating..."));
            calibrateRestPosition();
            Serial.println(F("Calibration complete"));
        }
    }

    if (millis() - lastSampleMs < samplePeriodMs)
    {
        return;
    }
    lastSampleMs = millis();

    // Only process gestures if calibrated
    if (!calibrated)
    {
        return;
    }

    if (accel.available())
    {
        float x = accel.getCalculatedX();
        float y = accel.getCalculatedY();
        float z = accel.getCalculatedZ();

        detectWave(z);
        detectTilt(x, y, z);
    }
}

void detectWave(float zG)
{
    unsigned long nowMs = millis();
    if (nowMs - lastWaveMs < waveCooldownMs)
    {
        return; // Ignore waves during cooldown
    }

    // Detect wave as deviation from calibrated rest Z
    // A "wave" or "flap" usually results in a sudden drop in Z acceleration
    float deltaZ = restZg - zG;
    if (deltaZ > waveThresholdG)
    {
        Serial.println(F("WAVE"));
        lastWaveMs = nowMs;
    }
}

void detectTilt(float xG, float yG, float zG)
{
    unsigned long nowMs = millis();
    // Calculate tilt angle around the X-axis relative to calibrated rest position
    float relX = xG - restXg;
    float relY = yG - restYg;
    float relZ = zG - restZg;

    // Angle sign: positive = right tilt, negative = left tilt
    // We use atan2 to get the angle in the Y-Z plane
    float angleDeg = atan2f(relX, sqrtf((relY * relY) + (relZ * relZ))) * (180.0f / PI);

    // Angular velocity (deg/s)
    float velocityDegPerSec = 0.0f;
    if (lastAngleMs != 0 && lastTiltDir != 0)
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
    // This prevents the state from flickering when near the threshold
    if (angleDeg > tiltOnDeg && lastTiltDir != 1)
    {
        Serial.print(F("TILT_RIGHT:"));
        Serial.print((int)abs(velocityDegPerSec));
        Serial.print(F(":"));
        Serial.println(angleDeg, 1);
        lastTiltDir = 1;
    }
    else if (angleDeg < -tiltOnDeg && lastTiltDir != -1)
    {
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
            lastAngleMs = 0;
        }
        lastTiltDir = 0;
    }
}

void calibrateRestPosition()
{
    // Take 20 samples over 1 second to average out noise
    // This establishes the "zero" position for the user's current grip
    const int numSamples = 20;
    float sumX = 0.0f;
    float sumY = 0.0f;
    float sumZ = 0.0f;

    for (int i = 0; i < numSamples; i++)
    {
        if (accel.available())
        {
            sumX += accel.getCalculatedX();
            sumY += accel.getCalculatedY();
            sumZ += accel.getCalculatedZ();
        }
        delay(50);
    }

    restXg = sumX / numSamples;
    restYg = sumY / numSamples;
    restZg = sumZ / numSamples;
    calibrated = true;

    Serial.print(F("Rest position: X="));
    Serial.print(restXg, 3);
    Serial.print(F("g Y="));
    Serial.print(restYg, 3);
    Serial.print(F("g Z="));
    Serial.print(restZg, 3);
    Serial.println(F("g"));
}
