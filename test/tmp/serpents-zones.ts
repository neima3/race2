import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import * as THREE from 'three';

const def = TRACKS.find((t) => t.id === 'serpents-tail')!;
const curve = new TrackCurve(def.points, true);
console.log('len', curve.length.toFixed(1), 'halfWidth', def.width / 2);
for (let d = 0; d < curve.length - 20; d += 10) {
  const a = curve.frameAtDist(d, { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 } as never) as unknown as void;
  void a;
}
// tangent turn over the next 30m at each 10m step
const f = () => ({ pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 });
const fa = f(), fb = f();
for (let d = 0; d < curve.length - 5; d += 10) {
  curve.frameAtDist(d, fa);
  curve.frameAtDist(d + 30, fb);
  const cross = fa.tangent.x * fb.tangent.z - fa.tangent.z * fb.tangent.x;
  const turn = cross > 0.08 ? 'L' : cross < -0.08 ? 'R' : '.';
  console.log(`d=${String(Math.round(d)).padStart(4)} turn=${turn} cross=${cross.toFixed(2)}`);
}
