package com.qualcomm.robotcore.util;

public final class Range {
    private Range() {}

    public static double clip(double number, double min, double max) {
        return Math.max(min, Math.min(max, number));
    }
}
