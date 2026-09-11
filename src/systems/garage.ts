import * as THREE from 'three';
import { buildCarVisual, type CarBodyStyle, type CarVisual } from '../render/car-model';
import type { SaveManager } from '../core/save';

export class GarageSystem {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private car: CarVisual | null = null;
  private style: CarBodyStyle = 'standard';

  constructor(private save: SaveManager) {}

  applyTo(car: CarVisual, ghost: CarVisual | null): void {
    car.setPaint(this.save.profile.paint);
    ghost?.setPaint(this.save.profile.paint);
  }

  renderPreview(canvas: HTMLCanvasElement): void {
    if (!this.renderer || !this.scene || !this.camera) {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 50);
      this.camera.position.set(3.6, 2.2, 4.6);
      this.camera.lookAt(0, 0.4, 0);
      const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
      key.position.set(4, 6, 3);
      const rim = new THREE.DirectionalLight(0x8fb4ff, 1.4);
      rim.position.set(-5, 3, -4);
      this.scene.add(key, rim, new THREE.HemisphereLight(0xbdd4f0, 0x222222, 0.9));
      this.car = buildCarVisual(this.save.profile.paint, false, this.save.profile.body);
      this.scene.add(this.car.group);
      this.style = this.save.profile.body;
    }
    if (this.car && this.save.profile.body !== this.style) {
      this.scene.remove(this.car.group);
      this.car = buildCarVisual(this.save.profile.paint, false, this.save.profile.body);
      this.scene.add(this.car.group);
      this.style = this.save.profile.body;
    }
    if (this.car) {
      this.car.group.rotation.y = performance.now() * 0.0006;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
