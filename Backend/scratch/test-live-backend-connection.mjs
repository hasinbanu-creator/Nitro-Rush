/**
 * Live End-to-End Backend Verification Script
 *
 * Uses the actual NetworkManager TypeScript implementation to connect to the live
 * Spring Boot backend, perform guest authentication, execute PING/PONG heartbeat,
 * and measure RTT latency.
 */

import { NetworkManager } from '../../Frontend/src/multiplayer/NetworkManager.ts';
import { MessageType } from '../../Frontend/src/multiplayer/ProtocolTypes.ts';

// In Node 22+, globalThis.WebSocket is natively available
if (typeof WebSocket === 'undefined') {
  console.error('Native WebSocket is required');
  process.exit(1);
}

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8085/ws/game';
console.log(`[TEST] Connecting to Live Spring Boot Backend at ${WS_URL}...`);

// In Node, we provide the allowed origin header that browsers automatically provide
const manager = new NetworkManager({
  wsUrl: WS_URL,
  heartbeatIntervalMs: 5000,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

try {
  // 1. Connect and receive welcome
  const welcome = await manager.connect();
  console.log(`[PASS] 1. Handshake successful! SessionId: ${welcome.sessionId}, Heartbeat: ${welcome.heartbeatIntervalMs}ms`);
  console.log(`[STATE] Current connection state: ${manager.getState()}`);

  // 2. Authenticate as a guest
  console.log('[TEST] Authenticating as guest "CyberGhost"...');
  const auth = await manager.authenticateGuest('CyberGhost');
  console.log(`[PASS] 2. Guest Authentication successful! DisplayName: "${auth.displayName}", TokenMask: ${manager.getGuestToken() ? manager.getGuestToken().slice(0, 8) + '...' : 'null'}`);
  console.log(`[STATE] Current connection state: ${manager.getState()}`);

  // 3. PING/PONG and RTT Measurement
  console.log('[TEST] Sending PING to measure round-trip latency...');
  const pingPromise = new Promise((resolve) => {
    manager.onLatency((rtt, smoothed) => {
      resolve({ rtt, smoothedRttMs: smoothed });
    });
  });

  // Trigger ping
  manager.send(MessageType.PING, { clientTimestamp: Date.now() });

  const latency = await pingPromise;
  console.log(`[PASS] 3. PONG received! RTT: ${latency.rtt}ms, Smoothed RTT: ${latency.smoothedRttMs}ms`);

  // 4. Disconnect cleanly
  manager.disconnect();
  console.log(`[PASS] 4. Disconnected cleanly. Final state: ${manager.getState()}`);

  console.log('\n======================================================');
  console.log('✅ ALL LIVE BACKEND VERIFICATION CHECKS PASSED (100%)');
  console.log('======================================================\n');
  process.exit(0);
} catch (err) {
  console.error('[FAIL] Error during live backend test:', err);
  manager.disconnect();
  process.exit(1);
}
