/**
 * Unit Tests for Nitro Rush SessionStore
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SessionStore } from '../../src/multiplayer/SessionStore.ts';

// Mock localStorage for Node test environment
class MockLocalStorage {
  private store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

describe('SessionStore Unit Tests', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      localStorage: new MockLocalStorage(),
    };
  });

  it('masks sensitive guest tokens safely without leaking full credential', () => {
    assert.strictEqual(SessionStore.maskToken(null), 'null');
    assert.strictEqual(SessionStore.maskToken(''), 'null');
    assert.strictEqual(SessionStore.maskToken('short'), '***');
    assert.strictEqual(
      SessionStore.maskToken('f81d4fae-7dec-11d0-a765-00a0c91e6bf6'),
      'f81d4fae...6bf6'
    );
  });

  it('persists and retrieves a valid guest session', () => {
    const store = new SessionStore();
    assert.strictEqual(store.hasValidSession(), false);

    store.saveSession('token-12345678-abcd', 'SpeedRacer', 'avatar-1');

    assert.strictEqual(store.hasValidSession(), true);
    assert.strictEqual(store.getGuestToken(), 'token-12345678-abcd');
    assert.strictEqual(store.getDisplayName(), 'SpeedRacer');

    const session = store.getSession();
    assert.ok(session);
    assert.strictEqual(session?.avatarId, 'avatar-1');
    assert.ok(session?.createdAt > 0);
  });

  it('gracefully handles missing or empty input data', () => {
    const store = new SessionStore();
    store.saveSession('', '   ');
    assert.strictEqual(store.hasValidSession(), false);

    store.saveSession('valid-token', '');
    assert.strictEqual(store.hasValidSession(), false);
  });

  it('handles corrupted or malformed localStorage JSON gracefully', () => {
    const store = new SessionStore();
    window.localStorage.setItem('nitrorush_guest_session_v1', 'not valid json {{{');

    assert.strictEqual(store.getSession(), null);
    assert.strictEqual(store.hasValidSession(), false);
    // Should have purged the corrupted item
    assert.strictEqual(window.localStorage.getItem('nitrorush_guest_session_v1'), null);
  });

  it('handles invalid schema in localStorage JSON gracefully', () => {
    const store = new SessionStore();
    // Missing required fields
    window.localStorage.setItem(
      'nitrorush_guest_session_v1',
      JSON.stringify({ someRandomField: 123 })
    );

    assert.strictEqual(store.getSession(), null);
    assert.strictEqual(store.hasValidSession(), false);
    assert.strictEqual(window.localStorage.getItem('nitrorush_guest_session_v1'), null);
  });

  it('handles expired sessions (>30 days)', () => {
    const store = new SessionStore();
    const oldTimestamp = Date.now() - 35 * 24 * 60 * 60 * 1000; // 35 days ago
    window.localStorage.setItem(
      'nitrorush_guest_session_v1',
      JSON.stringify({
        guestToken: 'expired-token',
        displayName: 'OldPlayer',
        createdAt: oldTimestamp,
        lastUsedAt: oldTimestamp,
      })
    );

    assert.strictEqual(store.getSession(), null);
    assert.strictEqual(store.hasValidSession(), false);
  });

  it('clears session upon request', () => {
    const store = new SessionStore();
    store.saveSession('tok-999', 'PlayerOne');
    assert.strictEqual(store.hasValidSession(), true);

    store.clearSession();
    assert.strictEqual(store.hasValidSession(), false);
    assert.strictEqual(store.getGuestToken(), null);
  });

  it('falls back safely to in-memory storage if localStorage throws exceptions', () => {
    (globalThis as any).window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError: Access Denied');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
      },
    };

    const store = new SessionStore();
    store.saveSession('in-memory-token', 'PrivateRacer');

    assert.strictEqual(store.hasValidSession(), true);
    assert.strictEqual(store.getGuestToken(), 'in-memory-token');
    assert.strictEqual(store.getDisplayName(), 'PrivateRacer');

    store.clearSession();
    assert.strictEqual(store.hasValidSession(), false);
  });
});

