'use client';

import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { AvatarDrive, AvatarStageProps } from './types';

/*
 * doctor.ai's doctor: Microsoft Rocketbox "Medical_Male_03" (MIT, see public/models/CREDITS.md),
 * a rigged human with his own face, stethoscope and viseme + ARKit blendshapes. All procedural:
 *   - skin shaded with a physical material (sheen + a little clearcoat), portrait lighting
 *   - arms relax out of the bind T-pose; the right arm waves when he's clicked
 *   - head and neck follow the pointer; eyes follow it too, with small saccades of their own
 *   - blinks (sometimes double), breathing, micro head motion, a soft resting smile
 *   - lip-sync: a viseme sequencer driven by a speech level (agent audio, or synthetic)
 *   - listening tilt, a thinking pose with hand to chin; drag to spin him, he springs back
 * Bones are posed with world-space rotations so the rig's local axes never matter.
 */

export const MODEL_URL = '/models/saathi-doctor.glb';

const damp = THREE.MathUtils.damp;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const pointer = { x: 0, y: 0 };
let pointerBound = false;
function bindPointer() {
  if (pointerBound || typeof window === 'undefined') return;
  pointerBound = true;
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true }
  );
}

/* ───────────── world-space bone helpers ───────────── */

const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Rotate a bone by a world-space rotation, keeping its children attached. */
function rotateWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(_pq);
  _pqi.copy(_pq).invert();
  bone.quaternion.premultiply(_pq).premultiply(q).premultiply(_pqi);
  bone.updateMatrixWorld(true);
}

/** Point a bone (toward its child joint) along a world direction. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3) {
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_b, dir.clone().normalize());
  rotateWorld(bone, _q);
}

/** Parent `obj` to `bone` so that it sits at world position `p` (bone at its current pose). */
function mountAt(bone: THREE.Object3D, obj: THREE.Object3D, p: THREE.Vector3) {
  const want = new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  const local = bone.matrixWorld.clone().invert().multiply(want);
  local.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
}

type Rig = {
  bones: Record<string, THREE.Bone>;
  rest: Map<THREE.Bone, THREE.Quaternion>;
  /** Blendshape name → every (influences array, index) that carries it (body, head, stethoscope). */
  morphs: Map<string, [number[], number][]>;
};

function buildRig(root: THREE.Object3D): Rig {
  const bones: Record<string, THREE.Bone> = {};
  const rest = new Map<THREE.Bone, THREE.Quaternion>();
  const morphs: Rig['morphs'] = new Map();
  root.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) {
      bones[b.name.replace(/[\s.:]/g, '_')] = b;
      rest.set(b, b.quaternion.clone());
    }
    const m = o as THREE.Mesh;
    if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences) {
      for (const [k, i] of Object.entries(m.morphTargetDictionary)) {
        const list = morphs.get(k) ?? [];
        list.push([m.morphTargetInfluences, i]);
        morphs.set(k, list);
      }
    }
  });
  return { bones, rest, morphs };
}

function setMorph(rig: Rig, name: string, v: number) {
  const list = rig.morphs.get(name);
  if (list) for (const [inf, i] of list) inf[i] = v;
}

/* ───────────── face ───────────── */

/** Visemes the lip-sync cycles through: [blendshape, max weight, how often it's picked]. */
const VISEMES: [string, number, number][] = [
  ['AA_VI_10_aa', 0.8, 3],
  ['AA_VI_11_E', 0.7, 2.4],
  ['AA_VI_13_O', 0.6, 1.4],
  ['AA_VI_14_U', 0.6, 0.9],
  ['AA_VI_01_PP', 0.85, 1.1],
  ['AA_VI_02_FF', 0.6, 0.9],
  ['AA_VI_04_DD', 0.55, 1.4],
  ['AA_VI_08_nn', 0.5, 1.1],
  ['AA_VI_00_Sil', 0.4, 0.5],
];
const PP = VISEMES.findIndex(([n]) => n === 'AA_VI_01_PP');
const VISEME_TOTAL = VISEMES.reduce((s, v) => s + v[2], 0);
function pickViseme(not: number) {
  for (;;) {
    let r = Math.random() * VISEME_TOTAL;
    let i = 0;
    while (r > VISEMES[i][2]) r -= VISEMES[i++][2];
    if (i !== not) return i;
  }
}

