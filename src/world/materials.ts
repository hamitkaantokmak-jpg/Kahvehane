/**
 * Paylaşılan çizgi film materyalleri: toon gölgeleme + ters-kabuk (inverted hull) dış hat.
 * Materyaller renk anahtarıyla önbelleğe alınır (materyal paylaşımı → daha az shader/state değişimi).
 */
import * as THREE from 'three';

let gradientMap: THREE.DataTexture | null = null;
function getGradient(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();
export function toonMat(color: THREE.ColorRepresentation, opts: { map?: THREE.Texture; emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.map?.uuid ?? ''}|${opts.emissive ?? 0}|${opts.opacity ?? 1}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: getGradient(), map: opts.map ?? null });
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity ?? 1; }
    toonCache.set(key, m);
  }
  return m;
}

const outlineCache = new Map<number, THREE.ShaderMaterial>();
export function outlineMat(thickness = 0.018): THREE.ShaderMaterial {
  let m = outlineCache.get(thickness);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(0x2a1a10) } },
      vertexShader: /* glsl */ `
        uniform float thickness;
        void main() {
          vec3 transformed = position;
          vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          mv.xyz += n * thickness;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        void main() { gl_FragColor = vec4(color, 1.0); }`,
      side: THREE.BackSide,
    });
    outlineCache.set(thickness, m);
  }
  return m;
}

export let OUTLINES_ENABLED = true;
export function setOutlinesEnabled(v: boolean) { OUTLINES_ENABLED = v; }

/** Toon mesh + isteğe bağlı dış hat (aynı geometriyi paylaşır). */
export function toonMesh(geom: THREE.BufferGeometry, color: THREE.ColorRepresentation, outline = 0.018, opts: Parameters<typeof toonMat>[1] = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, toonMat(color, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline > 0) {
    const o = new THREE.Mesh(geom, outlineMat(outline));
    o.name = 'outline';
    o.castShadow = false;
    o.receiveShadow = false;
    o.userData.isOutline = true;
    mesh.add(o);
  }
  return mesh;
}

export function applyOutlineVisibility(root: THREE.Object3D, visible: boolean) {
  root.traverse((o) => { if (o.userData.isOutline) o.visible = visible; });
}

// Geometri önbelleği (paylaşım)
const geoCache = new Map<string, THREE.BufferGeometry>();
export function sharedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g as T;
}

export const PALETTE = {
  wood: 0x9a5b2e,
  woodDark: 0x6b3a1c,
  woodLight: 0xc98a4b,
  felt: 0x2f8f4e,
  feltBlue: 0x2a6fb0,
  wall: 0xf2d39b,
  wallLow: 0x5f9e8f,
  floor: 0xb8774a,
  red: 0xd9412b,
  cream: 0xfff1d6,
  brass: 0xe0a83a,
  glass: 0xd8eef7,
  tea: 0xb0300c,
};
