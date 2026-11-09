package com.nitrorush.backend.common;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Deterministic controllable time provider for automated tests.
 */
public class TestTimeProvider implements TimeProvider {

    private final AtomicLong currentMillis;
    private final AtomicLong currentNanos;

    public TestTimeProvider() {
        this(1700000000000L); // standard base epoch
    }

    public TestTimeProvider(long initialMillis) {
        this.currentMillis = new AtomicLong(initialMillis);
        this.currentNanos = new AtomicLong(initialMillis * 1_000_000L);
    }

    @Override
    public long currentTimeMillis() {
        return currentMillis.get();
    }

    @Override
    public long nanoTime() {
        return currentNanos.get();
    }

    public void advanceMillis(long deltaMs) {
        if (deltaMs > 0) {
            currentMillis.addAndGet(deltaMs);
            currentNanos.addAndGet(deltaMs * 1_000_000L);
        }
    }

    public void advanceSeconds(double deltaSec) {
        long deltaMs = Math.round(deltaSec * 1000.0);
        advanceMillis(deltaMs);
    }

    public void setTimeMillis(long targetMillis) {
        currentMillis.set(targetMillis);
        currentNanos.set(targetMillis * 1_000_000L);
    }
}

