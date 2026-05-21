import './styles.css';
import { createPointFieldHero } from './pointFieldHero.js';

const container = document.querySelector('#pointfield');

const hero = createPointFieldHero(container, {
  background: '#111111',
  pointColor: '#ffffff',
  uncoveredPointColor: '#9a9a9a',
  pointSize: 24,
  maxPointSize: 30,
  field: {
    columns: 154,
    rows: 96,
    spacing: 0.17,
    depthFade: 0.72,
    edgeFade: 0.2
  },
  animation: {
    enabled: true,
    breathSpeed: 0.32,
    breathStrength: 0.15,
    verticalBreathStrength: 0.055,
    verticalBreathSpeed: 0.62
  },
  optics: {
    enabled: true,
    deviceRadius: 0.095,
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
  radars: {
    enabled: true,
    deviceSize: 0.21,
    rippleSpeed: 0.52,
    devices: [
      {
        x: -3.1,
        z: -4.95,
        range: 3.75,
        rippleSpeed: 0.48
      },
      {
        x: 1.35,
        z: -1.65,
        range: 3.6,
        rippleSpeed: 0.62
      },
      {
        x: 3.55,
        z: -5.45,
        range: 3.9,
        rippleSpeed: 0.42
      }
    ]
  },
  camera: {
    fov: 42,
    position: [6.6, 6.2, 6.6],
    lookAt: [0, 0, -2.2]
  }
});

hero.start();

window.pointFieldHero = hero;
