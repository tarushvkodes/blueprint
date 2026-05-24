package com.qualcomm.robotcore.hardware;

public class DcMotor {
    public enum Direction {
        FORWARD,
        REVERSE
    }

    public enum ZeroPowerBehavior {
        FLOAT,
        BRAKE
    }

    public enum RunMode {
        RUN_WITHOUT_ENCODER,
        RUN_USING_ENCODER,
        RUN_TO_POSITION,
        STOP_AND_RESET_ENCODER
    }

    public void setDirection(Direction direction) {
    }

    public void setZeroPowerBehavior(ZeroPowerBehavior behavior) {
    }

    public void setMode(RunMode mode) {
    }

    public void setPower(double power) {
    }

    public void setTargetPosition(int position) {
    }
}
