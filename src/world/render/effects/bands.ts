// Band batches: one merged geometry per blending pass for every ground
// overlay the module draws (hover outline, selection, route ribbon, alarm and
// status rings, dashed curtailment rings, dump ticks). A band is a quad strip
// along a conformed spine with per-vertex colour, alpha, dash rate, scroll
// speed and pulse amount; the vertex shader grows it to a screen-space
// minimum width around `aCentre` (materials.ts), so one draw call per pass
// covers every mark at every zoom.
//
// Rebuilds are explicit: `begin()`, one `add()` per band, `commit()`. The
// module keeps the "turn state" batch and the "pointer overlay" batch apart,
// so moving the cursor rebuilds one small geometry and no more.

import * as THREE from "three";

export interface BandSpec {
  /** Conformed world-space spine (already lifted off the terrain). */
  spine: THREE.Vector3[];
  /** Half width of the band [km], before the screen-space floor. */
  halfWidthKm: number;
  color: readonly [number, number, number];
  alpha: number;
  /** Closed spine (rings, hex outlines). */
  closed?: boolean;
  /** Dash cycles per km; 0 (default) is a solid band. */
  dashPerKm?: number;
  /** Dash scroll [km/s]; sign is the flow direction seen by the player. */
  scrollKmPerS?: number;
  /** 0..1 share of the 0,5 Hz alarm breath this band takes. */
  pulse?: number;
  /** Phase offset of the breath and of the dash pattern [turns]. */
  phase?: number;
  /**
   * Ring centre (world ground point). Set on rings only: it lets the shader
   * cap the ring's on-screen *radius* (below), which a band's own width cannot
   * describe.
   */
  origin?: { x: number; z: number };
  /**
   * Screen-space ceiling for the distance between a vertex and `origin`, in
   * pixels at the camera's distance. The mirror of the width floor: an 11 km
   * hex ring that would swallow a detail frame is pulled in to a compact ring
   * around the same centre, so the line it marks stays the subject.
   */
  clampPx?: number;
}

export class BandBatch {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private positions: number[] = [];
  private colors: number[] = [];
  private centres: number[] = [];
  private params: number[] = [];
  private phases: number[] = [];
  private origins: number[] = [];
  private clamps: number[] = [];
  private uvs: number[] = [];
  private indices: number[] = [];
  private vertexCount = 0;

  constructor(material: THREE.Material, name: string) {
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  begin(): void {
    this.positions.length = 0;
    this.colors.length = 0;
    this.centres.length = 0;
    this.params.length = 0;
    this.phases.length = 0;
    this.origins.length = 0;
    this.clamps.length = 0;
    this.uvs.length = 0;
    this.indices.length = 0;
    this.vertexCount = 0;
  }

  add(spec: BandSpec): void {
    const spine = spec.spine;
    const n = spine.length;
    if (n < 2 || spec.alpha <= 0.001) return;
    const closed = spec.closed ?? false;
    const last = closed ? n : n - 1;
    const half = spec.halfWidthKm;

    // A perpendicular per spine point, averaged over its neighbours, so the
    // two quads meeting at a corner share the corner line exactly.
    const px = new Array<number>(n);
    const pz = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const prev = spine[i - 1] ?? (closed ? spine[n - 1] : undefined) ?? spine[i];
      const next = spine[i + 1] ?? (closed ? spine[0] : undefined) ?? spine[i];
      if (!prev || !next) continue;
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const length = Math.hypot(tx, tz) || 1;
      px[i] = -tz / length;
      pz[i] = tx / length;
    }

    let u = 0;
    // Continue the vertex buffer across bands: `base` must be the running
    // total, or every band's indices point back into the first band.
    let vertex = this.vertexCount;
    for (let i = 0; i < last; i++) {
      const a = i;
      const b = (i + 1) % n;
      const from = spine[a];
      const to = spine[b];
      if (!from || !to) continue;
      const segment = Math.hypot(to.x - from.x, to.z - from.z);
      const u0 = u;
      u += segment;
      const base = vertex;
      // a-left, a-right, b-left, b-right
      const corners: readonly [THREE.Vector3, number, number, number][] = [
        [from, px[a] ?? 0, pz[a] ?? 0, u0],
        [from, px[a] ?? 0, pz[a] ?? 0, u0],
        [to, px[b] ?? 0, pz[b] ?? 0, u],
        [to, px[b] ?? 0, pz[b] ?? 0, u],
      ];
      corners.forEach(([point, ox, oz, at], k) => {
        const side = k % 2 === 0 ? 1 : -1;
        this.push(
          point.x + ox * half * side,
          point.y,
          point.z + oz * half * side,
          point,
          at,
          side > 0 ? 0 : 1,
          spec,
        );
        vertex += 1;
      });
      this.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    this.vertexCount = vertex;
  }

  private push(
    x: number,
    y: number,
    z: number,
    centre: THREE.Vector3,
    u: number,
    across: number,
    spec: BandSpec,
  ): void {
    const [r, g, b] = spec.color;
    this.positions.push(x, y, z);
    this.centres.push(centre.x, centre.y, centre.z);
    this.colors.push(r, g, b);
    this.uvs.push(u, across);
    this.params.push(spec.alpha, spec.dashPerKm ?? 0, spec.scrollKmPerS ?? 0, spec.pulse ?? 0);
    this.phases.push(spec.phase ?? 0);
    this.origins.push(spec.origin?.x ?? centre.x, 0, spec.origin?.z ?? centre.z);
    this.clamps.push(spec.clampPx ?? 0);
  }

  /** Set the per-vertex params/phases of the band added last (see `add`). */
  commit(): void {
    const count = this.vertexCount;
    if (count === 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(this.positions), 3),
    );
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(this.colors), 3),
    );
    this.geometry.setAttribute(
      "aCentre",
      new THREE.BufferAttribute(new Float32Array(this.centres), 3),
    );
    this.geometry.setAttribute(
      "aParams",
      new THREE.BufferAttribute(new Float32Array(this.params), 4),
    );
    this.geometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(new Float32Array(this.phases), 1),
    );
    this.geometry.setAttribute(
      "aOrigin",
      new THREE.BufferAttribute(new Float32Array(this.origins), 3),
    );
    this.geometry.setAttribute(
      "aClamp",
      new THREE.BufferAttribute(new Float32Array(this.clamps), 1),
    );
    this.geometry.setAttribute("aUv", new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.indices), 1));
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
