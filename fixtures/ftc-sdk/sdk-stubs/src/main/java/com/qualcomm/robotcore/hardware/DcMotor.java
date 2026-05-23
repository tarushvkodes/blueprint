package com.qualcomm.robotcore.hardware;

public class DcMotor {
    public enum Direction {
        FORWARD,
        REVERSE
    }

    public enum ZeroPowerBehavior {
        BRAKE,
        FLOAT
    }

    public enum RunMode {
        STOP_AND_RESET_ENCODER,
        RUN_USING_ENCODER,
        RUN_TO_POSITION
    }

    private double power;
    private int targetPosition;

    public void setPower(double power) {
        this.power = power;
    }

    public double getPower() {
        return power;
    }

    public void setDirection(Direction direction) {
    }

    public void setZeroPowerBehavior(ZeroPowerBehavior behavior) {
    }

    public void setMode(RunMode mode) {
    }

    public void setTargetPosition(int targetPosition) {
        this.targetPosition = targetPosition;
    }

    public int getTargetPosition() {
        return targetPosition;
    }
}
