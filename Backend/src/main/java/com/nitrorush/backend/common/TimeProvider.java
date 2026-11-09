package com.nitrorush.backend.common;

/**
 * Deterministic time abstraction allowing testable clock injection.
 */
public interface TimeProvider {

    /**
     * Returns current time in milliseconds since unix epoch.
     */
    long currentTimeMillis();

    /**
     * Returns current nano timestamp for measuring intervals.
     */
    long nanoTime();
}

