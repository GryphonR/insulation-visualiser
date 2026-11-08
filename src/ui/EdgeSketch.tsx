import { useId } from 'react';
import { MAT } from '../engine/data';
import type { FloorEdge, House } from '../engine/house';

const FFL = 0.15; // floor finish above outside ground level, m
const FOOTING = 0.75; // typical strip foundation depth, m
const UPSTAND = 0.025; // insulated perimeter upstand thickness, m
const FO = -0.1; // outer face of the foundation, which stands 100 mm proud of the wall, m
const ink = '#14212b', muted = '#51606c', heat = '#c2410c', note = '#9a3412';

/** The house's outside wall and ground floor as drawn: layers, their extents, and the slab's place relative to the ground. */
function section(house: House) {
  const wall = house.buildups.find((b) => b.id === house.defaults.extWall);
  const floor = house.buildups.find((b) => b.id === house.defaults.groundFloor);
  const wallLayers = (wall?.layers ?? []).filter(([m]) => MAT[m]), floorLayers = (floor?.layers ?? []).filter(([m]) => MAT[m]);
  const wallT = Math.max(0.1, wallLayers.reduce((a, [, t]) => a + t / 1000, 0)), slabT = floorLayers.reduce((a, [, t]) => a + t / 1000, 0);
  const slabBot = FFL - slabT;
  // Floor layers bottom to top (as the build-up lists them) up to the finished floor; wall layers outside to inside.
  let yb = slabBot, xa = 0;
  const floorRects = floorLayers.map(([m, mm]) => ({ m, ya: yb, yb: (yb += mm / 1000) }));
  const wallRects = wallLayers.map(([m, mm]) => ({ m, xa, xb: (xa += mm / 1000) }));
  // An upstand stands on the structural slab (the bottom layer) and runs up to the finished floor.
  const upFrom = floorRects.length > 1 ? floorRects[0].yb : slabBot;
  return { wall, floor, wallT, slabT, slabBot, floorRects, wallRects, upFrom };
}

/** A to-scale drawing area: metres to pixels, with y up from ground level, and a rectangle helper. */
function frame(S: number, x0: number, x1: number, y0: number, y1: number) {
  const X = (x: number) => (x - x0) * S, Y = (y: number) => (y1 - y) * S;
  const box = (xa: number, ya: number, xb: number, yb: number) => ({ x: X(Math.min(xa, xb)), y: Y(Math.max(ya, yb)), width: Math.abs(xb - xa) * S, height: Math.abs(yb - ya) * S });
  return { W: (x1 - x0) * S, H: (y1 - y0) * S, X, Y, box };
}

const Soil = ({ id }: { id: string }) => (
  <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="8" height="8" fill="#e6dcc6" /><line x1="0" y1="0" x2="0" y2="8" stroke="#c9b993" strokeWidth="2" />
  </pattern>
);
/** SVG ids from useId, without the colons some browsers won't take inside url(#…). */
const useSvgId = () => useId().replace(/[^a-zA-Z0-9]/g, '');

/**
 * To-scale section through the foot of an outside wall: the ground-floor build-up meeting the wall and its foundation, the
 * ground, the foundation edge insulation (horizontal or vertical, outside or inside the foundation), and the floor-to-wall
 * junction: without an insulated upstand heat slips round the edge of the floor insulation into the wall (a thermal bridge,
 * counted as Ψ per metre of wall); the upstand breaks that path. Which side the edge insulation is on only moves it here:
 * BS EN ISO 13370 counts both the same.
 */
