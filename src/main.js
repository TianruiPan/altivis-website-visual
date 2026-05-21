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
  camera: {
    fov: 42,
    position: [0, 6.2, 8.6],
    lookAt: [0, 0, -1.5]
  }
});

hero.start();

window.pointFieldHero = hero;
