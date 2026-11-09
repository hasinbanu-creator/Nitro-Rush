/**
 * Nitro Rush — Client Input History Ring Buffer
 *
 * Stores a fixed-capacity ring buffer of locally simulated driver inputs and
 * resulting physics snapshots. When the authoritative server acknowledges an input
 * sequence via `ackInputSeq`, older entries are evicted while unacknowledged entries
 * are retained for deterministic server reconciliation re-simulation.
 */

import type { CarInputState } from '../game/CarController';

export interface VehiclePhysicsSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  forwardSpeed: number;
  lateralSpeed: number;
  currentSpeedKMH: number;
  nitroAmount: number;
  isDrifting: boolean;
  isReverseGear: boolean;
}

export interface InputHistoryItem {
  sequenceNumber: number;
  timestamp: number;
  input: CarInputState;
  stateSnapshot: VehiclePhysicsSnapshot;
}

export class InputHistoryBuffer {
  private buffer: (InputHistoryItem | null)[];
  private readonly capacity: number;
  private head: number = 0;
  private count: number = 0;

  constructor(capacity: number = 120) {
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than zero');
    }
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  /**
   * Pushes a new input state and predicted snapshot to the buffer.
   * Evicts the oldest entry if the buffer reaches maximum capacity.
   */
  public push(item: InputHistoryItem): void {
    const index = (this.head + this.count) % this.capacity;

    if (this.count === this.capacity) {
      // Buffer full, advance head to overwrite oldest
      this.buffer[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.buffer[index] = item;
      this.count++;
    }
  }

  /**
   * Retrieves an item by its exact sequence number.
   */
  public get(sequenceNumber: number): InputHistoryItem | undefined {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const item = this.buffer[idx];
      if (item && item.sequenceNumber === sequenceNumber) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Evicts all history items with sequenceNumber <= ackSeq.
   */
  public acknowledge(ackSeq: number): void {
    let evictedCount = 0;

    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const item = this.buffer[idx];
      if (item && item.sequenceNumber <= ackSeq) {
        this.buffer[idx] = null;
        evictedCount++;
      } else {
        // Items are inserted monotonically; stop after first unacknowledged
        break;
      }
    }

    this.head = (this.head + evictedCount) % this.capacity;
    this.count -= evictedCount;
  }

  /**
   * Returns all unacknowledged items in ascending sequence order.
   */
  public getUnacknowledged(): InputHistoryItem[] {
    const unacked: InputHistoryItem[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const item = this.buffer[idx];
      if (item) {
        unacked.push(item);
      }
    }
    return unacked;
  }

  /**
   * Returns the most recently pushed history item.
   */
  public latest(): InputHistoryItem | undefined {
    if (this.count === 0) return undefined;
    const lastIdx = (this.head + this.count - 1) % this.capacity;
    return this.buffer[lastIdx] ?? undefined;
  }

  /**
   * Returns the number of items currently stored in the buffer.
   */
  public size(): number {
    return this.count;
  }

  /**
   * Returns the maximum buffer capacity.
   */
  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Clears all entries from the buffer.
   */
  public clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }
}

