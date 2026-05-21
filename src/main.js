import './styles.css';
import { createPointFieldHero } from './pointFieldHero.js';

const container = document.querySelector('#pointfield');

const hero = createPointFieldHero(container, {
  background: '#111111',
  pointColor: '#ffffff',
  field: {
    columns: 118,
    rows: 74,
    spacing: 0.22,
    depthFade: 0.72,
    edgeFade: 0.2
  },
  animation: {
    enabled: true,
    breathSpeed: 0.32,
    breathStrength: 0.15
  },
  optics: {
    enabled: true,
    deviceRadius: 0.16,
    sectorOpacity: 0.055,
    rangeOpacity: 0.24,
    devices: [
      {
        x: -2.35,
        z: -2.75,
        range: 2.75,
        fovDegrees: 56,
        initialAngleDegrees: -18,
        rotationSpeedDegrees: 3.2
      },
      {
        x: 0.15,
        z: -4.05,
        range: 3.2,
        fovDegrees: 48,
        initialAngleDegrees: 78,
        rotationSpeedDegrees: -2.1
      },
      {
        x: 2.55,
        z: -2.65,
        range: 2.65,
        fovDegrees: 62,
        initialAngleDegrees: 156,
        rotationSpeedDegrees: 2.65
      }
    ]
  },
  camera: {
    fov: 42,
    position: [0, 6.2, 8.6],
    lookAt: [0, 0, -1.5]
  }
});

hero.start();

window.pointFieldHero = hero;
