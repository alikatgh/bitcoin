import * as THREE from '../vendor/three.module.js';
import { sampleStory } from './story.js';

// All moving coordinates are functions of scroll progress. No second clock is
// involved: the mechanism can be inspected, paused, and reversed at any point.
const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const PALETTE = ['#f28b82', '#efd597', '#d3dd9c', '#b1d7a1', '#93cdbb', '#98bfd5'];

function poseAt(progress) {
  const value = clamp(progress) * 10;
  const index = Math.min(9, Math.floor(value));
  // The object holds while its explanation is readable, then travels during
  // the copy's exit. It arrives exactly at the next scroll milestone.
  return { index, t: ease(clamp((value - index - 0.76) / 0.24)) };
}

function beatAmount(progress, center) {
  return ease(clamp((progress - center + 0.024) / 0.024))
    * (1 - ease(clamp((progress - center - 0.076) / 0.024)));
}

function interpolate(values, pose) {
  return mix(values[pose.index], values[pose.index + 1], pose.t);
}

function vectorPose(object, poses, pose, key = 'position') {
  const a = poses[pose.index];
  const b = poses[pose.index + 1];
  object[key].set(mix(a[0], b[0], pose.t), mix(a[1], b[1], pose.t), mix(a[2], b[2], pose.t));
}

function annulus(outer, inner, depth, segments = 80, holes = 0) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, TAU, false);
  const aperture = new THREE.Path();
  aperture.absarc(0, 0, inner, 0, TAU, true);
  shape.holes.push(aperture);
  for (let i = 0; i < holes; i += 1) {
    const angle = (i / holes) * TAU;
    const radius = (inner + outer) / 2;
    const hole = new THREE.Path();
    hole.absarc(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.min(0.065, (outer - inner) * 0.2), 0, TAU, true);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: segments,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function gearGeometry(outer, inner, depth, teeth = 64) {
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth * 4; i += 1) {
    const angle = i / (teeth * 4) * TAU;
    const radius = outer - ((i % 4 === 0 || i % 4 === 3) ? 0.07 : 0);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, TAU, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 64, bevelEnabled: true,
    bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function roundedPlate(width, height, depth, radius = 0.06) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 3, bevelEnabled: true,
    bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function bitcoinGeometry() {
  // A drawn outline rather than a font or image: the two open counters and
  // double stems remain recognizable when the medallion turns sideways.
  const shape = new THREE.Shape();
  shape.moveTo(-0.46, -0.7);
  shape.lineTo(-0.46, 0.7);
  shape.lineTo(0.13, 0.7);
  shape.bezierCurveTo(0.75, 0.7, 0.82, 0.15, 0.38, 0.035);
  shape.bezierCurveTo(0.98, -0.09, 0.79, -0.7, 0.13, -0.7);
  shape.closePath();
  const upper = new THREE.Path();
  upper.moveTo(-0.12, 0.43);
  upper.lineTo(0.10, 0.43);
  upper.bezierCurveTo(0.45, 0.43, 0.45, 0.16, 0.10, 0.16);
  upper.lineTo(-0.12, 0.16);
  upper.closePath();
  const lower = new THREE.Path();
  lower.moveTo(-0.12, -0.10);
  lower.lineTo(0.13, -0.10);
  lower.bezierCurveTo(0.54, -0.10, 0.54, -0.43, 0.13, -0.43);
  lower.lineTo(-0.12, -0.43);
  lower.closePath();
  shape.holes.push(upper, lower);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08, steps: 1, curveSegments: 12, bevelEnabled: true,
    bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1,
  });
  geometry.translate(0, 0, -0.04);
  return geometry;
}

