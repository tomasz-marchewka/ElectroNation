// The animation clock (ARCHITECTURE.md §12). Every animation in the world reads
// `clock.time`, never performance.now() or Date: a pinned clock makes two runs
// with the same inputs produce the same frame, which is what the capture
// harness compares. The renderer advances it once per frame; a pinned clock
// simply refuses to advance.

export interface FrameClockState {
  /** Seconds since the world started, or the pinned value. */
  time: number;
  /** Seconds since the previous frame; 0 while pinned. */
  dt: number;
  pinned: boolean;
}

export class FrameClock implements FrameClockState {
  time = 0;
  dt = 0;
  pinned = false;
  /** Slows or speeds every animation; 0 freezes the world (motion setting BRAK). */
  scale = 1;
  private last: number | null = null;

  /** Pins the clock at `seconds`; `null` releases it. */
  pin(seconds: number | null): void {
    if (seconds === null) {
      this.pinned = false;
      this.last = null;
      return;
    }
    this.pinned = true;
    this.time = seconds;
    this.dt = 0;
  }

  /** Called by the frame loop with the browser's high-resolution timestamp [ms]. */
  tick(nowMs: number): void {
    if (this.pinned) {
      this.dt = 0;
      return;
    }
    if (this.last === null) {
      this.last = nowMs;
      this.dt = 0;
      return;
    }
    // A tab that was hidden for a minute must not fast-forward every animation.
    const raw = Math.min(0.1, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    this.dt = raw * this.scale;
    this.time += this.dt;
  }
}
