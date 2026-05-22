import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_OPTIONS = {
  background: '#111111',
  pointColor: '#ffffff',
  uncoveredPointColor: '#9a9a9a',
  pointSize: 20,
  maxPointSize: 34,
  threatPointSize: 18,
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
  keySites: {
    enabled: true,
    color: '#ffffff',
    opacity: 0.9,
    sites: []
  },
  unknownDrones: {
    enabled: true,
    color: '#FF2020',
    size: 0.32,
    altitude: 0.7,
    speed: 0.085,
    trailLength: 18,
    trailSpacing: 0.018,
    trailWidth: 0.28,
    trailOpacity: 0.48,
    drones: []
  },
  camera: {
    fov: 42,
    position: [0, 6, 8],
    lookAt: [0, 0, -1],
    controls: {
      enabled: true,
      minDistance: 3.2,
      maxDistance: 16,
      minPolarAngle: 0.28,
      maxPolarAngle: 1.36
    }
  }
};

const MAX_OPTIC_DEVICES = 8;
const MAX_RADAR_DEVICES = 8;
const MAX_INTRUDERS = 4;

const vertexShader = `
  #define MAX_OPTIC_DEVICES ${MAX_OPTIC_DEVICES}
  #define MAX_RADAR_DEVICES ${MAX_RADAR_DEVICES}
  #define MAX_INTRUDERS ${MAX_INTRUDERS}

  attribute float aAlpha;
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uMaxPointSize;
  uniform float uThreatPointSize;
  uniform float uBreathStrength;
  uniform float uBreathSpeed;
  uniform float uLiftStrength;
  uniform float uAlertPulse;
  uniform int uOpticCount;
  uniform vec3 uOpticRanges[MAX_OPTIC_DEVICES];
  uniform vec4 uOpticScans[MAX_OPTIC_DEVICES];
  uniform int uRadarCount;
  uniform vec4 uRadarRanges[MAX_RADAR_DEVICES];
  uniform int uIntruderCount;
  uniform vec4 uIntruderLifts[MAX_INTRUDERS];

  varying float vAlpha;
  varying float vCoverage;
  varying float vIntruder;
  varying float vThreat;

  float signedAngleDistance(float a, float b) {
    return atan(sin(a - b), cos(a - b));
  }

  void main() {
    float coverage = 0.0;
    float scanInfluence = 0.0;
    float radarLift = 0.0;
    float intruderShape = 0.0;
    float opticThreatShape = 0.0;

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
        opticThreatShape = max(opticThreatShape, rangeMask * fovMask * step(0.5, opticScan.z));
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
        float ringCenter = fract(uTime * radarRange.w);
        float distanceToRing = abs(normalizedDistance - ringCenter);
        float wrappedDistanceToRing = min(distanceToRing, 1.0 - distanceToRing);
        float primaryRing = 1.0 - smoothstep(0.012, 0.055, wrappedDistanceToRing);
        float trailingCenter = fract(ringCenter - 0.22);
        float trailingDistance = abs(normalizedDistance - trailingCenter);
        float trailingRing = 1.0 - smoothstep(0.012, 0.045, min(trailingDistance, 1.0 - trailingDistance));
        float ringLift = max(primaryRing, trailingRing * 0.42);
        radarLift = max(radarLift, ringLift * rangeMask * centerFade * edgeFade);
        coverage = max(coverage, rangeMask);
      }
    }

    for (int i = 0; i < MAX_INTRUDERS; i++) {
      if (i < uIntruderCount) {
        vec4 intruder = uIntruderLifts[i];
        float distanceToIntruder = length(position.xz - intruder.xy);
        float circleShape = 1.0 - smoothstep(intruder.z * 0.82, intruder.z, distanceToIntruder);
        intruderShape = max(intruderShape, circleShape);
      }
    }

    vCoverage = coverage;
    vIntruder = intruderShape;
    vThreat = max(intruderShape, opticThreatShape);
    vAlpha = aAlpha;

    vec3 animatedPosition = position;
    float threat = step(0.5, vThreat);
    animatedPosition.y += radarLift * (1.0 - threat) * uLiftStrength;
    animatedPosition.y += sin(uTime * 58.0 + aSeed * 42.0) * uAlertPulse * 0.085;

    vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    float breath = 1.0 + sin((uTime * uBreathSpeed) + (aSeed * 6.2831853)) * uBreathStrength;
    float coverageScale = mix(1.18, 1.0, coverage);
    float opticalScanScale = 1.0 + scanInfluence * 1.15;
    float computedPointSize = uPointSize * uPixelRatio * breath * coverageScale * opticalScanScale * (1.0 / max(0.28, -mvPosition.z));
    gl_PointSize = mix(min(computedPointSize, uMaxPointSize * uPixelRatio), uThreatPointSize * uPixelRatio, threat);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uPointColor;
  uniform vec3 uUncoveredPointColor;

  varying float vAlpha;
  varying float vCoverage;
  varying float vIntruder;
  varying float vThreat;

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
    float intruder = step(0.5, vThreat);
    vec3 baseColor = mix(uUncoveredPointColor, uPointColor, covered);
    vec3 color = mix(baseColor, vec3(1.0, 0.12549, 0.12549), intruder);
    float baseAlpha = mix(xShape * 0.95, disc, covered);
    float shapeAlpha = mix(baseAlpha, disc, intruder);
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
    keySites: { ...DEFAULT_OPTIONS.keySites, ...options.keySites },
    unknownDrones: { ...DEFAULT_OPTIONS.unknownDrones, ...options.unknownDrones },
    camera: {
      ...DEFAULT_OPTIONS.camera,
      ...options.camera,
      controls: {
        ...DEFAULT_OPTIONS.camera.controls,
        ...options.camera?.controls
      }
    }
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
    lockFov: degreesToRadians(device.lockFovDegrees ?? 18),
    angle: degreesToRadians(device.initialAngleDegrees ?? 0),
    currentAngle: degreesToRadians(device.initialAngleDegrees ?? 0),
    rotationSpeed: degreesToRadians(device.rotationSpeedDegrees ?? 3),
    lockedDrone: null
  };
}

function normalizeRadarDevice(device, fallbackSpeed) {
  return {
    x: device.x ?? 0,
    z: device.z ?? 0,
    range: device.range ?? 3.4,
    rippleSpeed: device.rippleSpeed ?? fallbackSpeed,
    lockedDrone: null
  };
}

function normalizeKeySite(site) {
  return {
    x: site.x ?? 0,
    z: site.z ?? -3,
    size: site.size ?? 1.2
  };
}

function normalizeUnknownDrone(drone, options) {
  return {
    start: new THREE.Vector3(
      drone.start?.[0] ?? -4.6,
      drone.start?.[1] ?? options.altitude,
      drone.start?.[2] ?? -6.2
    ),
    end: new THREE.Vector3(
      drone.end?.[0] ?? 4.2,
      drone.end?.[1] ?? options.altitude,
      drone.end?.[2] ?? -0.9
    ),
    speed: drone.speed ?? options.speed,
    phase: drone.phase ?? 0,
    currentPosition: new THREE.Vector3()
  };
}

function lerpAngle(from, to, amount) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
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

function createKeySite(site, options) {
  const half = site.size * 0.5;
  const positions = [
    site.x - half,
    0.045,
    site.z - half,
    site.x + half,
    0.045,
    site.z - half,
    site.x + half,
    0.045,
    site.z + half,
    site.x - half,
    0.045,
    site.z + half
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: options.opacity,
    depthWrite: false
  });
  return new THREE.LineLoop(geometry, material);
}

function createUnknownDroneVisual(drone, options) {
  const group = new THREE.Group();
  const droneTexture = createTriangleTexture(options.color);

  const droneMaterial = new THREE.SpriteMaterial({
    map: droneTexture,
    color: '#ffffff',
    transparent: true,
    opacity: 1,
    depthWrite: false,
    rotation: 0
  });
  const sprite = new THREE.Sprite(droneMaterial);
  sprite.scale.set(options.size, options.size, 1);
  group.add(sprite);

  const trail = createDroneTrail(options);
  group.add(trail.line);

  return {
    drone,
    group,
    sprite,
    trail,
    textures: [droneTexture],
    update(elapsed) {
      const progress = (elapsed * drone.speed + drone.phase) % 1;
      sprite.position.lerpVectors(drone.start, drone.end, progress);
      drone.currentPosition.copy(sprite.position);
      trail.update(drone, progress);
    },
    dispose() {
      sprite.material.dispose();
      trail.dispose();
      droneTexture.dispose();
    }
  };
}

function createDroneTrail(options) {
  const pointCount = options.trailLength;
  const positions = new Float32Array(pointCount * 2 * 3);
  const alphas = new Float32Array(pointCount * 2);
  const indices = [];

  for (let i = 0; i < pointCount; i += 1) {
    const fade = 1 - i / (pointCount - 1);
    alphas[i * 2] = options.trailOpacity * fade * fade;
    alphas[i * 2 + 1] = options.trailOpacity * fade * fade;

    if (i < pointCount - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(options.color) }
    },
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;

      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `
  });

  const line = new THREE.Mesh(geometry, material);
  const scratch = new THREE.Vector3();
  const pathDirection = new THREE.Vector3();
  const trailSide = new THREE.Vector3();

  return {
    line,
    update(drone, progress) {
      const positionAttribute = geometry.getAttribute('position');
      const alphaAttribute = geometry.getAttribute('aAlpha');
      pathDirection.subVectors(drone.end, drone.start).normalize();
      trailSide.set(-pathDirection.z, 0, pathDirection.x).normalize();

      for (let i = 0; i < pointCount; i += 1) {
        const trailProgress = progress - i * options.trailSpacing;
        const offset = i * 6;
        const alphaOffset = i * 2;
        const fade = 1 - i / (pointCount - 1);
        const halfWidth = options.trailWidth * (0.18 + fade * 0.82) * 0.5;

        if (trailProgress < 0) {
          scratch.copy(drone.currentPosition);
          alphaAttribute.array[alphaOffset] = 0;
          alphaAttribute.array[alphaOffset + 1] = 0;
        } else {
          scratch.lerpVectors(drone.start, drone.end, trailProgress);
          alphaAttribute.array[alphaOffset] = options.trailOpacity * fade * fade;
          alphaAttribute.array[alphaOffset + 1] = options.trailOpacity * fade * fade;
        }

        positionAttribute.array[offset] = scratch.x + trailSide.x * halfWidth;
        positionAttribute.array[offset + 1] = scratch.y;
        positionAttribute.array[offset + 2] = scratch.z + trailSide.z * halfWidth;
        positionAttribute.array[offset + 3] = scratch.x - trailSide.x * halfWidth;
        positionAttribute.array[offset + 4] = scratch.y;
        positionAttribute.array[offset + 5] = scratch.z - trailSide.z * halfWidth;
      }

      positionAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}

function createConnectionLine(maxConnections) {
  const segmentCount = Math.max(1, maxConnections);
  const positions = new Float32Array(segmentCount * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  const line = new THREE.LineSegments(geometry, material);

  return {
    line,
    update(connections) {
      const positionAttribute = geometry.getAttribute('position');

      for (let i = 0; i < segmentCount; i += 1) {
        const offset = i * 6;
        const connection = connections[i];

        if (!connection) {
          positionAttribute.array[offset] = 0;
          positionAttribute.array[offset + 1] = 0;
          positionAttribute.array[offset + 2] = 0;
          positionAttribute.array[offset + 3] = 0;
          positionAttribute.array[offset + 4] = 0;
          positionAttribute.array[offset + 5] = 0;
          continue;
        }

        positionAttribute.array[offset] = connection.from.x;
        positionAttribute.array[offset + 1] = connection.from.y;
        positionAttribute.array[offset + 2] = connection.from.z;
        positionAttribute.array[offset + 3] = connection.to.x;
        positionAttribute.array[offset + 4] = connection.to.y;
        positionAttribute.array[offset + 5] = connection.to.z;
      }

      positionAttribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
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

function createTriangleTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(48, 18);
  context.lineTo(78, 78);
  context.lineTo(18, 78);
  context.closePath();
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
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
  const cameraTarget = new THREE.Vector3().fromArray(options.camera.lookAt);
  camera.lookAt(cameraTarget);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(options.background, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = options.camera.controls.enabled;
  controls.target.copy(cameraTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.75;
  controls.panSpeed = 0.7;
  controls.screenSpacePanning = true;
  controls.minDistance = options.camera.controls.minDistance;
  controls.maxDistance = options.camera.controls.maxDistance;
  controls.minPolarAngle = options.camera.controls.minPolarAngle;
  controls.maxPolarAngle = options.camera.controls.maxPolarAngle;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
  };
  controls.update();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uPointSize: { value: options.pointSize },
      uMaxPointSize: { value: options.maxPointSize },
      uThreatPointSize: { value: options.threatPointSize },
      uPointColor: { value: new THREE.Color(options.pointColor) },
      uUncoveredPointColor: { value: new THREE.Color(options.uncoveredPointColor) },
      uBreathStrength: { value: options.animation.breathStrength },
      uBreathSpeed: { value: options.animation.breathSpeed },
      uLiftStrength: { value: options.animation.liftStrength },
      uAlertPulse: { value: 0 },
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
      },
      uIntruderCount: { value: 0 },
      uIntruderLifts: {
        value: Array.from({ length: MAX_INTRUDERS }, () => new THREE.Vector4())
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
  const keySites = options.keySites.enabled ? options.keySites.sites.map(normalizeKeySite) : [];
  const unknownDrones = options.unknownDrones.enabled
    ? options.unknownDrones.drones.map((drone) => normalizeUnknownDrone(drone, options.unknownDrones))
    : [];
  const coverageDevices = [...opticDevices, ...radarDevices];
  const opticGroup = new THREE.Group();
  const deviceMeshes = [];
  const keySiteMeshes = [];
  const unknownDroneVisuals = [];
  const connectionLine = createConnectionLine(opticDevices.length + radarDevices.length);
  scene.add(connectionLine.line);

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

  if (keySites.length > 0) {
    const keySiteGroup = new THREE.Group();
    keySites.forEach((site) => {
      const keySiteMesh = createKeySite(site, options.keySites);
      keySiteMeshes.push(keySiteMesh);
      keySiteGroup.add(keySiteMesh);
    });
    scene.add(keySiteGroup);
  }

  if (unknownDrones.length > 0) {
    const droneGroup = new THREE.Group();
    unknownDrones.forEach((drone) => {
      const visual = createUnknownDroneVisual(drone, options.unknownDrones);
      unknownDroneVisuals.push(visual);
      droneGroup.add(visual.group);
    });
    scene.add(droneGroup);
  }

  const clock = new THREE.Clock();
  let frameId = 0;
  let running = false;
  let wasSystemDetected = false;
  let wasDangerActive = false;
  let alertPulseStart = -Infinity;

  const api = {
    scene,
    camera,
    controls,
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
    updateUnknownDrones(elapsed);
    updateDetections(elapsed);
    updateOptics(elapsed);
    updateRadars();
    controls.update();
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

  function updateDetections(elapsed) {
    const connections = [];
    const intruderLifts = [];
    let systemDetected = false;

    opticDevices.forEach((device) => {
      device.lockedDrone = findDroneInRange(device);
      if (device.lockedDrone) {
        systemDetected = true;
        connections.push(createDeviceConnection(device, device.lockedDrone));
      }
    });

    radarDevices.forEach((device) => {
      device.lockedDrone = findDroneInRange(device);
      if (device.lockedDrone) {
        systemDetected = true;
        connections.push(createDeviceConnection(device, device.lockedDrone));
        addUniqueIntruderLift(intruderLifts, device.lockedDrone);
      }
    });

    const dangerActive = unknownDrones.some((drone) => isDroneInsideKeySite(drone));
    updateGlobalPointAlert(elapsed, systemDetected, dangerActive);
    connectionLine.update(connections);
    updateIntruderUniforms(intruderLifts);
  }

  function updateGlobalPointAlert(elapsed, systemDetected, dangerActive) {
    if ((systemDetected && !wasSystemDetected) || (dangerActive && !wasDangerActive)) {
      alertPulseStart = elapsed;
    }

    wasSystemDetected = systemDetected;
    wasDangerActive = dangerActive;

    const pulseDuration = 0.62;
    const pulseProgress = Math.min(1, Math.max(0, (elapsed - alertPulseStart) / pulseDuration));
    const alertPulse = elapsed >= alertPulseStart ? Math.pow(1 - pulseProgress, 2.2) : 0;

    material.uniforms.uAlertPulse.value = alertPulse;
  }

  function isDroneInsideKeySite(drone) {
    return keySites.some((site) => {
      const half = site.size * 0.5;
      return (
        Math.abs(drone.currentPosition.x - site.x) <= half &&
        Math.abs(drone.currentPosition.z - site.z) <= half
      );
    });
  }

  function findDroneInRange(device) {
    let closestDrone = null;
    let closestDistance = Infinity;

    unknownDrones.forEach((drone) => {
      const distance = Math.hypot(drone.currentPosition.x - device.x, drone.currentPosition.z - device.z);
      if (distance <= device.range && distance < closestDistance) {
        closestDrone = drone;
        closestDistance = distance;
      }
    });

    return closestDrone;
  }

  function createDeviceConnection(device, drone) {
    return {
      from: new THREE.Vector3(device.x, 0.1, device.z),
      to: drone.currentPosition
    };
  }

  function addUniqueIntruderLift(intruderLifts, drone) {
    const exists = intruderLifts.some((item) => item.drone === drone);
    if (!exists && intruderLifts.length < MAX_INTRUDERS) {
      intruderLifts.push({ drone, radius: 0.48, strength: 1.0 });
    }
  }

  function updateIntruderUniforms(intruderLifts) {
    material.uniforms.uIntruderCount.value = intruderLifts.length;

    for (let i = 0; i < MAX_INTRUDERS; i += 1) {
      const uniform = material.uniforms.uIntruderLifts.value[i];
      const intruder = intruderLifts[i];

      if (!intruder) {
        uniform.set(0, 0, 0, 0);
        continue;
      }

      uniform.set(
        intruder.drone.currentPosition.x,
        intruder.drone.currentPosition.z,
        intruder.radius,
        intruder.strength
      );
    }
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

      const defaultAngle = device.angle + elapsed * device.rotationSpeed;
      const targetAngle = device.lockedDrone
        ? Math.atan2(device.lockedDrone.currentPosition.z - device.z, device.lockedDrone.currentPosition.x - device.x)
        : defaultAngle;
      const targetFov = device.lockedDrone ? device.lockFov : device.fov;

      device.currentAngle = lerpAngle(device.currentAngle, targetAngle, device.lockedDrone ? 0.24 : 0.055);
      rangeUniform.set(device.x, device.z, device.range);
      scanUniform.set(device.currentAngle, targetFov, device.lockedDrone ? 1 : 0, 0);
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

  function updateUnknownDrones(elapsed) {
    unknownDroneVisuals.forEach((visual) => visual.update(elapsed));
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
    keySiteMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    unknownDroneVisuals.forEach((visual) => visual.dispose());
    connectionLine.dispose();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return api;
}
