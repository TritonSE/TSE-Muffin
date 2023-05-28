/**
 * @returns a Promise that resolves after at least the specified number of
 * milliseconds.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

/**
 * Provide consistent timing for events that start at a specific time and repeat
 * periodically.
 */
class IntervalTimer {
  public readonly intervalMs: number;
  public readonly startMs: number;

  /** Number of times {@link wait} has been called. */
  private waitCount: number;

  /**
   * @param intervalMs - Duration of each interval in milliseconds.
   * @param startMs - Start of the first interval, in milliseconds since the
   * epoch. Defaults to the current time.
   */
  constructor(intervalMs: number, startMs?: number) {
    this.intervalMs = intervalMs;
    this.startMs = startMs ?? Date.now();
    this.waitCount = 0;
  }

  /**
   * @returns A Promise that resolves after the end of the earliest interval
   * that has not been waited for yet.
   */
  async wait(): Promise<void> {
    this.waitCount += 1;
    const sleepUntilMs = this.startMs + this.waitCount * this.intervalMs;
    await sleep(sleepUntilMs - Date.now());
  }
}

export { IntervalTimer };