/** Skin that reads as skin: soft sheen for peach fuzz / scattering, a hint of moisture. */
function makeSkin(src: THREE.MeshStandardMaterial) {
  const skin = new THREE.MeshPhysicalMaterial({
    name: src.name,
    map: src.map,
    normalMap: src.normalMap,
    normalScale: src.normalScale.clone().multiplyScalar(0.8),
    color: new THREE.Color('#f3eeee'),
    roughness: 0.5,
    metalness: 0,
    sheen: 0.25,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ffd9c8'),
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.4,
  });
  // Teeth, gums and tongue share this texture (its lower-left corner). Nothing lights the
  // inside of a mouth, so darken them and drop the sheen/coat there, or they glow grey-white.
  skin.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float mouthCavity = step(vMapUv.x, 0.215) * step(0.59, vMapUv.y);
        diffuseColor.rgb *= 1.0 - 0.55 * mouthCavity;`
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.roughness = mix(material.roughness, 0.75, mouthCavity);
        #ifdef USE_SHEEN
          material.sheenColor *= 1.0 - mouthCavity;
        #endif
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1.0 - mouthCavity;
        #endif`
      );
  };
  return skin;
}

/** A plain white clinic ID card, matte. */
function makeBadge() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f7f7f4';
  c.fillRect(0, 0, 256, 160);
  c.fillStyle = '#1f6f68';
  c.fillRect(0, 0, 256, 34);
  c.fillStyle = '#ffffff';
  c.font = '600 22px Helvetica Neue, Helvetica, Arial, sans-serif';
  c.fillText('doctor.ai', 16, 25);
  c.fillStyle = '#c9d3d1';
  c.fillRect(16, 50, 64, 80);
  c.fillStyle = '#26302f';
  c.font = '600 22px Helvetica Neue, Helvetica, Arial, sans-serif';
  c.fillText('Physician', 94, 80, 150);
  c.fillStyle = '#6b7473';
  c.font = '500 17px Helvetica Neue, Helvetica, Arial, sans-serif';
  c.fillText('General Practice', 94, 108, 150);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.064, 0.04),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 })
  );
  badge.name = 'IDBadge';
  return badge;
}

/** Tiny catchlights in front of each eyeball so the eyes read as wet. */
function mountCatchlights(model: THREE.Object3D, B: Record<string, THREE.Bone>) {
  let head: THREE.SkinnedMesh | null = null;
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && /head/i.test((m.material as THREE.Material).name)) head = m;
  });
  const mesh = head as THREE.SkinnedMesh | null;
  if (!mesh) return;
  const pos = mesh.geometry.attributes.position;
  const si = mesh.geometry.attributes.skinIndex;
  const sw = mesh.geometry.attributes.skinWeight;
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.6,
    toneMapped: false,
  });
  for (const side of ['L', 'R'] as const) {
    const bone = B[`Bip01_${side}Eye`];
    if (!bone) continue;
    const bi = mesh.skeleton.bones.indexOf(bone);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      for (let k = 0; k < 4; k++) {
        if (si.getComponent(i, k) === bi && sw.getComponent(i, k) > 0.5) {
          mesh.getVertexPosition(i, v);
          box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
        }
      }
    }
    if (box.isEmpty()) continue;
    // Front of the eyeball, nudged up and toward the key light (viewer's left).
    const c = bone.getWorldPosition(new THREE.Vector3());
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 12, 8), mat);
    dot.name = 'Catchlight';
    mountAt(bone, dot, new THREE.Vector3(c.x - 0.0022, c.y + 0.0018, box.max.z + 0.0004));
  }
}

/* ───────────── the character ───────────── */

