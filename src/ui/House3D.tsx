import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { house3d } from '../engine/house-3d';
import type { Surf } from '../engine/house-3d';
import type { HouseResult } from '../engine/house';
import { Chip } from './controls';
import { fmt } from './hform';
import { useProject } from './project';

type Mode = 'outside' | 'heat';
const OUTSIDE: Partial<Record<Surf['kind'], string>> = { shell: '#dccdb6', roof: '#8a5444', flat: '#8d9196', window: '#8fc1e3', door: '#7a5230', dormer: '#d2c4ae' };
/** Heat flow through a surface, W/m²: pale at none, orange to deep red at `max`; blue where heat comes in. */
const fluxColour = (q: number, max: number) => {
  if (q < -0.5) return new THREE.Color('#8fb3e3');
  const f = Math.min(1, Math.max(0, q / max));
  return new THREE.Color().setHSL(0.11 - 0.11 * f, 0.55 + 0.35 * f, 0.9 - 0.45 * f);
};
/** Top of the colour scale: the biggest flow shown, rounded up to a round number, so an old house isn't all one red. */
const scaleTop = (q: number) => [20, 40, 60, 80, 100, 150, 200, 300].find((v) => v >= q * 0.95) ?? 400;

/** Heat flow per surface key (per room), from the design-day rows: W, m², and the build-up and U of the biggest row. */
function fluxes(res: HouseResult) {
  const m = new Map<string, { W: number; area: number; U: number; buildup: string; to: string }>();
  for (const r of res.rooms) {
    if (!r.room.heated) continue;
    for (const row of r.rows) {
      if (row.kind === 'vent' || row.area <= 0) continue;
      const base = row.key.split('~')[0];
      const keys = [base, row.kind === 'floor' ? `floor:${r.room.id}` : '', row.kind === 'ceiling' && !base.startsWith('sl:') && !base.startsWith('d') ? `ceil:${r.room.id}` : ''].filter(Boolean);
      for (const k of keys) {
        const id = `${r.room.id}|${k}`, x = m.get(id) ?? { W: 0, area: 0, U: row.U, buildup: row.buildup, to: row.to };
        if (row.area > x.area) { x.U = row.U; x.buildup = row.buildup; x.to = row.to; }
        x.W += row.W; x.area += row.area;
        m.set(id, x);
      }
    }
  }
  return m;
}

