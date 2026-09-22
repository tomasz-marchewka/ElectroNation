// Frame timing (ARCHITECTURE.md §13): a ring of the last frames' durations,
// read by the quality controller, the capture log and the settings strip.

export class FpsMeter {
  private readonly samples: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 240) {
    this.capacity = capacity;
  }

  push(frameMs: number): void {
    this.samples.push(frameMs);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  /** Average fps over the last `frames` samples (all when omitted). */
  fps(frames?: number): number {
    const window = frames ? this.samples.slice(-frames) : this.samples;
    if (window.length === 0) return 0;
    const meanMs = window.reduce((a, b) => a + b, 0) / window.length;
    return meanMs > 0 ? 1000 / meanMs : 0;
  }

  /** Worst frame of the window [ms] — the stutter the average hides. */
  worstMs(frames?: number): number {
    const window = frames ? this.samples.slice(-frames) : this.samples;
    return window.length === 0 ? 0 : Math.max(...window);
  }

  get count(): number {
    return this.samples.length;
  }

  reset(): void {
    this.samples.length = 0;
  }
}
