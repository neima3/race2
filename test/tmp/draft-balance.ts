// v9 P5 draft balance probe: cumulative slipstream seconds the autopilot collects
// in a 2-lap rival race (production wiring) on longer tracks. Not a permanent gate.
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { RivalManager, pickLineup } from '../../src/game/rivals';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { DraftTracker } from '../../src/game/draft';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const simDt = 1 / 120;
const ids = ['sunrise-sprint', 'dune-rush', 'harbor-nine', 'grand-gauntlet'];
for (const id of ids) {
  const def = TRACKS.find((t) => t.id === id);
  if (!def) {
    console.log(`${id}: not found`);
    continue;
  }
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 2, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, pickLineup(def.id));
  const slot = rivals.gridSlot(3);
  car.placeAt(slot.dist, slot.lateral);
  rivals.placeOnGrid();
  race.start();
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  const playerRef = { dist: 0, lateral: 0 };
  const tracker = new DraftTracker();
  let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let pendingRespawn = false;
  let recover = 0;
  let recoverDir = 1;
  let stuck = 0;
  let wall = 0;
  let pos = -1;
  while (race.phase !== 'finished' && wall < 160000) {
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    if (recover > 0) {
      recover -= 1;
      input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
      if (recover === 0) ap.smooth = 0;
    } else {
      const r = autopilotDrive(car, curve, simDt, ap);
      pendingRespawn = !!r.respawn;
      if (car.state.speed < 2.5 && Math.abs(car.state.lateral) > 3) stuck++;
      else stuck = 0;
      if (stuck > 40) {
        stuck = 0;
        recover = 55;
        recoverDir = -(Math.sign(car.state.lateral) || 1);
      }
      input = { steer: r.respawn ? 0 : r.steer, throttle: r.respawn ? 0 : r.throttle, brake: r.respawn ? 0 : r.brake, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
    }
    playerRef.dist = car.state.trackDist;
    playerRef.lateral = car.state.lateral;
    rivals.scanPlayerDraft(playerRef.dist, playerRef.lateral);
    tracker.update(simDt, rivals.draftScan.gap, rivals.draftScan.lat);
    race.draftFactor = tracker.factor();
    race.update(simDt * 1000, input);
    race.draftFactor = 1;
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress, null, 0, playerRef);
    wall += simDt * 1000;
  }
  pos = rivals.standings(race.totalProgress).findIndex((s) => s.isPlayer) + 1;
  console.log(`${id} (${(curve.length).toFixed(0)}m, 2 laps): draft ${tracker.draftTime.toFixed(2)}s | race ${(race.elapsedMs / 1000).toFixed(1)}s | P${pos} | finished=${race.phase === 'finished'}`);
}