/** The house in 3D: from outside, or opened up with every room surface coloured by the heat it loses. */
export function House3D() {
  const { house, res } = useProject();
  const host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('outside');
  const [upTo, setUpTo] = useState(house.storeys.length - 1);
  const [roofOn, setRoofOn] = useState(true);
  const [ceilOn, setCeilOn] = useState(true);
  /** From outside: colour each room's outside walls, windows and doors by their heat loss. */
  const [outHeat, setOutHeat] = useState(false);
  const [picked, setPicked] = useState<Surf | null>(null);
  const surfs = useMemo(() => house3d(house), [house]);
  const flux = useMemo(() => fluxes(res), [res]);
  const last = house.storeys.length - 1, cut = Math.min(upTo, last);
  // Three.js objects live across renders; the scene is rebuilt when what is shown changes.
  const three = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; group: THREE.Group; framed: boolean } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f5');
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-30, 40, 25);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ color: '#dfe6dc' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    const group = new THREE.Group();
    scene.add(group);
    three.current = { renderer, scene, camera, controls, group, framed: false };
    const size = () => { const w = el.clientWidth || 800, h = el.clientHeight || 500; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); three.current = null; };
  }, []);

  // What is shown: from outside, the shell and roofs; opened up, the rooms' surfaces coloured by heat loss.
  const shown = useMemo(() => surfs.filter((s) => {
    if (s.storey > cut) return false;
    // The roof always shows from outside; opened up, it is a see-through layer that can be hidden.
    if (s.kind === 'roof' || s.kind === 'dormer') return (mode === 'outside' || roofOn) && (cut === last || s.storey < cut);
    if (mode === 'outside') return s.kind === 'shell' || s.kind === 'flat' || (outHeat && s.kind === 'outwall') || ((s.kind === 'window' || s.kind === 'door') && s.outer);
    return s.kind === 'floor' || s.kind === 'wall' || (s.kind === 'ceiling' && (ceilOn || s.storey < cut)) || ((s.kind === 'window' || s.kind === 'door') && !s.outer);
  }), [surfs, mode, cut, last, roofOn, ceilOn, outHeat]);
  const coloured = (s: Surf) => !!s.room && (mode === 'heat' || (outHeat && (s.kind === 'outwall' || !!s.outer)));
  const fluxOf = (s: Surf) => { const f = s.room && s.key ? flux.get(`${s.room}|${s.key}`) : undefined; return f && f.area > 0 ? f.W / f.area : null; };
  const top = scaleTop(Math.max(0, ...shown.filter(coloured).map((s) => fluxOf(s) ?? 0)));

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.group.traverse((m) => { const x = m as THREE.Mesh; if (x !== (t.group as unknown)) { x.geometry?.dispose(); (x.material as THREE.Material | undefined)?.dispose(); } });
    t.group.clear();
    for (const s of shown) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.tris, 3));
      g.computeVertexNormals();
      const q = fluxOf(s);
      const heatCol = coloured(s) ? (q != null ? fluxColour(q, top) : new THREE.Color('#d5d9dd')) : null;
      // Opened up, the ceilings and roofs are see-through so the rooms read from above.
      const ghost = mode === 'heat' && (s.kind === 'roof' || s.kind === 'dormer');
      const mat = new THREE.MeshLambertMaterial({ color: heatCol ?? new THREE.Color(OUTSIDE[s.kind] ?? '#c9c2b8'), side: THREE.DoubleSide, flatShading: true, transparent: ghost || (s.kind === 'window' && !heatCol), opacity: ghost ? 0.25 : s.kind === 'window' && !heatCol ? 0.85 : 1, polygonOffset: s.kind === 'window' || s.kind === 'door', polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.surf = s;
      // A dark frame round each window and door, so they stand out when coloured like the wall round them.
      if (s.kind === 'window' || s.kind === 'door') {
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: '#2b3540' }));
        line.raycast = () => {};
        mesh.add(line);
      }
      t.group.add(mesh);
    }
    if (!t.framed && shown.length) {
      // First view: from the south-west, a little above, the whole house in frame.
      const box = new THREE.Box3().setFromObject(t.group), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length();
      t.controls.target.copy(c);
      t.camera.position.set(c.x - r * 0.9, c.y + r * 0.7, c.z + r * 1.1);
      t.framed = true;
    }
  }, [shown, flux, mode, outHeat, top]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click a surface to see what it is (a drag to orbit is not a click).
  const down = useRef<[number, number] | null>(null);
  const pick = (e: React.PointerEvent) => {
    const t = three.current, d = down.current;
    if (!t || !d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) return;
    const box = t.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), t.camera);
    const hit = ray.intersectObjects(t.group.children).find((x) => !(mode === 'heat' && ((x.object as THREE.Mesh).userData.surf as Surf).kind === 'roof'));
    setPicked(hit ? (hit.object as THREE.Mesh).userData.surf as Surf : null);
  };
  const pf = picked?.room && picked.key ? flux.get(`${picked.room}|${picked.key}`) : undefined;
  const room = picked?.room ? house.rooms.find((r) => r.id === picked.room) : undefined;

  return (
    <div className="plan-stage view3d">
      <div ref={host} className="view3d-canvas" onPointerDown={(e) => { down.current = [e.clientX, e.clientY]; }} onPointerUp={pick} />
      <div className="float-top">
        <div className="chips" role="group" aria-label="View">
          <Chip on={mode === 'outside'} onClick={() => setMode('outside')}>Outside</Chip>
          <Chip on={mode === 'heat'} onClick={() => { setMode('heat'); setPicked(null); }}>Heat loss inside</Chip>
        </div>
        <label className="small">Storeys up to <select className="draw-grid-sel" style={{ width: 'auto' }} value={cut} aria-label="Show storeys up to" onChange={(e) => setUpTo(+e.target.value)}>
          {house.storeys.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
        </select></label>
        {mode === 'outside' && <label className="small"><input type="checkbox" checked={outHeat} onChange={(e) => setOutHeat(e.target.checked)} /> Show heat loss</label>}
        {mode === 'heat' && <>
          <label className="small"><input type="checkbox" checked={roofOn} onChange={(e) => setRoofOn(e.target.checked)} /> Roof</label>
          <label className="small"><input type="checkbox" checked={ceilOn} onChange={(e) => setCeilOn(e.target.checked)} /> Top ceilings</label>
        </>}
        <span className="small muted">Drag to turn, right-drag to move, scroll to zoom. Click a surface.</span>
      </div>
      {(mode === 'heat' || outHeat) && (
        <div className="view3d-legend small" aria-label="Colour key">
          <span>{mode === 'heat' ? 'Heat loss through each surface' : "Heat loss through each room's outside walls, windows and doors"}</span>
          <span className="view3d-bar" />
          <span className="row-between"><span>0</span><span>{top / 2}</span><span>{top}+ W/m²</span></span>
          <span className="muted">Blue: heat coming in from a warmer room. Grey: unheated rooms.</span>
        </div>
      )}
      {picked && (
        <div className="view3d-pick small">
          <b>{picked.label}</b>
          {room && <span>{room.name}{room.heated ? `, ${room.setpoint} °C` : ', unheated'}</span>}
          {pf && pf.area > 0 && <>
            <span>{pf.buildup} · U {fmt(pf.U, 2)} W/m²K · to {pf.to}</span>
            <span><b>{fmt(pf.W / pf.area, 1)} W/m²</b> · {fmt(pf.area, 1)} m² · {fmt(pf.W)} W</span>
          </>}
          <button type="button" className="btn-link" onClick={() => setPicked(null)}>Close</button>
        </div>
      )}
    </div>
  );
}

export default House3D;