function Doctor({
  drive,
  onPoke,
  framing,
}: {
  drive: React.RefObject<AvatarDrive>;
  onPoke?: () => void;
  framing: 'hero' | 'call';
}) {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const turn = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  // Normalise to 1.8 units tall, feet on the floor, centred.
  const fit = useMemo(() => {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = 1.8 / (box.max.y - box.min.y || 1);
    return {
      s,
      offset: new THREE.Vector3(
        (-(box.max.x + box.min.x) / 2) * s,
        -box.min.y * s,
        (-(box.max.z + box.min.z) / 2) * s
      ),
    };
  }, [model]);

  const rig = useMemo(() => buildRig(model), [model]);

  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      if (!src.isMeshStandardMaterial) return;
      if (/head/i.test(src.name)) {
        m.material = makeSkin(src);
      } else {
        // Clone so the cached GLTF materials stay untouched.
        const mat = src.clone();
        mat.envMapIntensity = 0.7;
        mat.roughness = /stetoskop/i.test(src.name) ? 0.45 : 0.75;
        m.material = mat;
      }
    });
  }, [model]);

  useEffect(() => bindPointer(), []);

  const mounted = useRef(false);

  const st = useRef({
    hover: 0,
    hovered: false,
    level: 0,
    blinkNext: 1.2,
    blinkStart: -1,
    blinkDouble: false,
    sacNext: 1,
    sac: new THREE.Vector2(),
    gaze: new THREE.Vector2(),
    look: new THREE.Vector3(),
    smile: 0.12,
    browUp: 0,
    browDown: 0,
    squint: 0,
    vCur: 0,
    vPrev: 0,
    vStart: 0,
    vDur: 0.1,
    vis: VISEMES.map(() => 0),
    jaw: 0,
    spin: 0,
    dragging: false,
  });

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const d = drive.current;
    const mood = d?.mood ?? 'idle';
    const S = st.current;
    const B = rig.bones;

    // Back to the bind pose, then layer the pose on top.
    rig.rest.forEach((q, b) => b.quaternion.copy(q));
    model.updateMatrixWorld(true);

    // Once, at the bind pose: catchlights on the eyes and an ID card on the coat.
    if (!mounted.current && B.Bip01_Head) {
      mountCatchlights(model, B);
      const chestBone = B.Bip01_Spine2 ?? B.Bip01_Spine1;
      if (chestBone && B.Bip01_L_UpperArm) {
        const ch = new THREE.Vector3().setFromMatrixPosition(chestBone.matrixWorld);
        const lx = new THREE.Vector3().setFromMatrixPosition(B.Bip01_L_UpperArm.matrixWorld).x;
        const sideX = lx > ch.x ? 1 : -1;
        mountAt(
          chestBone,
          makeBadge(),
          new THREE.Vector3(ch.x + 0.125 * sideX, ch.y - 0.045, ch.z + 0.152)
        );
      }
      mounted.current = true;
    }

    S.hover = damp(S.hover, S.hovered ? 1 : 0, 6, dt);

    let target = 0;
    if (mood === 'speaking') {
      target = d?.synthetic
        ? Math.max(0, Math.sin(t * 11.3) * 0.5 + Math.sin(t * 6.7) * 0.35 + Math.sin(t * 2.1) * 0.3)
        : Math.min(1, (d?.level ?? 0) * 2.2);
    }
    S.level = damp(S.level, target, 18, dt);
    const L = S.level;

    // Breathing + weight shift.
    if (B.Bip01_Spine1)
      rotateWorld(B.Bip01_Spine1, _q.setFromAxisAngle(X_AXIS, Math.sin(t * 1.5) * 0.02));
    if (B.Bip01_Spine)
      rotateWorld(B.Bip01_Spine, _q.setFromAxisAngle(Z_AXIS, Math.sin(t * 0.55) * 0.015));

    // Arms: relaxed by default; right arm waves after a poke; left hand to chin when thinking.
    const waveT = d?.waveAt ? (performance.now() - d.waveAt) / 1000 : 99;
    const up = waveT < 2.4 ? Math.min(1, waveT * 4, (2.4 - waveT) * 4) : 0;
    const think = mood === 'thinking' ? 1 : 0;
    const sway = Math.sin(t * 1.5) * 0.02;
    const centreX = B.Bip01_Spine2 ? B.Bip01_Spine2.getWorldPosition(_b).x : 0;
    for (const side of ['L', 'R'] as const) {
      const ua = B[`Bip01_${side}_UpperArm`];
      const fa = B[`Bip01_${side}_Forearm`];
      const hd = B[`Bip01_${side}_Hand`];
      if (!ua || !fa || !hd) continue;
      const out = Math.sign(ua.getWorldPosition(_a).x - centreX) || 1;
      const relaxed = new THREE.Vector3(out * (0.2 + sway), -1, 0.06);
      const fore = new THREE.Vector3(out * 0.06, -1, 0.32);
      if (side === 'R' && up > 0) {
        aim(ua, fa, relaxed.lerp(new THREE.Vector3(out * 0.8, 0.8, 0.15), up));
        const swing = Math.sin(waveT * 14) * 0.45;
        aim(fa, hd, fore.lerp(new THREE.Vector3(out * swing, 1, 0.2), up));
      } else if (side === 'L' && think) {
        aim(ua, fa, new THREE.Vector3(out * 0.15, -0.6, 0.7));
        aim(fa, hd, new THREE.Vector3(-out * 0.35, 0.9, 0.25));
      } else {
        aim(ua, fa, relaxed);
        aim(fa, hd, fore);
      }
    }

    // Head + neck follow the pointer, with listening tilt / thinking glance / speaking nods,
    // plus slow, small noise so he's never perfectly still.
    let yaw = pointer.x * 0.5;
    let pitch = -pointer.y * 0.28;
    let roll = 0;
    if (mood === 'thinking') {
      yaw = 0.3;
      pitch = -0.22;
      roll = 0.07;
    } else if (mood === 'listening') roll = 0.08;
    yaw += (Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.83 + 1.3) * 0.4) * 0.026;
    pitch += (Math.sin(t * 0.43 + 2.1) * 0.6 + Math.sin(t * 1.07) * 0.4) * 0.02;
    roll += Math.sin(t * 0.27 + 0.7) * 0.015;
    pitch += Math.sin(t * 7) * L * 0.035;
    S.look.x = damp(S.look.x, pitch, 5, dt);
    S.look.y = damp(S.look.y, yaw, 5, dt);
    S.look.z = damp(S.look.z, roll, 4, dt);
    const lookQ = (w: number) =>
      _q.setFromEuler(_e.set(-S.look.x * w, S.look.y * w, -S.look.z * w, 'YXZ'));
    if (B.Bip01_Neck) rotateWorld(B.Bip01_Neck, lookQ(0.35));
    if (B.Bip01_Head) rotateWorld(B.Bip01_Head, lookQ(0.65));

    // Blinks: quick close, slower open; one in five is a double blink.
    let blink = 0;
    if (t > S.blinkNext && S.blinkStart < 0) {
      S.blinkStart = t;
      S.blinkDouble = Math.random() < 0.2;
    }
    if (S.blinkStart >= 0) {
      const end = S.blinkDouble ? 0.42 : 0.17;
      const bt = t - S.blinkStart;
      const one = (x: number) =>
        x < 0 || x > 0.17 ? 0 : x < 0.06 ? x / 0.06 : 1 - (x - 0.06) / 0.11;
      blink = Math.max(one(bt), S.blinkDouble ? one(bt - 0.25) : 0);
      if (bt >= end) {
        S.blinkStart = -1;
        S.blinkNext = t + 1.8 + Math.random() * 3.5;
      }
    }
    setMorph(rig, 'AK_09_EyeBlinkLeft', blink);
    setMorph(rig, 'AK_10_EyeBlinkRight', blink);

    // Gaze: follow the pointer, with small saccades the head doesn't follow.
    if (t > S.sacNext) {
      S.sac.set((Math.random() * 2 - 1) * 0.15, (Math.random() * 2 - 1) * 0.15);
      S.sacNext = t + 1 + Math.random() * 2;
    }
    const gx = (mood === 'thinking' ? 0.6 : pointer.x * 0.6) + S.sac.x;
    const gy = (mood === 'thinking' ? 0.6 : pointer.y * 0.6) + S.sac.y;
    S.gaze.x = damp(S.gaze.x, gx, 22, dt);
    S.gaze.y = damp(S.gaze.y, gy, 22, dt);
    const ex = S.gaze.x;
    const ey = S.gaze.y;
    setMorph(rig, 'AK_17_EyeLookUpLeft', Math.max(0, ey) * 0.5);
    setMorph(rig, 'AK_18_EyeLookUpRight', Math.max(0, ey) * 0.5);
    setMorph(rig, 'AK_11_EyeLookDownLeft', Math.max(0, -ey) * 0.5);
    setMorph(rig, 'AK_12_EyeLookDownRight', Math.max(0, -ey) * 0.5);
    setMorph(rig, 'AK_15_EyeLookOutLeft', Math.max(0, ex) * 0.5);
    setMorph(rig, 'AK_14_EyeLookInRight', Math.max(0, ex) * 0.5);
    setMorph(rig, 'AK_13_EyeLookInLeft', Math.max(0, -ex) * 0.5);
    setMorph(rig, 'AK_16_EyeLookOutRight', Math.max(0, -ex) * 0.5);
    for (const eye of [B.Bip01_LEye, B.Bip01_REye]) {
      if (eye) rotateWorld(eye, _q.setFromEuler(_e.set(-ey * 0.08, ex * 0.1, 0, 'YXZ')));
    }

    // Expression baseline, always eased so nothing pops.
    const listening = mood === 'listening';
    S.smile = damp(S.smile, 0.12 + (listening || up > 0 ? 0.23 : 0) + S.hover * 0.15, 6, dt);
    S.browUp = damp(S.browUp, (listening ? 0.1 : 0) + L * 0.12 + S.hover * 0.08, 8, dt);
    S.browDown = damp(S.browDown, think * 0.3, 6, dt);
    S.squint = damp(S.squint, think * 0.15 + S.smile * 0.25, 6, dt);
    setMorph(rig, 'AK_44_MouthSmileLeft', S.smile);
    setMorph(rig, 'AK_45_MouthSmileRight', S.smile);
    setMorph(rig, 'AK_03_BrowInnerUp', S.browUp);
    setMorph(rig, 'AK_04_BrowOuterUpLeft', S.browUp * 0.5);
    setMorph(rig, 'AK_05_BrowOuterUpRight', S.browUp * 0.5);
    setMorph(rig, 'AK_01_BrowDownLeft', S.browDown);
    setMorph(rig, 'AK_02_BrowDownRight', S.browDown);
    setMorph(rig, 'AK_19_EyeSquintLeft', S.squint + blink * 0.15);
    setMorph(rig, 'AK_20_EyeSquintRight', S.squint + blink * 0.15);

    // Lip-sync: step through visemes at 8–11 per second, crossfading ~75 ms between them.
    const speaking = L > 0.04;
    if (speaking && t >= S.vStart + S.vDur) {
      S.vPrev = S.vCur;
      S.vCur = pickViseme(S.vCur);
      S.vStart = t;
      S.vDur = 1 / (8 + Math.random() * 3);
    }
    const xf = Math.min(1, (t - S.vStart) / 0.075);
    // Quiet speech still articulates; loud speech opens up.
    const amp = speaking ? Math.min(1, 0.3 + L * 1.5) : 0;
    VISEMES.forEach(([name, max], i) => {
      let w = i === S.vCur ? xf : i === S.vPrev ? 1 - xf : 0;
      // Lips always meet on PP, however quiet the speech.
      w *= i === PP ? Math.min(1, 0.4 + amp) : amp;
      S.vis[i] = damp(S.vis[i], speaking ? w * max : 0, speaking ? 30 : 20, dt);
      setMorph(rig, name, Math.min(0.85, S.vis[i]));
    });
    S.jaw = damp(S.jaw, 0.45 * L * (1 - S.vis[PP] / 0.85), speaking ? 30 : 20, dt);
    setMorph(rig, 'AK_25_JawOpen', S.jaw);

    // Drag-to-spin with spring back.
    if (!S.dragging) S.spin = damp(S.spin, 0, 3, dt);
    if (turn.current) turn.current.rotation.y = S.spin;

    // Camera: eyes on the upper third, a touch of pointer parallax and a slow drift.
    const pcam = camera as THREE.PerspectiveCamera;
    if (pcam.fov !== 26) {
      pcam.fov = 26;
      pcam.updateProjectionMatrix();
    }
    const eye = B.Bip01_LEye ?? B.Bip01_Head;
    const eyeY = eye ? eye.getWorldPosition(_a).y : 1.65;
    const aspect = size.width / Math.max(1, size.height);
    const call = framing === 'call';
    const dist = call ? 1.15 : aspect < 0.9 ? 2.2 : 1.9;
    const half = dist * Math.tan(THREE.MathUtils.degToRad(13));
    const tgtY = eyeY - half / 3;
    const drift = (t / 8) * Math.PI * 2;
    camera.position.x = damp(camera.position.x, pointer.x * 0.05 + Math.sin(drift) * 0.01, 2, dt);
    camera.position.y = damp(
      camera.position.y,
      eyeY - 0.02 + pointer.y * 0.02 + Math.cos(drift) * 0.006,
      2,
      dt
    );
    camera.position.z = damp(camera.position.z, dist + Math.sin(drift * 0.5) * 0.01, 3, dt);
    camera.lookAt(0, tgtY, 0);
  });

  const drag = useRef<{ x: number; spin: number } | null>(null);

  return (
    <group
      ref={turn}
      onPointerOver={(e) => {
        e.stopPropagation();
        st.current.hovered = true;
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        st.current.hovered = false;
        document.body.style.cursor = '';
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        drag.current = { x: e.clientX, spin: st.current.spin };
        st.current.dragging = true;
        document.body.style.cursor = 'grabbing';
      }}
      onPointerMove={(e) => {
        if (drag.current)
          st.current.spin = drag.current.spin + (e.clientX - drag.current.x) * 0.012;
      }}
      onPointerUp={(e) => {
        const moved = drag.current ? Math.abs(e.clientX - drag.current.x) : 0;
        drag.current = null;
        st.current.dragging = false;
        document.body.style.cursor = st.current.hovered ? 'grab' : '';
        if (moved < 6) {
          if (drive.current) drive.current.waveAt = performance.now();
          onPoke?.();
        }
      }}
    >
      <primitive object={model} scale={fit.s} position={fit.offset} />
    </group>
  );
}

