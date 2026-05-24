package com.qualcomm.robotcore.hardware;

import java.util.Collections;
import java.lang.Iterable;

public class HardwareMap {
    public final Iterable<VoltageSensor> voltageSensor = Collections.singletonList(new VoltageSensor());

    public <T> T get(Class<T> type, String name) {
        try {
            return type.getDeclaredConstructor().newInstance();
        } catch (ReflectiveOperationException error) {
            throw new IllegalArgumentException("Cannot create fixture hardware for " + name, error);
        }
    }
}
