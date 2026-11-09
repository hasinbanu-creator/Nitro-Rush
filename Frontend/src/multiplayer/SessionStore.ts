/**
 * Nitro Rush Guest Session Store
 *
 * Provides safe persistence for guest session credentials (guest token, display name, avatar)
 * with graceful in-memory fallback if localStorage is disabled, restricted, or quota-exhausted.
 *
 * ============================================================================
 * SECURITY NOTICE & LIMITATIONS OF BROWSER STORAGE:
 * ============================================================================
 * 1. Web Storage (localStorage) is NOT a secure vault. Any JavaScript executing
 *    in the same origin context (including malicious scripts via XSS or compromised
 *    dependencies) has read/write access to stored values.
 * 2. localStorage does NOT provide 'HttpOnly', 'Secure', or 'SameSite' flags that
 *    browser cookies offer to mitigate token exfiltration.
 * 3. Guest tokens implemented here serve strictly as lightweight, transient player
 *    identity for casual multiplayer matches and reconnect recovery.
 * 4. Production authentication involving persistent accounts, ranks, or transactions
 *    must transition to secure HttpOnly cookies backed by OAuth2 / JWT with CSRF tokens.
 * 5. Under no circumstances should full guest tokens be printed in console logs,
 *    DOM elements, or user-facing error dialogues. Use `maskToken()` for diagnostics.
 * ============================================================================
 */

export interface StoredGuestSession {
  guestToken: string;
  displayName: string;
  avatarId?: string;
  createdAt: number;
  lastUsedAt: number;
}

const STORAGE_KEY = 'nitrorush_guest_session_v1';
const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class SessionStore {
  private memoryFallback: StoredGuestSession | null = null;
  private isStorageAvailable: boolean;

  constructor() {
    this.isStorageAvailable = this.checkStorageAvailability();
  }

  /**
   * Tests if localStorage is available and writable in the current browser context.
   * Handles Safari private mode, disabled cookies/storage, and quota exceptions.
   */
  private checkStorageAvailability(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    try {
      const testKey = '__nitrorush_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Masks a guest token so it can be safely referenced in logs without exposing credentials.
   * Example: "f81d4fae-7dec-11d0-a765-00a0c91e6bf6" -> "f81d4fae...6bf6"
   */
  public static maskToken(token: string | null | undefined): string {
    if (!token) return 'null';
    const trimmed = token.trim();
    if (trimmed.length <= 8) return '***';
    return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
  }

  /**
   * Persists a guest session to storage.
   */
  public saveSession(guestToken: string, displayName: string, avatarId?: string): void {
    if (!guestToken || !displayName) {
      return;
    }

    const cleanToken = guestToken.trim();
    const cleanName = displayName.trim();

    if (cleanToken.length === 0 || cleanName.length === 0) {
      return;
    }

    const now = Date.now();
    const session: StoredGuestSession = {
      guestToken: cleanToken,
      displayName: cleanName,
      avatarId: avatarId ? avatarId.trim() : undefined,
      createdAt: now,
      lastUsedAt: now,
    };

    if (this.isStorageAvailable) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        this.memoryFallback = null;
        return;
      } catch {
        // Quota exceeded or permission revoked; fall back to in-memory
        this.isStorageAvailable = false;
      }
    }

    this.memoryFallback = session;
  }

  /**
   * Retrieves active guest session.
   * Returns null if missing, malformed, or expired.
   */
  public getSession(): StoredGuestSession | null {
    if (!this.isStorageAvailable) {
      return this.validateSession(this.memoryFallback);
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed: unknown = JSON.parse(raw);
      const session = this.validateSession(parsed);

      if (!session) {
        // Corrupted or invalid structure — purge safely
        this.clearSession();
        return null;
      }

      // Check age expiration
      const now = Date.now();
      if (now - session.createdAt > MAX_SESSION_AGE_MS) {
        this.clearSession();
        return null;
      }

      return session;
    } catch {
      // JSON parse error or security exception
      this.clearSession();
      return null;
    }
  }

  /**
   * Returns true if a valid, unexpired session exists.
   */
  public hasValidSession(): boolean {
    return this.getSession() !== null;
  }

  /**
   * Returns stored guest token or null. Never exposes full token in logs.
   */
  public getGuestToken(): string | null {
    const session = this.getSession();
    return session ? session.guestToken : null;
  }

  /**
   * Returns stored display name or null.
   */
  public getDisplayName(): string | null {
    const session = this.getSession();
    return session ? session.displayName : null;
  }

  /**
   * Updates lastUsedAt timestamp on the stored session.
   */
  public touch(): void {
    const session = this.getSession();
    if (!session) return;

    session.lastUsedAt = Date.now();
    if (this.isStorageAvailable) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        this.memoryFallback = session;
      }
    } else {
      this.memoryFallback = session;
    }
  }

  /**
   * Clears stored guest session from both localStorage and memory fallback.
   */
  public clearSession(): void {
    this.memoryFallback = null;
    if (this.isStorageAvailable) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore removal errors
      }
    }
  }

  /**
   * Internal validator ensuring deserialized data matches StoredGuestSession schema.
   */
  private validateSession(data: unknown): StoredGuestSession | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const obj = data as Record<string, unknown>;
    if (
      typeof obj.guestToken !== 'string' ||
      obj.guestToken.trim().length === 0 ||
      typeof obj.displayName !== 'string' ||
      obj.displayName.trim().length === 0 ||
      typeof obj.createdAt !== 'number' ||
      isNaN(obj.createdAt)
    ) {
      return null;
    }

    return {
      guestToken: obj.guestToken.trim(),
      displayName: obj.displayName.trim(),
      avatarId: typeof obj.avatarId === 'string' ? obj.avatarId.trim() : undefined,
      createdAt: obj.createdAt,
      lastUsedAt: typeof obj.lastUsedAt === 'number' && !isNaN(obj.lastUsedAt) ? obj.lastUsedAt : obj.createdAt,
    };
  }
}

export const sessionStore = new SessionStore();

