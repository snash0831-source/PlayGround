import * as THREE from 'three';

let _gradient = null;

/* A tiny stepped ramp gives the flat, painted shading of a 2D cartoon. */
export function toonGradientMap() {
  if (_gradient) return _gradient;
  const steps = new Uint8Array([58, 118, 186, 246]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradient = tex;
  return tex;
}

export function toonMaterial(opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    gradientMap: opts.gradientMap ?? toonGradientMap(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    alphaTest: opts.alphaTest ?? 0,
    alphaMap: opts.alphaMap ?? null,
    depthWrite: opts.depthWrite ?? true,
    fog: opts.fog ?? true
  });
  mat.name = opts.name ?? '';
  return mat;
}

function convertMaterial(source, cache) {
  if (!source || Array.isArray(source)) return source;
  if (!source.isMeshStandardMaterial && !source.isMeshPhongMaterial && !source.isMeshLambertMaterial) return source;
  if (source.userData && source.userData.noToon) return source;
  if (cache.has(source.uuid)) return cache.get(source.uuid);
  const mat = toonMaterial({
    color: source.color ? source.color.clone() : 0xffffff,
    map: source.map,
    emissive: source.emissive ? source.emissive.clone() : 0x000000,
    emissiveIntensity: source.emissiveIntensity ?? 0,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    vertexColors: source.vertexColors,
    alphaTest: source.alphaTest,
    alphaMap: source.alphaMap,
    depthWrite: source.depthWrite,
    fog: source.fog,
    name: source.name
  });
  mat.userData.noOutline = source.userData?.noOutline ?? false;
  cache.set(source.uuid, mat);
  return mat;
}

/* Convert every lit mesh in a tree to stepped toon shading. */
export function toonify(root) {
  const cache = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => convertMaterial(m, cache));
    } else {
      obj.material = convertMaterial(obj.material, cache);
    }
  });
}

/* Inverted-hull ink lines. The normals are pushed in view space so the
   line stays even on long limbs, rocks, and towers. */
const OUTLINE_VERT = `
  uniform float uThickness;
  void main() {
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    mv.xyz += n * uThickness;
    gl_Position = projectionMatrix * mv;
  }
`;
const OUTLINE_FRAG = `
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

const outlineMaterials = new Map();

function outlineMaterial(thickness, color) {
  const key = `${thickness}|${color}`;
  if (outlineMaterials.has(key)) return outlineMaterials.get(key);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) }
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    depthWrite: true,
    fog: false
  });
  outlineMaterials.set(key, mat);
  return mat;
}

export function addInkOutlines(root, opts = {}) {
  const thickness = opts.thickness ?? 0.025;
  const color = opts.color ?? 0x17151d;
  const minRadius = opts.minRadius ?? 0.09;
  const maxRadius = opts.maxRadius ?? Infinity;
  const mat = outlineMaterial(thickness, color);
  const targets = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.material) return;
    if (obj.userData.noOutline) return;
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!m || m.isSpriteMaterial || m.isShaderMaterial) return;
    if (m.transparent && m.opacity < 0.65) return;
    if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
    const r = obj.geometry.boundingSphere?.radius ?? 0;
    if (r < minRadius || r > maxRadius) return;
    targets.push(obj);
  });
  for (const obj of targets) {
    const hull = new THREE.Mesh(obj.geometry, mat);
    hull.renderOrder = -1;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.userData.isOutline = true;
    obj.add(hull);
  }
}
