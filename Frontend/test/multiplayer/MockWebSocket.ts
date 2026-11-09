/**
 * Mock WebSocket Implementation for Deterministic Automated Testing
 *
 * Implements the standard browser WebSocket interface with synchronous
 * simulation controls for unit tests.
 */

export class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public url: string;
  public readyState: number = MockWebSocket.CONNECTING;

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  public sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  public send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error(`Cannot send while readyState is ${this.readyState}`);
    }
    this.sentMessages.push(data);
  }

  public close(code: number = 1000, reason: string = 'Normal Closure'): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSING;
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, wasClean: code === 1000 } as CloseEvent);
    }
  }

  // ==========================================================================
  // Test Harness Simulation Controls
  // ==========================================================================

  public simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  public simulateMessage(data: string | object): void {
    if (this.readyState !== MockWebSocket.OPEN) return;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: text }));
    }
  }

  public simulateError(errorEvent?: Event): void {
    if (this.onerror) {
      this.onerror(errorEvent || new Event('error'));
    }
  }

  public simulateClose(code: number = 1000, reason: string = 'Normal Closure'): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, wasClean: code === 1000 } as CloseEvent);
    }
  }

  public getSentEnvelopes<T = any>(): T[] {
    return this.sentMessages.map((m) => JSON.parse(m) as T);
  }

  public clearSent(): void {
    this.sentMessages = [];
  }
}

