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
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;
const def = TRACKS[4];
const lineup = pickLineup(def.id);
const curve = new TrackCurve(def.points, true);
const car = new CarPhysics(curve);
const save = new SaveManager();
const race = new RaceController(car, curve, def, save, () => {}, { laps: 2, writesRecords: false });
const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
const playerSlot = rivals.gridSlot(3);
car.placeAt(playerSlot.dist, playerSlot.lateral);
rivals.placeOnGrid();
race.start();
race.countdownMs = 1;
const ap = { smooth: 0 };
const draft = new DraftTracker();
const playerRef = { dist: 0, lateral: 0 };
let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
let pendingRespawn = false, recover = 0, recoverDir = 1, stuck = 0, wall = 0;
let maxGap = 0, maxAt = 0, maxWho = '', maxDraft = 0, playerLeading = false;
while (race.phase !== 'finished' && wall < 90000) {
  if (pendingRespawn) { race.respawnAtCheckpoint(); pendingRespawn = false; }
  if (recover > 0) {
    recover -= 1;
    input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
    if (recover === 0) ap.smooth = 0;
  } else {
    const r = autopilotDrive(car, curve, simDt, ap);
    pendingRespawn = !!r.respawn;
    if (car.state.speed < 2.5 && Math.abs(car.state.lateral) > 3) stuck++; else stuck = 0;
    if (stuck > 40) { stuck = 0; recover = 55; recoverDir = -(Math.sign(car.state.lateral) || 1); }
    input = { steer: r.respawn ? 0 : r.steer, throttle: r.respawn ? 0 : r.throttle, brake: r.respawn ? 0 : r.brake, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  }
  rivals.scanPlayerDraft(car.state.trackDist, car.state.lateral);
  draft.update(simDt, rivals.draftScan.gap, rivals.draftScan.lat);
  race.draftFactor = process.argv.includes("--nodraft") ? 1 : draft.factor();
  playerRef.dist = car.state.trackDist;
  playerRef.lateral = car.state.lateral;
  race.update(simDt * 1000, input);
  rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress, null, 0, playerRef);
  wall += simDt * 1000;
  if (race.phase === 'racing') {
    const pp = race.totalProgress;
    for (const rv of rivals.standings(pp)) {
      if (rv.isPlayer) continue;
      const g = Math.abs(pp - rv.progress);
      if (g > maxGap) {
        maxGap = g;
        maxAt = wall;
        maxWho = rv.name + (rv.finished ? '(fin)' : '');
        maxDraft = draft.charge;
        playerLeading = pp > rv.progress;
      }
    }
  }
}
console.log(`maxGap=${maxGap.toFixed(1)}m at ${(maxAt / 1000).toFixed(1)}s vs ${maxWho} playerLeading=${playerLeading} draftCharge=${maxDraft.toFixed(2)} playerPos=race.phase=${race.phase}`);