function segmentGeometry(radius, width, angle, depth) {
  const shape = new THREE.Shape();
  const half = angle / 2;
  shape.absarc(0, 0, radius + width / 2, -half, half, false);
  shape.absarc(0, 0, radius - width / 2, half, -half, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 5, bevelEnabled: true,
    bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function lineGeometry(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function ringLines(radii, z, segments = 128) {
  const points = [];
  for (const radius of radii) {
    for (let i = 0; i < segments; i += 1) {
      const a = i / segments * TAU;
      const b = (i + 1) / segments * TAU;
      points.push(Math.cos(a) * radius, Math.sin(a) * radius, z, Math.cos(b) * radius, Math.sin(b) * radius, z);
    }
  }
  return lineGeometry(points);
}

export function createMachineScene(container, { rendererFactory = (config) => new THREE.WebGLRenderer(config) } = {}) {
  if (!container || typeof container.appendChild !== 'function') throw new Error('A machine container is required.');

  let renderer;
  try {
    renderer = rendererFactory({ alpha: true, antialias: true, powerPreference: 'default' });
  } catch (error) {
    throw new Error('WebGL is unavailable; the static Bitcoin illustration remains visible.', { cause: error });
  }
  const canvas = renderer.domElement;
  canvas.className = 'machine-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 70);
  camera.position.set(0, 0, 22);
  const machine = new THREE.Group();
  scene.add(machine);
  const geometries = new Set();
  const materials = new Set();
  const themed = [];
  const wireObjects = [];
  const diagramSurfaces = [];
  const instancedOutlines = [];
  const edgeGeometryCache = new Map();
  const ownGeometry = (geometry) => { geometries.add(geometry); return geometry; };
  const ownMaterial = (material) => { materials.add(material); return material; };
  const material = (dark, light, extra = {}) => {
    const result = ownMaterial(new THREE.MeshStandardMaterial({
      color: dark, roughness: 0.76, metalness: 0.18, ...extra,
    }));
    const diagram = { value: 0 };
    result.onBeforeCompile = (shader) => {
      shader.uniforms.diagramAmount = diagram;
      shader.fragmentShader = `uniform float diagramAmount;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.8745098, 0.8588235, 0.8352941), diagramAmount);');
    };
    result.customProgramCacheKey = () => 'bitcoin-cream-diagram-v1';
    themed.push({ material: result, dark: new THREE.Color(dark), light: new THREE.Color(light), diagram });
    return result;
  };
  const metal = material('#515a53', '#dedad2');
  const silver = material('#92988d', '#e0dcd3');
  const face = material('#737a70', '#ddd9d1');
  const graphite = material('#343c36', '#d3d0c8');
  const charcoal = material('#252d27', '#cacac1');
  const black = material('#141d17', '#b8bdb5');
  const copper = material('#a38068', '#ccc4b8', { metalness: 0.25 });
  const coral = material('#f28b82', '#e98076', { metalness: 0.05, roughness: 0.68 });
  const cream = material('#e6e0d2', '#514d46', { metalness: 0.06 });
  const mint = material('#9dd4ba', '#6caa91', { metalness: 0.05 });
  const accents = PALETTE.map((color) => material(color, color, { metalness: 0.08 }));
  const edgeMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#121615', transparent: true, opacity: 0.7 }));
  const fineEdgeMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#c0c4b7', transparent: true, opacity: 0.37 }));
  const wireMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#73766e', transparent: true, opacity: 0, depthWrite: false }));
  const diagramMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: '#dfdbd5', toneMapped: false }));
  const copperLineMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#d3a591', transparent: true, opacity: 0.75 }));
  const proofMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#e27d74', transparent: true, opacity: 0 }));
  const networkMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#8caaa0', transparent: true, opacity: 0 }));

  const ambient = new THREE.HemisphereLight('#f4eee1', '#303633', 2.25);
  const key = new THREE.DirectionalLight('#fff4dc', 3.0);
  key.position.set(-4, 7, 11);
  const fill = new THREE.DirectionalLight('#b9c8d1', 1.4);
  fill.position.set(6, 0, 7);
  const rim = new THREE.DirectionalLight('#f6bba1', 1.1);
  rim.position.set(-4, -5, -3);
  scene.add(ambient, key, fill, rim);

  function mesh(parent, geometry, surface, position = [0, 0, 0], outlined = false) {
    ownGeometry(geometry);
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(...position);
    parent.add(object);
    if (![coral, cream, mint].includes(surface)) {
      diagramSurfaces.push({ object, surface });
    }
    if (!outlined && ![coral, cream, mint].includes(surface)) {
      const wire = new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(geometry, 26)), wireMaterial);
      wire.visible = false;
      object.add(wire);
      wireObjects.push(wire);
    }
    if (outlined) {
      const lines = new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(geometry, 26)), edgeMaterial);
      object.add(lines);
    }
    return object;
  }

  function lines(parent, geometry, surface = fineEdgeMaterial) {
    const object = new THREE.LineSegments(ownGeometry(geometry), surface);
    parent.add(object);
    return object;
  }

  const dummy = new THREE.Object3D();
  function instances(parent, geometry, surface, count, transform) {
    ownGeometry(geometry);
    const object = new THREE.InstancedMesh(geometry, surface, count);
    object.frustumCulled = false;
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      transform(dummy, i);
      dummy.updateMatrix();
      object.setMatrixAt(i, dummy.matrix);
    }
    parent.add(object);
    diagramSurfaces.push({ object, surface });
    let edges = edgeGeometryCache.get(geometry);
    if (!edges) {
      edges = ownGeometry(new THREE.EdgesGeometry(geometry, 26));
      edgeGeometryCache.set(geometry, edges);
    }
    const source = edges.attributes.position;
    const outlineGeometry = ownGeometry(new THREE.BufferGeometry());
    outlineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(source.count * 3 * count), 3));
    const wire = new THREE.LineSegments(outlineGeometry, wireMaterial);
    wire.frustumCulled = false;
    wire.visible = false;
    parent.add(wire);
    wireObjects.push(wire);
    instancedOutlines.push({ object, geometry: outlineGeometry, source, version: -1 });
    return object;
  }

  const boltGeometry = ownGeometry(new THREE.CylinderGeometry(0.062, 0.062, 0.065, 6));
  boltGeometry.rotateX(Math.PI / 2);
  const slotGeometry = ownGeometry(new THREE.BoxGeometry(0.065, 0.012, 0.009));
  const ribGeometry = ownGeometry(new THREE.BoxGeometry(0.035, 0.21, 0.1));
  function boltCircle(parent, count, radius, z) {
    instances(parent, boltGeometry, silver, count, (object, i) => {
      const a = i / count * TAU;
      object.position.set(Math.cos(a) * radius, Math.sin(a) * radius, z);
      object.rotation.z = a;
    });
    instances(parent, slotGeometry, black, count, (object, i) => {
      const a = i / count * TAU;
      object.position.set(Math.cos(a) * radius, Math.sin(a) * radius, z + 0.037);
      object.rotation.z = a + Math.PI / 4;
    });
  }

  // The back housing is an open, ribbed cylindrical bearing, not a solid disk.
  const housing = new THREE.Group();
  machine.add(housing);
  mesh(housing, gearGeometry(3.24, 2.69, 0.22, 80), graphite, [0, 0, -0.47], true);
  mesh(housing, annulus(3.09, 2.73, 0.12), metal, [0, 0, 0.20], true);
  const coolingRing = ownGeometry(annulus(3.13, 2.96, 0.032, 48));
  instances(housing, coolingRing, metal, 13, (object, i) => { object.position.z = -0.39 + i * 0.044; });
  instances(housing, new THREE.BoxGeometry(0.09, 0.16, 0.68), graphite, 64, (object, i) => {
    const a = i / 64 * TAU;
    object.position.set(Math.cos(a) * 3.04, Math.sin(a) * 3.04, -0.08);
    object.rotation.z = a;
  });
  lines(housing, ringLines([2.72, 2.79, 3.04, 3.1, 3.23], 0.28));
  boltCircle(housing, 32, 2.9, 0.29);

  const spectrum = new THREE.Group();
  housing.add(spectrum);
  mesh(spectrum, annulus(3.39, 3.26, 0.12, 96), black, [0, 0, 0.06]);
  const spectrumSegment = ownGeometry(segmentGeometry(3.325, 0.115, TAU / 72 * 0.82, 0.085));
  for (let color = 0; color < accents.length; color += 1) {
    instances(spectrum, spectrumSegment, accents[color], 12, (object, i) => {
      object.position.z = 0.13;
      object.rotation.z = (color * 12 + i) / 72 * TAU;
    });
  }
  lines(spectrum, ringLines([3.26, 3.39], 0.19));

  // The perforated face and inner bearing can separate along the same axle.
  const faceplate = new THREE.Group();
  machine.add(faceplate);
  mesh(faceplate, annulus(2.8, 2.43, 0.13, 48, 40), face, [0, 0, 0], true);
  mesh(faceplate, annulus(2.46, 2.38, 0.16), charcoal, [0, 0, 0.02], true);
  mesh(faceplate, annulus(2.85, 2.79, 0.06), silver, [0, 0, 0.05], true);
  instances(faceplate, new THREE.BoxGeometry(0.012, 0.11, 0.013), black, 144, (object, i) => {
    const a = i / 144 * TAU;
    object.position.set(Math.cos(a) * 2.68, Math.sin(a) * 2.68, 0.09);
    object.rotation.z = a - Math.PI / 2;
    object.scale.y = i % 6 === 0 ? 1 : 0.5;
  });
  lines(faceplate, ringLines([2.49, 2.55, 2.76], 0.085));

  const bearing = new THREE.Group();
  machine.add(bearing);
  mesh(bearing, gearGeometry(1.91, 1.56, 0.19, 64), silver, [0, 0, 0], true);
  mesh(bearing, annulus(1.59, 1.43, 0.24), graphite, [0, 0, 0.035], true);
  mesh(bearing, annulus(1.47, 1.38, 0.1), copper, [0, 0, 0.16], true);
  const bearingBall = ownGeometry(new THREE.SphereGeometry(0.067, 8, 6));
  instances(bearing, bearingBall, charcoal, 48, (object, i) => {
    const a = i / 48 * TAU;
    object.position.set(Math.cos(a) * 1.66, Math.sin(a) * 1.66, 0.13);
  });
  boltCircle(bearing, 16, 1.8, 0.14);
  lines(bearing, ringLines([1.42, 1.52, 1.72, 1.86], 0.14));

  // 64 independently positioned hash pistons; InstancedMesh keeps this to four
  // draw calls even when their lengths change during proof of work.
  const rotor = new THREE.Group();
  machine.add(rotor);
  mesh(rotor, annulus(2.37, 2.04, 0.16), graphite, [0, 0, -0.09], true);
  mesh(rotor, gearGeometry(2.12, 1.95, 0.12, 64), copper, [0, 0, 0.02], true);
  const hashGeometry = ownGeometry(new THREE.BoxGeometry(0.075, 0.4, 0.16));
  const hashMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.12 }));
  const hashBars = instances(rotor, hashGeometry, hashMaterial, 64, () => {});
  const hashCaps = instances(rotor, new THREE.BoxGeometry(0.083, 0.025, 0.18), black, 64, () => {});
  const nonceAnchor = new THREE.Object3D();
  nonceAnchor.position.set(-1.72, 1.25, 0.2);
  const acceptedAnchor = new THREE.Object3D();
  rotor.add(nonceAnchor, acceptedAnchor);
  instances(rotor, ribGeometry, silver, 64, (object, i) => {
    const a = i / 64 * TAU;
    object.position.set(Math.cos(a) * 2.27, Math.sin(a) * 2.27, 0.07);
    object.rotation.z = a - Math.PI / 2;
    object.scale.y = 0.64;
  });
  lines(rotor, ringLines([2.07, 2.21, 2.32], 0.1));

  const core = new THREE.Group();
  machine.add(core);
  mesh(core, gearGeometry(1.37, 1.08, 0.18, 48), metal, [0, 0, -0.03], true);
  mesh(core, annulus(1.19, 1.04, 0.24), black, [0, 0, 0.05], true);
  mesh(core, annulus(1.13, 1.04, 0.1), silver, [0, 0, 0.2], true);
  const discGeometry = ownGeometry(new THREE.CylinderGeometry(1.035, 1.035, 0.16, 80));
  discGeometry.rotateX(Math.PI / 2);
  mesh(core, discGeometry, coral, [0, 0, 0.18], true);
  const glyph = mesh(core, bitcoinGeometry(), cream, [-0.04, 0, 0.31], true);
  glyph.rotation.z = -0.14;
  const stemGeometry = ownGeometry(new THREE.BoxGeometry(0.105, 0.23, 0.07));
  for (const x of [-0.30, -0.05]) {
    mesh(glyph, stemGeometry, cream, [x, 0.79, -0.035]);
    mesh(glyph, stemGeometry, cream, [x, -0.79, -0.035]);
  }
  boltCircle(core, 12, 1.255, 0.12);
  instances(core, new THREE.BoxGeometry(0.028, 0.105, 0.025), black, 48, (object, i) => {
    const a = i / 48 * TAU;
    object.position.set(Math.cos(a) * 0.96, Math.sin(a) * 0.96, 0.28);
    object.rotation.z = a - Math.PI / 2;
  });
  lines(core, ringLines([0.86, 1.025, 1.12, 1.30], 0.28));

  // A machined axle visible through the open bearings when the assembly opens.
  const axle = new THREE.Group();
  machine.add(axle);
  const shaftGeometry = ownGeometry(new THREE.CylinderGeometry(0.18, 0.18, 2.8, 24));
  shaftGeometry.rotateX(Math.PI / 2);
  mesh(axle, shaftGeometry, charcoal, [0, 0, -0.15], true);
  instances(axle, annulus(0.29, 0.18, 0.045, 24), silver, 16, (object, i) => { object.position.z = -1.25 + i * 0.15; });

  // Eight transaction cassettes are embedded around the hero bearing. They
  // become peers, block contents, Merkle leaves, inputs/outputs and chain links.
  const modules = [];
  const moduleBody = ownGeometry(roundedPlate(0.83, 0.55, 0.21));
  const moduleBoard = ownGeometry(roundedPlate(0.68, 0.38, 0.035, 0.025));
  const moduleChip = ownGeometry(new THREE.BoxGeometry(0.20, 0.14, 0.055));
  const moduleRib = ownGeometry(new THREE.BoxGeometry(0.028, 0.31, 0.075));
  const moduleTrace = [];
  for (let i = 0; i < 3; i += 1) {
    const y = -0.10 + i * 0.10;
    moduleTrace.push(-0.29, y, 0.155, -0.18, y, 0.155, -0.18, y, 0.155, -0.18, y + 0.035, 0.155, -0.18, y + 0.035, 0.155, -0.105, y + 0.035, 0.155);
    moduleTrace.push(0.11, y, 0.155, 0.20, y, 0.155, 0.20, y, 0.155, 0.20, y - 0.035, 0.155, 0.20, y - 0.035, 0.155, 0.29, y - 0.035, 0.155);
  }
  const moduleTraceGeometry = ownGeometry(lineGeometry(moduleTrace));
  const moduleOutlineGeometry = ownGeometry(new THREE.EdgesGeometry(moduleBody, 24));
  const moduleBoltGeometry = ownGeometry(new THREE.CylinderGeometry(0.034, 0.034, 0.035, 6));
  moduleBoltGeometry.rotateX(Math.PI / 2);
  for (let i = 0; i < 8; i += 1) {
    const group = new THREE.Group();
    machine.add(group);
    mesh(group, moduleBody, silver);
    mesh(group, moduleBoard, charcoal, [0, 0, 0.12]);
    mesh(group, moduleChip, i === 0 ? coral : graphite, [0, 0, 0.165], true);
    lines(group, moduleTraceGeometry, copperLineMaterial);
    lines(group, moduleOutlineGeometry, edgeMaterial);
    instances(group, moduleRib, metal, 7, (object, n) => { object.position.set(-0.33 + n * 0.11, 0, -0.12); });
    instances(group, moduleBoltGeometry, black, 4, (object, n) => {
      object.position.set(n % 2 ? 0.35 : -0.35, n < 2 ? -0.205 : 0.205, 0.13);
    });
    // The four tiny contact pads form a physical connector at each short end.
    instances(group, new THREE.BoxGeometry(0.06, 0.035, 0.045), copper, 8, (object, n) => {
      object.position.set(n < 4 ? -0.455 : 0.455, -0.135 + (n % 4) * 0.09, 0.04);
    });
    modules.push(group);
  }

  // The spokes are tangible pairs of steel rails rather than decorative rays.
  const struts = new THREE.Group();
  machine.add(struts);
  instances(struts, new THREE.BoxGeometry(0.045, 1.13, 0.09), metal, 16, (object, i) => {
    const a = Math.floor(i / 2) / 8 * TAU + Math.PI / 8;
    object.position.set(Math.cos(a) * 2.00 + Math.sin(a) * (i % 2 ? 0.085 : -0.085), Math.sin(a) * 2.00 - Math.cos(a) * (i % 2 ? 0.085 : -0.085), -0.22);
    object.rotation.z = a - Math.PI / 2;
  });

  const nodes = [];
  const nodeGeometry = ownGeometry(new THREE.CylinderGeometry(0.11, 0.11, 0.085, 12));
  nodeGeometry.rotateX(Math.PI / 2);
  const nodeRingGeometry = ownGeometry(annulus(0.14, 0.11, 0.045, 16));
  for (let i = 0; i < 15; i += 1) {
    const group = new THREE.Group();
    machine.add(group);
    mesh(group, nodeGeometry, [0, 8, 12, 14].includes(i) ? coral : graphite);
    mesh(group, nodeRingGeometry, silver, [0, 0, 0.04]);
    nodes.push(group);
  }

  const networkPositions = new Float32Array(32 * 6);
  const proofPositions = new Float32Array(4 * 6);
  const networkGeometry = ownGeometry(new THREE.BufferGeometry());
  networkGeometry.setAttribute('position', new THREE.BufferAttribute(networkPositions, 3));
  networkGeometry.setDrawRange(0, 0);
  const proofGeometry = ownGeometry(new THREE.BufferGeometry());
  proofGeometry.setAttribute('position', new THREE.BufferAttribute(proofPositions, 3));
  proofGeometry.setDrawRange(0, 0);
  lines(machine, networkGeometry, networkMaterial).frustumCulled = false;
  lines(machine, proofGeometry, proofMaterial).frustumCulled = false;

  const rootRotations = [
    [0.13, -0.22, -0.12], [0.25, -0.73, -0.12], [0.15, -0.30, 0.05],
    [-0.45, -1.00, -0.25], [0.18, -0.23, -0.12], [0.36, -0.57, -0.20],
    [0.12, -0.14, -0.08], [0.19, -0.34, -0.12], [0.18, -0.33, 0.12],
    [0.20, -0.38, -0.16], [0.13, -0.22, -0.12],
  ];
  const rootScales = [1, 0.98, 0.88, 0.85, 1.02, 0.98, 0.91, 0.96, 0.88, 0.99, 1];
  const housingZ = [-0.35, -1.12, -0.72, -2.30, -0.77, -1.27, -1.19, -1.04, -0.89, -1.17, -0.35];
  const faceZ = [0.16, 0.81, -0.19, 1.20, 0.15, 0.34, -0.56, -0.32, 0.10, -0.42, 0.16];
  const bearingZ = [0.22, 0.24, 0.10, 0.33, 0.44, 0.02, -0.29, 0.20, 0.24, -0.06, 0.22];
  const rotorZ = [0.18, -0.54, -0.31, -0.90, 0.23, -0.61, -0.77, -0.47, -0.23, -0.49, 0.18];
  const corePoses = [
    [0, 0, 0.43], [0, 0, 1.52], [0, 0, 0.87], [0, 0, 3.00],
    [0, 0, 0.82], [0.13, 0.12, 0.97], [-2.72, -1.68, 0.69],
    [0, 0, 1.15], [0, 0, 0.91], [0.65, 0.27, 1.01], [0, 0, 0.43],
  ];
  const coreScales = [1, 1, 0.86, 0.78, 0.88, 0.63, 0.29, 0.67, 0.81, 0.60, 1];
  const modulePoses = modules.map((group, i) => {
    const a = i / 8 * TAU + Math.PI / 8;
    const radial = (radius, z) => [Math.cos(a) * radius, Math.sin(a) * radius, z];
    const chainY = (i < 6 ? 0.3 : -1.15);
    return [
      radial(2.10, 0.38), radial(2.17, 0.69), radial(3.10, 0.67),
      [0.12, -0.2, -0.6 + i * 0.33], radial(2.40, 0.67),
      [-2.58 + i * 0.74, -0.2 + i * 0.07, 0.52 + i * 0.12],
      [(i - 3.5) * 0.78, -1.68, 0.34],
      [i < 3 ? -2.55 : i < 6 ? 2.50 : i === 6 ? 1.75 : -0.35, i < 3 ? 1.12 - i * 1.12 : i < 6 ? 1.12 - (i - 3) * 1.12 : -2.05, 0.57],
      radial(3.13, 0.67),
      [i < 6 ? -2.55 + i * 0.88 : -0.64 + (i - 6) * 0.88, chainY, 0.55 + (i < 6 ? i : i - 4) * 0.09],
      radial(2.10, 0.38),
    ];
  });
  const moduleAngles = modules.map((group, i) => {
    const a = i / 8 * TAU + Math.PI / 8;
    return [a - Math.PI / 2, a - Math.PI / 2, 0, 0, a - Math.PI / 2, -0.08, 0, 0, a - Math.PI / 2, 0, a - Math.PI / 2];
  });
  const moduleScales = [1, 1, 1.08, 1.6, 0.95, 0.94, 0.77, 1.15, 1.04, 0.94, 1];
  const treePositions = [];
  for (let i = 0; i < 8; i += 1) treePositions.push([(i - 3.5) * 0.78, -1.68, 0.57]);
  for (let i = 0; i < 4; i += 1) treePositions.push([(i - 1.5) * 1.56, -0.40, 0.64]);
  for (let i = 0; i < 2; i += 1) treePositions.push([(i - 0.5) * 3.12, 0.79, 0.70]);
  treePositions.push([0, 1.92, 0.78]);
  const treeLinks = [];
  for (let i = 0; i < 8; i += 1) treeLinks.push([i, 8 + Math.floor(i / 2)]);
  for (let i = 0; i < 4; i += 1) treeLinks.push([8 + i, 12 + Math.floor(i / 2)]);
  treeLinks.push([12, 14], [13, 14]);
  const projected = new THREE.Vector3();
  const outlinePoint = new THREE.Vector3();
  const outlineMatrix = new THREE.Matrix4();
  const scratchColor = new THREE.Color();
  const hashDark = new THREE.Color('#92948b');
  const hashLight = new THREE.Color('#aaa9a2');
  const coralColor = new THREE.Color('#ef8c82');
  const mintColor = new THREE.Color('#a9d8b8');
  const whiteColor = new THREE.Color('#ffffff');
  let lastProgress = 0;
  let lastOptions = {};
  let destroyed = false;
  let contextLost = false;
  let previousWidth = 0;
  let previousHeight = 0;

  function anchor(object, id, visible = true) {
    object.getWorldPosition(projected);
    projected.project(camera);
    return { id, x: (projected.x + 1) / 2, y: (1 - projected.y) / 2, visible: visible && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05 };
  }

  function render(progress, options = {}) {
    if (destroyed) throw new Error('The Bitcoin machine has been destroyed.');
    if (contextLost) return { ready: false, anchors: [] };
    lastProgress = clamp(Number.isFinite(progress) ? progress : 0);
    lastOptions = options;
    const width = Math.max(1, container.clientWidth || container.getBoundingClientRect().width);
    const height = Math.max(1, container.clientHeight || container.getBoundingClientRect().height);
    if (width !== previousWidth || height !== previousHeight) {
      renderer.setSize(width, height, false);
      previousWidth = width;
      previousHeight = height;
    }
    const aspect = width / height;
    const portrait = width <= 760;
    // On a wide phone/tablet the available height, rather than width, is the
    // limiting dimension. Keep the whole mechanism beneath the reading area.
    const viewHeight = portrait ? Math.max(7.9 / aspect, 14.8) : 9.15;
    const viewWidth = viewHeight * aspect;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    const pose = poseAt(lastProgress);
    const story = sampleStory(lastProgress);
    const light = clamp(story.light || 0);
    for (const item of themed) {
      item.material.color.copy(item.dark).lerp(item.light, light);
      item.diagram.value = [coral, cream, mint].includes(item.material) ? 0 : light;
    }
    for (const item of diagramSurfaces) item.object.material = light > 0.99999 ? diagramMaterial : item.surface;
    edgeMaterial.color.set(light > 0.5 ? '#5e635f' : '#141816');
    edgeMaterial.opacity = mix(0.74, 0.66, light);
    fineEdgeMaterial.color.set(light > 0.5 ? '#717771' : '#c0c4b7');
    fineEdgeMaterial.opacity = mix(0.37, 0.8, light);
    wireMaterial.opacity = light * 0.7;
    for (const wire of wireObjects) wire.visible = light > 0.002;
    copperLineMaterial.color.set(light > 0.5 ? '#8b7b6a' : '#d0aa91');
    ambient.intensity = mix(1.35, 2.1, light);
    key.intensity = mix(2.15, 0.7, light);
    fill.intensity = mix(0.8, 0.45, light);
    rim.intensity = mix(0.9, 0.2, light);

    vectorPose(machine, rootRotations, pose, 'rotation');
    const scale = interpolate(rootScales, pose) * (portrait ? 0.97 : 1);
    machine.scale.setScalar(scale);
    machine.position.set(portrait ? 0 : viewWidth * 0.171, portrait ? -viewHeight * 0.16 : -0.12, 0);
    housing.position.z = interpolate(housingZ, pose);
    faceplate.position.z = interpolate(faceZ, pose);
    bearing.position.z = interpolate(bearingZ, pose);
    rotor.position.z = interpolate(rotorZ, pose);
    vectorPose(core, corePoses, pose);
    core.scale.setScalar(interpolate(coreScales, pose));
    const motion = options.reducedMotion ? 0.2 : 1;
    const spin = lastProgress * TAU * motion;
    bearing.rotation.z = spin * 0.36;
    rotor.rotation.z = -spin * 0.64;
    faceplate.rotation.z = spin * 0.08;
    spectrum.rotation.z = spin * 0.10;
    housing.rotation.z = -spin * 0.025;
    struts.rotation.z = spin * 0.05;
    struts.position.z = mix(housing.position.z, bearing.position.z, 0.55);
    axle.scale.z = interpolate([0.64, 1.2, 0.85, 1.45, 0.93, 1.18, 1.15, 0.99, 0.95, 1.10, 0.64], pose);
    // The axle terminates behind the bearing, including when the payment moves
    // away to a Merkle leaf. It must never punch through the Bitcoin counters.
    axle.position.z = Math.min(core.position.z - core.scale.x * 0.3, bearing.position.z - 0.3) - axle.scale.z * 1.25;

    const mining = beatAmount(lastProgress, 0.4);
    const accepted = ease(clamp((lastProgress - 0.375) / 0.022)) * ease(clamp((0.51 - lastProgress) / 0.055));
    for (let i = 0; i < 64; i += 1) {
      const a = i / 64 * TAU;
      const variation = 0.52 + ((i * 17 + 13) % 29) / 29 * 0.60;
      const travel = Math.sin(lastProgress * 77 * motion + i * 2.399) * 0.5 + 0.5;
      const length = mix(0.29, 0.23 + travel * 0.48, mining) * variation;
      dummy.position.set(Math.cos(a) * (2.12 - length * 0.18), Math.sin(a) * (2.12 - length * 0.18), 0.12 + mining * travel * 0.08);
      dummy.rotation.set(0, 0, a - Math.PI / 2);
      dummy.scale.set(1, length / 0.4, 1);
      dummy.updateMatrix();
      hashBars.setMatrixAt(i, dummy.matrix);
      if (i === 9) acceptedAnchor.position.copy(dummy.position);
      dummy.position.set(Math.cos(a) * (2.12 + length * 0.32), Math.sin(a) * (2.12 + length * 0.32), 0.12 + mining * travel * 0.08);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      hashCaps.setMatrixAt(i, dummy.matrix);
      scratchColor.copy(hashDark).lerp(hashLight, light);
      if (i % 8 === 0) scratchColor.lerp(coralColor, 0.65);
      scratchColor.lerp(coralColor, mining * 0.83);
      if (i === 9) scratchColor.lerp(mintColor, accepted);
      scratchColor.lerp(whiteColor, light);
      hashBars.setColorAt(i, scratchColor);
    }
    hashBars.instanceMatrix.needsUpdate = true;
    hashBars.instanceColor.needsUpdate = true;
    hashCaps.instanceMatrix.needsUpdate = true;

    const cassetteScale = interpolate(moduleScales, pose);
    for (let i = 0; i < modules.length; i += 1) {
      vectorPose(modules[i], modulePoses[i], pose);
      modules[i].rotation.set(0, 0, interpolate(moduleAngles[i], pose));
      modules[i].scale.setScalar(cassetteScale);
    }
    const tree = beatAmount(lastProgress, 0.6);
    for (let i = 0; i < nodes.length; i += 1) {
      const a = i / 15 * TAU;
      const r = 1.28;
      nodes[i].position.set(mix(Math.cos(a) * r, treePositions[i][0], tree), mix(Math.sin(a) * r, treePositions[i][1], tree), mix(-0.08, treePositions[i][2], tree));
      nodes[i].scale.setScalar(mix(0.42, 1, tree));
    }

    let connectionCount = 0;
    let proofCount = 0;
    function connection(from, to, target = networkPositions, proof = false) {
      const count = proof ? proofCount++ : connectionCount++;
      const offset = count * 6;
      target[offset] = from.x;
      target[offset + 1] = from.y;
      target[offset + 2] = from.z;
      target[offset + 3] = to.x;
      target[offset + 4] = to.y;
      target[offset + 5] = to.z;
    }
    const phase = Math.min(9, Math.floor(lastProgress * 10 + 0.00001));
    const peers = beatAmount(lastProgress, 0.2);
    const chain = Math.max(beatAmount(lastProgress, 0.5), beatAmount(lastProgress, 0.9));
    const flow = beatAmount(lastProgress, 0.7);
    const addresses = beatAmount(lastProgress, 0.8);
    if (tree > 0.001) {
      for (const [from, to] of treeLinks) connection(nodes[from].position, nodes[to].position);
      for (const [from, to] of [[0, 8], [8, 12], [12, 14]]) connection(nodes[from].position, nodes[to].position, proofPositions, true);
    } else if (chain > 0.001) {
      const lastMain = phase >= 8 ? 5 : 7;
      for (let i = 0; i < lastMain; i += 1) connection(modules[i].position, modules[i + 1].position);
      if (phase >= 8) {
        connection(modules[2].position, modules[6].position, proofPositions, true);
        connection(modules[6].position, modules[7].position, proofPositions, true);
      }
    } else if (peers > 0.001 || flow > 0.001 || addresses > 0.001) {
      for (const group of modules) connection(core.position, group.position);
      if (peers > 0.001 || addresses > 0.001) {
        for (let i = 0; i < modules.length; i += 1) connection(modules[i].position, modules[(i + 1) % modules.length].position);
      }
    }
    networkMaterial.opacity = Math.max(tree * 0.8, peers * 0.33, chain * 0.68, flow * 0.66, addresses * 0.35);
    networkMaterial.color.set(light > 0.5 ? '#737d75' : '#92aaa0');
    proofMaterial.opacity = Math.max(tree, phase >= 8 ? chain * 0.9 : 0);
    networkGeometry.attributes.position.needsUpdate = true;
    proofGeometry.attributes.position.needsUpdate = true;
    networkGeometry.setDrawRange(0, connectionCount * 2);
    proofGeometry.setDrawRange(0, proofCount * 2);
    if (light > 0.002) {
      for (const outline of instancedOutlines) {
        if (outline.version === outline.object.instanceMatrix.version) continue;
        const target = outline.geometry.attributes.position;
        let cursor = 0;
        for (let i = 0; i < outline.object.count; i += 1) {
          outline.object.getMatrixAt(i, outlineMatrix);
          for (let j = 0; j < outline.source.count; j += 1) {
            outlinePoint.fromBufferAttribute(outline.source, j).applyMatrix4(outlineMatrix);
            target.setXYZ(cursor++, outlinePoint.x, outlinePoint.y, outlinePoint.z);
          }
        }
        target.needsUpdate = true;
        outline.version = outline.object.instanceMatrix.version;
      }
    }
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);

    const anchorTargets = [
      [core, housing], [core, modules[0]], [modules[2], core],
      [housing, modules[7]], [nonceAnchor, acceptedAnchor], [modules[4], core],
      [nodes[14], core], [modules[1], modules[4]], [modules[2], core],
      [modules[3], modules[7]], [core, modules[2]],
    ];
    const [primary, secondary] = anchorTargets[Math.min(10, story.index)];
    return {
      ready: true,
      anchors: [anchor(primary, 'primary'), anchor(secondary, 'secondary')],
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  }

  function lost(event) {
    event.preventDefault();
    contextLost = true;
    canvas.style.visibility = 'hidden';
    container.dispatchEvent(new CustomEvent('scene-lost'));
  }
  function restored() {
    if (destroyed) return;
    contextLost = false;
    canvas.style.visibility = '';
    try {
      render(lastProgress, lastOptions);
      container.dispatchEvent(new CustomEvent('scene-restored'));
    } catch {
      contextLost = true;
      canvas.style.visibility = 'hidden';
      container.dispatchEvent(new CustomEvent('scene-lost'));
    }
  }
  canvas.addEventListener('webglcontextlost', lost, false);
  canvas.addEventListener('webglcontextrestored', restored, false);
  container.appendChild(canvas);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return { render, destroy };
}
