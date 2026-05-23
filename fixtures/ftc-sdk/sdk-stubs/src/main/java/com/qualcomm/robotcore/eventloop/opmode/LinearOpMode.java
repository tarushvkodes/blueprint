package com.qualcomm.robotcore.eventloop.opmode;

import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;

public abstract class LinearOpMode {
    protected final HardwareMap hardwareMap = new HardwareMap();
    protected final Telemetry telemetry = new Telemetry();
    protected final Gamepad gamepad1 = new Gamepad();
    protected final Gamepad gamepad2 = new Gamepad();

    public abstract void runOpMode() throws InterruptedException;

    public void waitForStart() {
    }

    public boolean opModeIsActive() {
        return true;
    }

    public void sleep(long milliseconds) throws InterruptedException {
    }
}
