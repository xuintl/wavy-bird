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
const float waveThresholdG = 0.2f;        // Minimum g-force below rest to trigger wave (lower = more sensitive)
const unsigned long waveCooldownMs = 250; // Minimum time between wave events (ms)

// Gesture state
unsigned long lastWaveMs = 0;  // Last time a wave was emitted

// Calibration baseline
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

    // Auto-calibrate once on startup so the device is immediately usable
    Serial.println(F("Calibrating at startup..."));
    calibrateRestPosition();
    Serial.println(F("Calibration complete"));

    Serial.println(F("Sensor ready. Press '=' in p5 (sends '0') to recalibrate."));
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
        else if (cmd == 'd' || cmd == 'D')
        {
            // Debug mode: print raw values
            Serial.print(F("DEBUG: Z="));
            Serial.print(accel.getCalculatedZ(), 3);
            Serial.print(F(" | Rest Z="));
            Serial.println(restZg, 3);
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

    // Read accelerometer data
    float z = accel.getCalculatedZ();

    detectWave(z);
}

void detectWave(float zG)
{
    unsigned long nowMs = millis();
    if (nowMs - lastWaveMs < waveCooldownMs)
    {
        return; // Ignore waves during cooldown
    }

    // Detect wave as downward movement (drop in Z acceleration)
    // A downward "wave" or "flap" motion triggers the bird to fly upward
    float deltaZ = restZg - zG;
    if (deltaZ > waveThresholdG)
    {
        Serial.println(F("WAVE"));
        lastWaveMs = nowMs;
    }
}

void calibrateRestPosition()
{
    // Take 20 samples over 1 second to average out noise
    // This establishes the "zero" position for the user's current grip
    const int numSamples = 20;
    float sumZ = 0.0f;
    int validSamples = 0;

    for (int i = 0; i < numSamples; i++)
    {
        // Always read the latest values, don't wait for available()
        sumZ += accel.getCalculatedZ();
        validSamples++;
        delay(50);
    }

    if (validSamples > 0)
    {
        restZg = sumZ / validSamples;
        calibrated = true;

        Serial.print(F("Rest position: Z="));
        Serial.println(restZg, 3);
    }
    else
    {
        Serial.println(F("Calibration failed: no samples"));
    }
}
