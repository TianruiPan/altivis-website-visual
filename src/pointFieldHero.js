import * as THREE from 'three';

const DEFAULT_OPTIONS = {
  background: '#111111',
  pointColor: '#ffffff',
  uncoveredPointColor: '#9a9a9a',
  pointSize: 20,
  maxPointSize: 34,
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
    breathStrength: 0.12,
    liftStrength: 0.46
  },
  optics: {
    enabled: true,
    deviceColor: '#ffffff',
    deviceFillColor: '#050505',
    rangeColor: '#ffffff',
    rangeOpacity: 0.22,
    deviceRadius: 0.09,
    devices: []
  },
  radars: {
    enabled: true,
    deviceColor: '#ffffff',
    deviceFillColor: '#050505',
    deviceSize: 0.18,
    rippleSpeed: 0.18,
    devices: []
  },
  camera: {
    fov: 42,
    position: [0, 6, 8],
    lookAt: [0, 0, -1]
  }
};

const MAX_OPTIC_DEVICES = 8;
const MAX_RADAR_DEVICES = 8;

const vertexShader = `
  #define MAX_OPTIC_DEVICES ${MAX_OPTIC_DEVICES}
  #define MAX_RADAR_DEVICES ${MAX_RADAR_DEVICES}

  attribute float aAlpha;
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uMaxPointSize;
  uniform float uBreathStrength;
  uniform float uBreathSpeed;
  uniform float uLiftStrength;
  uniform int uOpticCount;
  uniform vec3 uOpticRanges[MAX_OPTIC_DEVICES];
  uniform vec4 uOpticScans[MAX_OPTIC_DEVICES];
  uniform int uRadarCount;
  uniform vec4 uRadarRanges[MAX_RADAR_DEVICES];

  varying float vAlpha;
  varying float vCoverage;

  float signedAngleDistance(float a, float b) {
    return atan(sin(a - b), cos(a - b));
  }

  void main() {
    float coverage = 0.0;
    float scanInfluence = 0.0;
    float radarLift = 0.0;

    for (int i = 0; i < MAX_OPTIC_DEVICES; i++) {
      if (i < uOpticCount) {
        vec3 opticRange = uOpticRanges[i];
        vec4 opticScan = uOpticScans[i];
        vec2 toPoint = position.xz - opticRange.xy;
        float distanceToOptic = length(toPoint);
        float rangeMask = step(distanceToOptic, opticRange.z);
        float nearMask = 1.0 - smoothstep(opticRange.z * 0.58, opticRange.z, distanceToOptic);
        float pointAngle = atan(toPoint.y, toPoint.x);
        float angleDelta = abs(signedAngleDistance(pointAngle, opticScan.x));
        float fovHalf = opticScan.y * 0.5;
        float fovMask = step(angleDelta, fovHalf);
        coverage = max(coverage, rangeMask);
        scanInfluence = max(scanInfluence, nearMask * fovMask);
      }
    }

    for (int i = 0; i < MAX_RADAR_DEVICES; i++) {
      if (i < uRadarCount) {
        vec4 radarRange = uRadarRanges[i];
        vec2 toPoint = position.xz - radarRange.xy;
        float distanceToRadar = length(toPoint);
        float rangeMask = step(distanceToRadar, radarRange.z);
        float normalizedDistance = distanceToRadar / max(0.001, radarRange.z);
        float centerFade = smoothstep(0.05, 0.2, normalizedDistance);
        float edgeFade = 1.0 - smoothstep(0.54, 1.0, normalizedDistance);
        float wave = sin((normalizedDistance * 4.75 - uTime * radarRange.w) * 6.2831853);
        radarLift += wave * rangeMask * centerFade * edgeFade;
        coverage = max(coverage, rangeMask);
      }
    }

    vCoverage = coverage;
    vAlpha = aAlpha;

    vec3 animatedPosition = position;
    animatedPosition.y += clamp(radarLift, -1.0, 1.0) * uLiftStrength;

    vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    float breath = 1.0 + sin((uTime * uBreathSpeed) + (aSeed * 6.2831853)) * uBreathStrength;
    float coverageScale = mix(1.18, 1.0, coverage);
    float opticalScanScale = 1.0 + scanInfluence * 0.42;
    float computedPointSize = uPointSize * uPixelRatio * breath * coverageScale * opticalScanScale * (1.0 / max(0.28, -mvPosition.z));
    gl_PointSize = min(computedPointSize, uMaxPointSize * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uPointColor;
  uniform vec3 uUncoveredPointColor;

  varying float vAlpha;
  varying float vCoverage;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    float disc = step(dist, 0.42);

    float diagonalA = abs(centered.x - centered.y);
    float diagonalB = abs(centered.x + centered.y);
    float stroke = step(min(diagonalA, diagonalB), 0.075);
    float extent = step(max(abs(centered.x), abs(centered.y)), 0.47);
    float xShape = stroke * extent;

    float covered = step(0.5, vCoverage);
    vec3 color = mix(uUncoveredPointColor, uPointColor, covered);
    float shapeAlpha = mix(xShape * 0.95, disc, covered);
    gl_FragColor = vec4(color, shapeAlpha * vAlpha);
  }
`;

function mergeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    field: { ...DEFAULT_OPTIONS.field, ...options.field },
    animation: { ...DEFAULT_OPTIONS.animation, ...options.animation },
    optics: { ...DEFAULT_OPTIONS.optics, ...options.optics },
    radars: { ...DEFAULT_OPTIONS.radars, ...options.radars },
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

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function normalizeDevice(device) {
  return {
    x: device.x ?? 0,
    z: device.z ?? 0,
    range: device.range ?? 2.2,
    fov: degreesToRadians(device.fovDegrees ?? 52),
    angle: degreesToRadians(device.initialAngleDegrees ?? 0),
    rotationSpeed: degreesToRadians(device.rotationSpeedDegrees ?? 3)
  };
}

function normalizeRadarDevice(device, fallbackSpeed) {
  return {
    x: device.x ?? 0,
    z: device.z ?? 0,
    range: device.range ?? 3.4,
    rippleSpeed: device.rippleSpeed ?? fallbackSpeed
  };
}

function createCircleDevice(device, opticsOptions) {
  const texture = createCircleDeviceTexture(
    opticsOptions.deviceColor,
    opticsOptions.deviceFillColor
  );
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: opticsOptions.deviceColor,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  const diameter = opticsOptions.deviceRadius * 2;
  sprite.scale.set(diameter, diameter, 1);
  sprite.position.set(device.x, 0.055, device.z);
  return sprite;
}

function createRadarDevice(device, radarOptions) {
  const texture = createSquareDeviceTexture(radarOptions.deviceColor, radarOptions.deviceFillColor);
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: radarOptions.deviceColor,
    transparent: true,
    opacity: 0.96,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(radarOptions.deviceSize, radarOptions.deviceSize, 1);
  sprite.position.set(device.x, 0.065, device.z);
  return sprite;
}

