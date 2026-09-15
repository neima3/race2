// P9 collision forensics: where do the contacts happen on the collision-heavy tracks?
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { TrafficManager, TRAFFIC_HIT_DIST, TRAFFIC_HIT_LAT } from '../../src/systems/traffic';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;

for (const def of [TRACKS.find((t) => t.id === 'gauntlet-ii')!]) {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  const traffic = new TrafficManager(curve, def, new THREE.Group());
  car.placeAtFrame(0, 8);
  traffic.place(car.state.trackDist);
  traffic.setVisible(true);
  race.start();
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let lastColl = 0;
  const widths = new Set<number>();
  for (const f of curve.frames) widths.add(+f.halfWidth.toFixed(1));
  while (race.phase !== 'finished') {
    if (race.phase === 'racing') {
      const r = autopilotDrive(car, curve, simDt, ap);
      if (r.respawn) race.respawnAtCheckpoint();
      input.steer = r.respawn ? 0 : r.steer;
      input.throttle = r.respawn ? 0 : r.throttle;
      input.brake = r.respawn ? 0 : r.brake;
    }
    race.update(simDt * 1000, input);
    traffic.update(simDt * 1000, car, race.phase === 'racing');
    if (traffic.collisions > lastColl) {
      lastColl = traffic.collisions;
      // find the involved car (nearest in dist)
      let best = traffic.cars[0];
      let bd = 1e9;
      for (const c of traffic.cars) {
        let d = Math.abs(((c.dist - car.state.trackDist + curve.length * 1.5) % curve.length) - curve.length / 2);
        if (d < bd) { bd = d; best = c; }
      }
      console.log(
        `${def.id} #${lastColl} t=${(race.elapsedMs / 1000).toFixed(1)}s playerDist=${Math.round(car.state.trackDist)} lat=${car.state.lateral.toFixed(2)} spd=${car.state.speed.toFixed(1)} | car lane=${best.lane.toFixed(2)} lat=${best.lat.toFixed(2)} spd=${best.speed.toFixed(1)}`,
      );
    }
  }
  console.log(`${def.id}: len=${Math.round(curve.length)} halfWidths=${[...widths].join('/')} total col=${traffic.collisions} nm=${traffic.nearMisses}\n`);
}
void TRAFFIC_HIT_DIST; void TRAFFIC_HIT_LAT;
