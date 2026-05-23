package com.qualcomm.robotcore.hardware;

import com.qualcomm.robotcore.util.Range;

public class Servo {
    private double position;

    public void setPosition(double position) {
        this.position = Range.clip(position, 0.0, 1.0);
    }

    public double getPosition() {
        return position;
    }
}