function createCircleDeviceTexture(strokeColor, fillColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = fillColor;
  context.strokeStyle = strokeColor;
  context.lineWidth = 10;
  context.beginPath();
  context.arc(48, 48, 34, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSquareDeviceTexture(strokeColor, fillColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = fillColor;
  context.strokeStyle = strokeColor;
  context.lineWidth = 10;
  context.beginPath();
  context.rect(24, 24, 48, 48);
  context.fill();
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createUnionRangeOutline(devices, opticsOptions) {
  const geometry = createUnionOutlineGeometry(devices);
  const material = new THREE.LineBasicMaterial({
    color: opticsOptions.rangeColor,
    transparent: true,
    opacity: opticsOptions.rangeOpacity,
    depthWrite: false
  });
  return new THREE.LineSegments(geometry, material);
}

function createUnionOutlineGeometry(devices) {
  const positions = [];
  const samplesPerCircle = 192;

  devices.forEach((device, deviceIndex) => {
    for (let sample = 0; sample < samplesPerCircle; sample += 1) {
      const thetaA = (Math.PI * 2 * sample) / samplesPerCircle;
      const thetaB = (Math.PI * 2 * (sample + 1)) / samplesPerCircle;
      const thetaMid = (thetaA + thetaB) * 0.5;
      const mid = {
        x: device.x + Math.cos(thetaMid) * device.range,
        z: device.z + Math.sin(thetaMid) * device.range
      };

      const hiddenByAnotherCircle = devices.some((other, otherIndex) => {
        if (otherIndex === deviceIndex) return false;
        return Math.hypot(mid.x - other.x, mid.z - other.z) < other.range - 0.01;
      });

      if (!hiddenByAnotherCircle) {
        positions.push(
          device.x + Math.cos(thetaA) * device.range,
          0.018,
          device.z + Math.sin(thetaA) * device.range,
          device.x + Math.cos(thetaB) * device.range,
          0.018,
          device.z + Math.sin(thetaB) * device.range
        );
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
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
      uPointSize: { value: options.pointSize },
      uMaxPointSize: { value: options.maxPointSize },
      uPointColor: { value: new THREE.Color(options.pointColor) },
      uUncoveredPointColor: { value: new THREE.Color(options.uncoveredPointColor) },
      uBreathStrength: { value: options.animation.breathStrength },
      uBreathSpeed: { value: options.animation.breathSpeed },
      uLiftStrength: { value: options.animation.liftStrength },
      uOpticCount: { value: 0 },
      uOpticRanges: {
        value: Array.from({ length: MAX_OPTIC_DEVICES }, () => new THREE.Vector3())
      },
      uOpticScans: {
        value: Array.from({ length: MAX_OPTIC_DEVICES }, () => new THREE.Vector4())
      },
      uRadarCount: { value: 0 },
      uRadarRanges: {
        value: Array.from({ length: MAX_RADAR_DEVICES }, () => new THREE.Vector4())
      }
    },
    vertexShader,
    fragmentShader
  });

  const geometry = createPointFieldGeometry(options.field);
  const points = new THREE.Points(geometry, material);
  points.rotation.x = -0.04;
  scene.add(points);

  const opticDevices = options.optics.enabled
    ? options.optics.devices.slice(0, MAX_OPTIC_DEVICES).map(normalizeDevice)
    : [];
  const radarDevices = options.radars.enabled
    ? options.radars.devices
        .slice(0, MAX_RADAR_DEVICES)
        .map((device) => normalizeRadarDevice(device, options.radars.rippleSpeed))
    : [];
  const coverageDevices = [...opticDevices, ...radarDevices];
  const opticGroup = new THREE.Group();
  const deviceMeshes = [];

  if (coverageDevices.length > 0) {
    opticDevices.forEach((device) => {
      const deviceMesh = createCircleDevice(device, options.optics);
      deviceMeshes.push(deviceMesh);
      opticGroup.add(deviceMesh);
    });
    radarDevices.forEach((device) => {
      const deviceMesh = createRadarDevice(device, options.radars);
      deviceMeshes.push(deviceMesh);
      opticGroup.add(deviceMesh);
    });

    scene.add(opticGroup);
  }

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
    setDeformationState,
    setOpticDevices,
    setRadarDevices
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
    updateOptics(elapsed);
    updateRadars();
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
    if (nextStyle.uncoveredPointColor) {
      material.uniforms.uUncoveredPointColor.value.set(nextStyle.uncoveredPointColor);
    }
    if (typeof nextStyle.pointSize === 'number') {
      material.uniforms.uPointSize.value = nextStyle.pointSize;
    }
    if (typeof nextStyle.maxPointSize === 'number') {
      material.uniforms.uMaxPointSize.value = nextStyle.maxPointSize;
    }
  }

  function setDensityState() {
    // Reserved for health-density maps and local point visibility changes.
  }

  function setDeformationState() {
    // Reserved for local dents, pulse waves, and sensing-skin deformation.
  }

  function setOpticDevices() {
    // Reserved for runtime device updates when this prototype becomes data-driven.
  }

  function setRadarDevices() {
    // Reserved for runtime radar updates when this prototype becomes data-driven.
  }

  function updateOptics(elapsed) {
    const opticCount = opticDevices.length;
    material.uniforms.uOpticCount.value = opticCount;

    for (let i = 0; i < MAX_OPTIC_DEVICES; i += 1) {
      const rangeUniform = material.uniforms.uOpticRanges.value[i];
      const scanUniform = material.uniforms.uOpticScans.value[i];
      const device = opticDevices[i];

      if (!device) {
        rangeUniform.set(0, 0, 0);
        scanUniform.set(0, 0, 0, 0);
        continue;
      }

      const angle = device.angle + elapsed * device.rotationSpeed;
      rangeUniform.set(device.x, device.z, device.range);
      scanUniform.set(angle, device.fov, 1, 0);
    }
  }

  function updateRadars() {
    const radarCount = radarDevices.length;
    material.uniforms.uRadarCount.value = radarCount;

    for (let i = 0; i < MAX_RADAR_DEVICES; i += 1) {
      const rangeUniform = material.uniforms.uRadarRanges.value[i];
      const device = radarDevices[i];

      if (!device) {
        rangeUniform.set(0, 0, 0, 0);
        continue;
      }

      rangeUniform.set(device.x, device.z, device.range, device.rippleSpeed);
    }
  }

  function dispose() {
    stop();
    resizeObserver.disconnect();
    geometry.dispose();
    material.dispose();
    deviceMeshes.forEach((mesh) => {
      mesh.geometry?.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return api;
}
