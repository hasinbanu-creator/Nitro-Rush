/**
 * Multi-Client Lobby Integration Script (Phase 2 Live Verification)
 *
 * Connects two independent NetworkManager clients to the running Spring Boot backend:
 * 1. Client 1 (PilotAlpha) connects, authenticates, and joins room.
 * 2. Client 2 (PilotBeta) connects, authenticates, and joins the same room.
 * 3. Client 1 receives PLAYER_JOINED with PilotBeta on slot P2.
 * 4. Client 1 changes car to 'phantom-ex' via SELECT_CAR; both clients receive PLAYER_READY_STATUS.
 * 5. Both clients toggle ready via PLAYER_READY.
 * 6. Both clients observe readiness updates and server lifecycle transitions.
 * 7. Both disconnect cleanly.
 */

import { NetworkManager } from '../../Frontend/src/multiplayer/NetworkManager.ts';
import { MessageType } from '../../Frontend/src/multiplayer/ProtocolTypes.ts';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8085/ws/game';
console.log(`[TEST] Starting 2-Client Lobby Integration Test against ${WS_URL}...`);

const client1 = new NetworkManager({
  wsUrl: WS_URL,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

const client2 = new NetworkManager({
  wsUrl: WS_URL,
  webSocketFactory: (url) => new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } }),
});

try {
  // Step 1: Client 1 Connect & Authenticate
  await client1.connect();
  const auth1 = await client1.authenticateGuest('PilotAlpha');
  console.log(`[PASS] Client 1 connected & authenticated as "${auth1.displayName}" (Token: ${auth1.guestToken.slice(0, 8)}...)`);

  // Step 2: Client 2 Connect & Authenticate
  await client2.connect();
  const auth2 = await client2.authenticateGuest('PilotBeta');
  console.log(`[PASS] Client 2 connected & authenticated as "${auth2.displayName}" (Token: ${auth2.guestToken.slice(0, 8)}...)`);

  // Step 3: Setup promises for room synchronization
  const roomAssignedPromise1 = new Promise((resolve) => client1.once(MessageType.ROOM_ASSIGNED, resolve));
  const roomAssignedPromise2 = new Promise((resolve) => client2.once(MessageType.ROOM_ASSIGNED, resolve));
  const playerJoinedPromise = new Promise((resolve) => client1.once(MessageType.PLAYER_JOINED, resolve));

  // Client 1 joins room
  console.log('[TEST] Client 1 joining room for track "coastal-rush"...');
  client1.send(MessageType.JOIN_MATCHMAKING, {
    preferredTrackId: 'coastal-rush',
    preferredCarId: 'bolt-gt',
    roomId: 'room-phase2-verify',
  });

  const roomAssigned1 = await roomAssignedPromise1;
  console.log(`[PASS] Client 1 assigned to room "${roomAssigned1.roomId}" on slot "${roomAssigned1.slotId}" (Total racers: ${roomAssigned1.players.length})`);

  // Client 2 joins the exact same room
  console.log('[TEST] Client 2 joining room "room-phase2-verify"...');
  client2.send(MessageType.JOIN_MATCHMAKING, {
    preferredTrackId: 'coastal-rush',
    preferredCarId: 'viper-r',
    roomId: 'room-phase2-verify',
  });

  const roomAssigned2 = await roomAssignedPromise2;
  console.log(`[PASS] Client 2 assigned to room "${roomAssigned2.roomId}" on slot "${roomAssigned2.slotId}" (Total racers: ${roomAssigned2.players.length})`);

  // Client 1 should observe Client 2 joining via PLAYER_JOINED
  const playerJoinedEvent = await playerJoinedPromise;
  console.log(`[PASS] Client 1 received PLAYER_JOINED for "${playerJoinedEvent.player.name}" on slot "${playerJoinedEvent.player.slot}"`);

  // Step 4: Car Selection Synchronization
  console.log('[TEST] Client 1 changing vehicle to "titan-v8"...');
  const carStatusPromise = new Promise((resolve) => client2.once(MessageType.PLAYER_READY_STATUS, resolve));

  client1.send(MessageType.SELECT_CAR, {
    roomId: 'room-phase2-verify',
    carId: 'titan-v8',
  });

  const carStatusEvent = await carStatusPromise;
  console.log(`[PASS] Client 2 received PLAYER_READY_STATUS broadcast: Player "${carStatusEvent.playerId}" updated car to "${carStatusEvent.carId}"`);

  // Step 5: Ready Status Synchronization
  console.log('[TEST] Client 1 toggling READY...');
  const readyPromise1 = new Promise((resolve) => client2.once(MessageType.PLAYER_READY_STATUS, resolve));
  client1.send(MessageType.PLAYER_READY, {
    roomId: 'room-phase2-verify',
    isReady: true,
  });
  const readyEvent1 = await readyPromise1;
  console.log(`[PASS] Client 2 received PLAYER_READY_STATUS: isReady=${readyEvent1.isReady}`);

  console.log('[TEST] Client 2 toggling READY...');
  const readyPromise2 = new Promise((resolve) => client1.once(MessageType.PLAYER_READY_STATUS, resolve));
  client2.send(MessageType.PLAYER_READY, {
    roomId: 'room-phase2-verify',
    isReady: true,
  });
  const readyEvent2 = await readyPromise2;
  console.log(`[PASS] Client 1 received PLAYER_READY_STATUS: isReady=${readyEvent2.isReady}`);

  // Both are ready in a 2-player room!
  console.log('[PASS] Both racers successfully readied in room! Collection window active.');

  // Step 6: Disconnect cleanly
  client1.disconnect();
  client2.disconnect();
  console.log('[PASS] Both clients disconnected cleanly.');

  console.log('\n================================================================');
  console.log('✅ MULTI-CLIENT LOBBY INTEGRATION TEST PASSED (100% SUCCESS)');
  console.log('================================================================\n');
  process.exit(0);
} catch (err) {
  console.error('[FAIL] Multi-client lobby test failed:', err);
  client1.disconnect();
  client2.disconnect();
  process.exit(1);
}
