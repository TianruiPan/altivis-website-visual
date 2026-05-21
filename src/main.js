import './styles.css';
import { createPointFieldHero } from './pointFieldHero.js';

const container = document.querySelector('#pointfield');

const hero = createPointFieldHero(container, {
  background: '#111111',
  pointColor: '#ffffff',
  uncoveredPointColor: '#9a9a9a',
  pointSize: 24,
  maxPointSize: 30,
  threatPointSize: 6,
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
    liftStrength: 0.22
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
  keySites: {
    enabled: true,
    sites: [
      {
        x: 0.45,
        z: -3.55,
        size: 4.15
      }
    ]
  },
  unknownDrones: {
    enabled: true,
    color: '#FF2020',
    size: 0.28,
    altitude: 0.46,
    speed: 0.095,
    trailLength: 22,
    trailSpacing: 0.017,
    trailWidth: 0.18,
    trailOpacity: 0.46,
    drones: [
      {
        start: [1.0, 0.46, 2.0],
        end: [0.0, 0.46, -8.0],
        phase: 0.08
      }
    ]
  },
  camera: {
    fov: 36,
    position: [5.25, 7.2, 5.25],
    lookAt: [0.25, 0, -3.25]
  }
});

hero.start();

window.pointFieldHero = hero;
