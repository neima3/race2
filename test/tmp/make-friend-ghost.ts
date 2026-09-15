import * as THREE from 'three';
import { TrackCurve, type TrackFrame } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { encodeGhostCode } from '../../src/game/share';
import type { GhostSample } from '../../src/game/race';

const def = TRACKS[0]; // sunrise-sprint
const curve = new TrackCurve(def.points, true);
const lapMs = 21000;

function synth(lapMs: number, count = 160): GhostSample[] {
  const f: TrackFrame = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const x = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const samples: GhostSample[] = [];
  for (let i = 0; i < count; i++) {
    const d = (i / count) * curve.length;
    curve.frameAtDist(d, f);
    pos.copy(f.pos).addScaledVector(f.normal, -0.8);
    x.crossVectors(f.normal, f.tangent);
    m.makeBasis(x, f.normal, f.tangent);
    q.setFromRotationMatrix(m);
    samples.push({ t: (i / count) * lapMs, pos: pos.clone(), quat: q.clone() });
  }
  return samples;
}

encodeGhostCode(def, synth(lapMs)).then((code) => {
  console.log(JSON.stringify({ trackId: def.id, timeMs: lapMs, code }));
});
