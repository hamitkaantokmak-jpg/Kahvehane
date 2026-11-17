/**
 * Çizim çağrısı optimizasyonu: aynı materyali paylaşan statik mesh'leri tek mesh'te birleştirir.
 * - mergeStatic: dünya dekoru (dinamik / engel olarak işaretli alt ağaçlar hariç)
 * - mergeJointChildren: karakterlerde aynı eklemde birlikte hareket eden parçalar
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function normalized(geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const keep = ['position', 'normal', 'uv'];
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  g = g.applyMatrix4(m);
  return g;
}

/**
 * Verilen mesh'leri materyale göre birleştirip `target` altına ekler, orijinalleri sahneden çıkarır.
 * Dönüş: oluşturulan mesh sayısı.
 */
export function mergeInto(meshes: THREE.Mesh[], target: THREE.Object3D): number {
  target.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(target.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; outline: boolean; cast: boolean }>();
  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) continue;
    mesh.updateMatrixWorld(true);
    const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const outline = !!mesh.userData.isOutline;
    const key = `${mesh.material.uuid}|${outline}|${mesh.castShadow}`;
    let grp = groups.get(key);
    if (!grp) { grp = { mat: mesh.material, geos: [], outline, cast: mesh.castShadow }; groups.set(key, grp); }
    grp.geos.push(normalized(mesh.geometry, rel));
  }
  for (const mesh of meshes) mesh.parent?.remove(mesh);
  let created = 0;
  for (const grp of groups.values()) {
    const geo = mergeGeometries(grp.geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, grp.mat);
    m.castShadow = grp.cast && !grp.outline;
    m.receiveShadow = !grp.outline;
    m.userData.isOutline = grp.outline;
    m.userData.merged = true;
    target.add(m);
    created++;
  }
  return created;
}

const skipSubtree = (o: THREE.Object3D) => !!(o.userData.dynamic || o.userData.occluder);

/** Dünyadaki statik dekoru birleştir. Duvar mesh'leri (kamera çarpışması için) korunur. */
export function mergeStatic(root: THREE.Group): { before: number; after: number } {
  const meshes: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (skipSubtree(c) || c.userData.wall || c.userData.keep) continue;
      if ((c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh && !c.userData.wall && !c.userData.keep) meshes.push(c as THREE.Mesh);
      walk(c);
    }
  };
  walk(root);
  const before = meshes.length;
  const after = mergeInto(meshes, root);
  // engel grupları kendi içinde birleşsin (saydamlaştırma grup bazında)
  root.traverse((o) => {
    if (!(o.userData.occluder || o.userData.mergeInside) || o.userData.mergedOccluder) return;
    o.userData.mergedOccluder = true;
    const list: THREE.Mesh[] = [];
    o.traverse((x) => { if ((x as THREE.Mesh).isMesh) list.push(x as THREE.Mesh); });
    mergeInto(list, o);
  });
  return { before, after };
}

/** Bir hiyerarşideki her grubun doğrudan mesh çocuklarını (ve dış hatlarını) birleştir. */
export function mergeJointChildren(root: THREE.Object3D): number {
  let created = 0;
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) groups.push(o); });
  for (const g of groups) {
    const direct = g.children.filter((c) => (c as THREE.Mesh).isMesh && !c.userData.keep) as THREE.Mesh[];
    if (direct.length < 2) continue;
    const all: THREE.Mesh[] = [];
    for (const m of direct) {
      all.push(m);
      for (const ch of m.children) if ((ch as THREE.Mesh).isMesh) all.push(ch as THREE.Mesh);
    }
    created += mergeInto(all, g);
  }
  return created;
}
