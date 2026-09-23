/** Injectable clock so services are deterministic in tests. */
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

export function nowIso(clock: Clock = systemClock): string {
  return clock.now().toISOString();
}