export function EdgeSketch({ house, fe, psi }: { house: House; fe: FloorEdge; psi: number }) {
  const soil = `soil${useSvgId()}`, arrow = `arr${useSvgId()}`;
  const { wall, floor, wallT, slabT, slabBot, floorRects, wallRects, upFrom } = section(house);
  const em = fe.mat ? MAT[fe.mat] : undefined, t = (fe.t ?? em?.t ?? 50) / 1000, D = fe.edge === 'none' ? 0 : Math.max(0, fe.D);
  const inside = fe.side === 'inside', FI = wallT - FO; // inner face of the foundation
  // The foundation as set (none for a wall standing on the ground); the drawing goes deep enough for it and the edge insulation.
  const foot = Math.max(0, fe.footD ?? FOOTING);
  const depth = Math.max(foot, slabT - FFL + 0.3, fe.edge === 'vertical' ? (inside ? D - slabBot : D) + 0.1 : 0, 0.4);
  // Visible extent, metres: x from the outside (negative) through the wall (0..wallT) into the room; y up from ground level.
  const out = fe.edge === 'horizontal' && !inside ? D : 0, inn = fe.edge === 'horizontal' && inside ? D : 0;
  const x0 = FO - Math.max(0.6, out + 0.25), x1 = wallT + Math.max(1.0, inn + 0.35), y1 = FFL + 0.45, y0 = -(depth + 0.25);
  const { W, H, X, Y, box } = frame(200, x0, x1, y0, y1);
  const insCol = em?.col ?? '#f2d16b';
  // Outside: flat just under the ground running out from the foundation, or down its outer face. Inside: flat under the slab
  // edge running in from the wall, or down the inner face of the foundation below the slab.
  const ins = fe.edge === 'horizontal' ? (inside ? box(wallT, slabBot, wallT + D, slabBot - t) : box(FO - D, -0.05, FO, -0.05 - t))
    : fe.edge === 'vertical' ? (inside ? box(FI, slabBot, FI + t, slabBot - D) : box(FO - t, 0, FO, -D)) : null;
  const label = em ? `${em.name}, ${Math.round(t * 1000)} mm` : 'Edge insulation';
  // The junction: the heat path round the edge of the floor insulation (its most insulating layer) and what it's counted as.
  // An upstand: the set 'insulated' detail (25 mm), or the material and thickness given for the calculated junction.
  const calc = fe.upstand === 'calc', um = calc && fe.upMat ? MAT[fe.upMat] : undefined;
  const up = fe.upstand === 'insulated' || (!!um && (fe.upT ?? 0) > 0), upW = um ? (fe.upT ?? 25) / 1000 : UPSTAND, upCol = um?.col ?? insCol;
  const best = floorRects.reduce<(typeof floorRects)[number] | undefined>((a, r) => (!a || (MAT[r.m].k ?? 1) < (MAT[a.m].k ?? 1) ? r : a), undefined);
  const yi = best ? (best.ya + best.yb) / 2 : (slabBot + FFL) / 2;
  const junction = fe.upstand === 'off' ? 'Junction left out of the heat loss'
    : `${up ? (um ? `${um.name} upstand, ${fe.upT} mm` : 'Insulated upstand') : fe.upstand === 'custom' ? 'Floor-to-wall junction' : 'No upstand'} · Ψ ${calc ? `${psi.toFixed(3)} W/mK, calculated` : `${psi} W/mK`}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="svg-fluid" role="img" style={{ maxWidth: W, border: `1px solid ${ink}`, background: '#fff' }}
      aria-label={`Section where the outside wall meets the ground floor and the ground${fe.edge === 'none' ? ', with no edge insulation' : `, with ${fe.edge} edge insulation ${D} m ${fe.edge === 'vertical' ? 'deep' : 'wide'} ${inside ? 'inside' : 'outside'} the foundation`}. ${up ? 'An insulated upstand between the floor and the wall breaks the heat path round the floor insulation' : 'Heat slips round the edge of the floor insulation into the wall'}; ${junction}.`}>
      <defs>
        <Soil id={soil} />
        <marker id={arrow} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke={heat} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {/* Outside air, the ground, the strip foundation under the wall */}
      <rect {...box(x0, 0, 0, y1)} fill="#eef4f8" />
      <rect {...box(x0, y0, x1, 0)} fill={`url(#${soil})`} />
      {foot > 0 && <rect {...box(FO, 0, FI, -Math.max(0, foot - 0.2))} fill="#c9c5bb" stroke={ink} strokeWidth={0.8} />}
      {foot > 0.2 && <rect {...box(FO - 0.15, -(foot - 0.2), FI + 0.15, -foot)} fill="#c9c5bb" stroke={ink} strokeWidth={0.8} />}
      {foot > 0 && foot <= 0.2 && <rect {...box(FO, 0, FI, -foot)} fill="#c9c5bb" stroke={ink} strokeWidth={0.8} />}
      {/* The wall's layers, outside to inside, from ground level up */}
      {wallRects.map((r, i) => <rect key={i} {...box(r.xa, 0, r.xb, y1)} fill={MAT[r.m].col} stroke={ink} strokeWidth={0.5} />)}
      {/* The room, and the ground-floor layers from the ground up to the finished floor */}
      <rect {...box(wallT, FFL, x1, y1)} fill="#fbf8f1" />
      {floorRects.map((r, i) => <rect key={i} {...box(wallT, r.ya, x1, r.yb)} fill={MAT[r.m].col} stroke={ink} strokeWidth={0.5} />)}
      {up && <rect {...box(wallT, upFrom, wallT + upW, FFL)} fill={upCol} stroke={heat} strokeWidth={1.2} />}
      <line x1={X(x0)} x2={X(0)} y1={Y(0)} y2={Y(0)} stroke={ink} strokeWidth={1.5} />
      {/* Foundation edge insulation, with its width or depth */}
      {ins && <rect {...ins} fill={insCol} stroke={heat} strokeWidth={1.5} />}
      {fe.edge === 'horizontal' && D > 0 && (() => {
        const xa = inside ? wallT : FO - D, xb = inside ? wallT + D : FO, y = (inside ? slabBot : -0.05) - t - 0.07;
        return <g>
          <line x1={X(xa)} x2={X(xb)} y1={Y(y)} y2={Y(y)} stroke={ink} />
          <line x1={X(xa)} x2={X(xa)} y1={Y(y + 0.04)} y2={Y(y - 0.04)} stroke={ink} /><line x1={X(xb)} x2={X(xb)} y1={Y(y + 0.04)} y2={Y(y - 0.04)} stroke={ink} />
          <text x={(X(xa) + X(xb)) / 2} y={Y(y) + 14} textAnchor="middle" fontSize={11} fill={ink}>{D} m {inside ? 'in' : 'out'}</text>
        </g>;
      })()}
      {fe.edge === 'vertical' && D > 0 && (() => {
        const x = inside ? FI + t + 0.08 : FO - t - 0.08, top = inside ? slabBot : 0;
        return <g>
          <line x1={X(x)} x2={X(x)} y1={Y(top)} y2={Y(top - D)} stroke={ink} />
          <line x1={X(x) - 6} x2={X(x) + 6} y1={Y(top - D)} y2={Y(top - D)} stroke={ink} />
          <text x={X(x) + (inside ? 6 : -6)} y={Y(top - D / 2)} textAnchor={inside ? 'start' : 'end'} fontSize={11} fill={ink}>{D} m down</text>
        </g>;
      })()}
      {/* The floor-to-wall junction: heat from the room round the floor insulation into the wall, unless an upstand stops it. */}
      {up
        ? <path d={`M${X(wallT + 0.3)} ${Y(FFL + 0.12)} L${X(wallT + 0.06)} ${Y(FFL - 0.02)}`} fill="none" stroke={heat} strokeWidth={2} markerEnd={`url(#${arrow})`} />
        : <path d={`M${X(wallT + 0.3)} ${Y(FFL + 0.12)} L${X(wallT + 0.05)} ${Y(FFL - 0.03)} L${X(wallT - 0.04)} ${Y(yi)} L${X(wallT - 0.06)} ${Y(Math.min(0, slabBot) - 0.12)}`}
            fill="none" stroke={heat} strokeWidth={2} strokeDasharray="5 3" markerEnd={`url(#${arrow})`} />}
      {/* Labels */}
      <text x={X(x0) + 6} y={Y(y1) + 14} fontSize={11} fill={muted}>Outside</text>
      <text x={X(x1) - 6} y={Y(y1) + 14} textAnchor="end" fontSize={11} fill={muted}>Room</text>
      <text x={X(x0) + 6} y={Y(0) - 5} fontSize={11} fill={muted}>Ground level</text>
      <text x={X(wallT) + 6} y={Y(y1) + 30} fontSize={11} fill={ink}>{wall?.name ?? 'Wall'}</text>
      <text x={X(x1) - 6} y={Y(FFL) - 5} textAnchor="end" fontSize={11} fill={ink}>{floor?.name ?? 'Ground floor'}</text>
      {fe.edge !== 'none' && <text x={X(x0) + 6} y={Y(y0) - 8} fontSize={11} fill={note}>{label}</text>}
      <text x={X(x1) - 6} y={Y(y0) - 8} textAnchor="end" fontSize={11} fill={note}>{junction}</text>
    </svg>
  );
}
