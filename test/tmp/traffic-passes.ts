// P9 near-miss gate forensics: log every pass and why it did/didn't credit.
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { TrafficManager, NEAR_MISS_LAT, NEAR_MISS_REL_SPEED } from '../../src/systems/traffic';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;

for (const def of [TRACKS.find((t) => t.id === 'volt-alley')!, TRACKS.find((t) => t.id === 'ring-runner')!, TRACKS.find((t) => t.id === 'harbor-nine')!]) {
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
  // snapshot pass windows: watch for passT transitions via per-car mirrors
  const mirrors = traffic.cars.map(() => ({ passT: 0, minLat: 99, rel: 0, hit: false }));
  const log: string[] = [];
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
    for (let i = 0; i < traffic.cars.length; i++) {
      const c = traffic.cars[i];
      const m = mirrors[i];
      if (c.passT > 0) {
        m.passT = c.passT;
        m.minLat = c.passMinLat;
        m.rel = c.passRelSpeed;
        m.hit = c.passHit;
      } else if (m.passT > 0 && c.passT <= 0) {
        // window closed
        const credited = !m.hit && m.minLat < NEAR_MISS_LAT && m.rel > NEAR_MISS_REL_SPEED;
        log.push(
          `${credited ? 'NM ' : 'no '} minLat=${m.minLat.toFixed(2)} rel=${m.rel.toFixed(1)} hit=${m.hit ? 1 : 0} | playerSpd=${car.state.speed.toFixed(0)} lat=${car.state.lateral.toFixed(2)} carLane=${c.lane.toFixed(2)} t=${(race.elapsedMs / 1000).toFixed(1)}`,
        );
        m.passT = 0;
        m.minLat = 99;
      }
      m.passT = c.passT;
    }
  }
  console.log(`\n=== ${def.id}: nm=${traffic.nearMisses} col=${traffic.collisions} passes=${log.length}`);
  for (const l of log) console.log('  ' + l);
}
