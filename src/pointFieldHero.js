import * as THREE from 'three';

const DEFAULT_OPTIONS = {
  background: '#111111',
  pointColor: '#ffffff',
  field: {
    columns: 96,
    rows: 64,
    spacing: 0.24,
    depthFade: 0.7,
    edgeFade: 0.18
  },
  animation: {
    enabled: true,
    breathSpeed: 0.3,
    breathStrength: 0.12
  },
  camera: {
    fov: 42,
    position: [0, 6, 8],
    lookAt: [0, 0, -1]
  }
};

const vertexShader = `
  attribute float aAlpha;
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uBreathStrength;
  uniform float uBreathSpeed;

  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float breath = 1.0 + sin((uTime * uBreathSpeed) + (aSeed * 6.2831853)) * uBreathStrength;
    gl_PointSize = uPointSize * uPixelRatio * breath * (1.0 / max(0.28, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uPointColor;

  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    float disc = smoothstep(0.5, 0.16, dist);
    gl_FragColor = vec4(uPointColor, disc * vAlpha);
  }
`;

function mergeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    field: { ...DEFAULT_OPTIONS.field, ...options.field },
    animation: { ...DEFAULT_OPTIONS.animation, ...options.animation },
    camera: { ...DEFAULT_OPTIONS.camera, ...options.camera }
  };
}

function createPointFieldGeometry(fieldOptions) {
  const { columns, rows, spacing, depthFade, edgeFade } = fieldOptions;
  const positions = new Float32Array(columns * rows * 3);
  const alphas = new Float32Array(columns * rows);
  const seeds = new Float32Array(columns * rows);

  const width = (columns - 1) * spacing;
  const depth = (rows - 1) * spacing;

  let index = 0;
  let point = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * spacing - width * 0.5;
      const z = row * -spacing + depth * 0.42;

      positions[index] = x;
      positions[index + 1] = 0;
      positions[index + 2] = z;

      const xNorm = Math.abs(column / (columns - 1) - 0.5) * 2;
      const zNorm = row / (rows - 1);
      const edgeMask = 1 - Math.pow(Math.max(xNorm, 0), 2.8) * edgeFade;
      const depthMask = 1 - Math.pow(zNorm, 1.4) * depthFade;

      alphas[point] = Math.max(0.08, edgeMask * depthMask);
      seeds[point] = deterministicSeed(column, row);

      index += 3;
      point += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  return geometry;
}

function deterministicSeed(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export function createPointFieldHero(container, userOptions = {}) {
  if (!container) {
    throw new Error('createPointFieldHero requires a container element.');
  }

  const options = mergeOptions(userOptions);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background);
  scene.fog = new THREE.Fog(options.background, 8, 21);

  const camera = new THREE.PerspectiveCamera(options.camera.fov, 1, 0.1, 100);
  camera.position.fromArray(options.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(options.camera.lookAt));

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(options.background, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uPointSize: { value: 24 },
      uPointColor: { value: new THREE.Color(options.pointColor) },
      uBreathStrength: { value: options.animation.breathStrength },
      uBreathSpeed: { value: options.animation.breathSpeed }
    },
    vertexShader,
    fragmentShader
  });

  const geometry = createPointFieldGeometry(options.field);
  const points = new THREE.Points(geometry, material);
  points.rotation.x = -0.04;
  scene.add(points);

  const clock = new THREE.Clock();
  let frameId = 0;
  let running = false;

  const api = {
    scene,
    camera,
    renderer,
    points,
    start,
    stop,
    dispose,
    resize,
    setPointColor,
    setStyleState,
    setDensityState,
    setDeformationState
  };

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);
  resize();

  function start() {
    if (running) return;
    running = true;
    clock.start();
    renderLoop();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frameId);
  }

  function renderLoop() {
    if (!running) return;

    const elapsed = clock.getElapsedTime();
    material.uniforms.uTime.value = options.animation.enabled ? elapsed : 0;
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderLoop);
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }

  function setPointColor(color) {
    material.uniforms.uPointColor.value.set(color);
  }

  function setStyleState(nextStyle = {}) {
    if (nextStyle.pointColor) setPointColor(nextStyle.pointColor);
    if (typeof nextStyle.pointSize === 'number') {
      material.uniforms.uPointSize.value = nextStyle.pointSize;
    }
  }

  function setDensityState() {
    // Reserved for health-density maps and local point visibility changes.
  }

  function setDeformationState() {
    // Reserved for local dents, pulse waves, and sensing-skin deformation.
  }

  function dispose() {
    stop();
    resizeObserver.disconnect();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return api;
}
