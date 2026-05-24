package com.qualcomm.robotcore.hardware;

public class HardwareMap {
    public <T> T get(Class<T> type, String name) {
        try {
            return type.getDeclaredConstructor().newInstance();
        } catch (ReflectiveOperationException error) {
            throw new IllegalArgumentException("Cannot create fixture hardware for " + name, error);
        }
    }
}
