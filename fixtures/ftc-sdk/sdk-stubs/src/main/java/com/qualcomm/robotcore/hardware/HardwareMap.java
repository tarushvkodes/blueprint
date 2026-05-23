package com.qualcomm.robotcore.hardware;

import java.util.ArrayList;
import java.util.List;

public class HardwareMap {
    public final List<VoltageSensor> voltageSensor = new ArrayList<>();

    public <T> T get(Class<T> type, String name) {
        try {
            return type.getDeclaredConstructor().newInstance();
        } catch (Exception error) {
            return null;
        }
    }
}
