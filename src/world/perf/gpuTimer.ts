// GPU frame time through EXT_disjoint_timer_query_webgl2 (ARCHITECTURE.md
// §13). The CPU cost of a frame says little about a GPU-bound world; the
// timer query says how long the GPU actually worked. Results arrive a few
// frames late and are polled, never awaited. Absent on drivers without the
// extension — the stats then say null rather than guessing.

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

const MAX_PENDING = 6;
const SAMPLES = 240;

export class GpuTimer {
  private active: WebGLQuery | null = null;
  private readonly pending: WebGLQuery[] = [];
  private readonly samplesMs: number[] = [];

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ext: TimerExt,
  ) {}

  static create(gl: WebGL2RenderingContext): GpuTimer | null {
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null;
    return ext ? new GpuTimer(gl, ext) : null;
  }

  /** Starts timing the GPU work issued until `end()`; skipped when the queue is full. */
  begin(): void {
    if (this.active || this.pending.length >= MAX_PENDING) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Collects finished queries, oldest first; stops at the first unfinished one. */
  poll(): void {
    while (this.pending.length > 0) {
      const query = this.pending[0]!;
      const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
      if (!available) return;
      const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) {
        const ns = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
        this.samplesMs.push(ns / 1e6);
        if (this.samplesMs.length > SAMPLES) this.samplesMs.shift();
      }
      this.gl.deleteQuery(query);
      this.pending.shift();
    }
  }

  /** Average GPU time of the last `frames` measured frames [ms], or null without samples. */
  averageMs(frames?: number): number | null {
    const window = frames ? this.samplesMs.slice(-frames) : this.samplesMs;
    if (window.length === 0) return null;
    return window.reduce((a, b) => a + b, 0) / window.length;
  }

  worstMs(frames?: number): number | null {
    const window = frames ? this.samplesMs.slice(-frames) : this.samplesMs;
    return window.length === 0 ? null : Math.max(...window);
  }

  reset(): void {
    this.samplesMs.length = 0;
  }

  get count(): number {
    return this.samplesMs.length;
  }
}
