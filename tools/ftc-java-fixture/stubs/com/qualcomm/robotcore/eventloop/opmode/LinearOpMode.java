package com.qualcomm.robotcore.eventloop.opmode;

import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.Telemetry;

public abstract class LinearOpMode {
    public final HardwareMap hardwareMap = new HardwareMap();
    public final Gamepad gamepad1 = new Gamepad();
    public final Gamepad gamepad2 = new Gamepad();
    public final Telemetry telemetry = new Telemetry();

    public abstract void runOpMode() throws InterruptedException;

    public void waitForStart() {
    }

    public boolean opModeIsActive() {
        return false;
    }

    public void sleep(long milliseconds) throws InterruptedException {
        Thread.sleep(Math.max(0L, milliseconds));
    }
}
