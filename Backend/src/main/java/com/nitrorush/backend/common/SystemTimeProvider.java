package com.nitrorush.backend.common;

import org.springframework.stereotype.Component;

/**
 * Standard production time provider backed by system wall clock.
 */
@Component
public class SystemTimeProvider implements TimeProvider {

    @Override
    public long currentTimeMillis() {
        return System.currentTimeMillis();
    }

    @Override
    public long nanoTime() {
        return System.nanoTime();
    }
}