/** If the model fails to load, show nothing rather than taking the page down. */
class ModelBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function AvatarStage({
  drive,
  onPoke,
  framing = 'hero',
  className,
}: AvatarStageProps) {
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.05;
        }}
        camera={{ position: [0, 1.6, 3], fov: 26 }}
        eventPrefix="client"
      >
        {/* Portrait lighting: warm soft key upper-left, cool fill right, rim from behind. */}
        <ambientLight intensity={0.15} color="#fff8f2" />
        <directionalLight
          position={[-2.2, 2.4, 2.2]}
          intensity={3.2}
          color="#fff0e2"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-1}
          shadow-camera-right={1}
          shadow-camera-top={2.2}
          shadow-camera-bottom={0}
        />
        <directionalLight position={[2.6, 1.4, 2]} intensity={0.3} color="#dfe8ff" />
        <directionalLight position={[2, 1.5, -3]} intensity={0.5} color="#fff6ee" />
        <Environment resolution={256}>
          <Lightformer
            intensity={2.2}
            position={[-4, 2.2, 1.5]}
            scale={[4, 4, 1]}
            color="#ffe9d6"
          />
          <Lightformer intensity={0.25} position={[3, 1.5, 2]} scale={[3, 4, 1]} color="#dfe8ff" />
          <Lightformer intensity={0.6} position={[0, 1.6, -4]} scale={[6, 2, 1]} color="#ffffff" />
          <Lightformer
            intensity={0.35}
            position={[0, -2, 2]}
            rotation-x={Math.PI / 2}
            scale={[6, 3, 1]}
            color="#f3e2d4"
          />
        </Environment>
        <ModelBoundary>
          <Suspense fallback={null}>
            <Doctor drive={drive} onPoke={onPoke} framing={framing} />
          </Suspense>
        </ModelBoundary>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
