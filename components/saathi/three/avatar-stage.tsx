'use client';

import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { AvatarDrive, AvatarStageProps } from './types';

/*
 * Saathi's doctor: Microsoft Rocketbox "Medical_Male_03" (MIT, see public/models/CREDITS.md),
 * a fully rigged character with ARKit + viseme blendshapes. Everything is procedural:
 *   - arms relax out of the bind T-pose; the right arm waves when he's clicked
 *   - head, neck and eyes follow the pointer anywhere on the page
 *   - real blinks, breathing, a smile on hover
 *   - lip-sync from a speech level (agent audio in a call, synthetic on the site)
 *   - listening tilt and a thinking pose; drag to spin him, he springs back
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
const _id = new THREE.Quaternion();

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

type Rig = {
  bones: Record<string, THREE.Bone>;
  rest: Map<THREE.Bone, THREE.Quaternion>;
  morphs: { mesh: THREE.Mesh; idx: [string, number][] }[];
};

function buildRig(root: THREE.Object3D): Rig {
  const bones: Record<string, THREE.Bone> = {};
  const rest = new Map<THREE.Bone, THREE.Quaternion>();
  const morphs: Rig['morphs'] = [];
  root.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) {
      bones[b.name.replace(/[\s.:]/g, '_')] = b;
      rest.set(b, b.quaternion.clone());
    }
    const m = o as THREE.Mesh;
    if (m.isMesh && m.morphTargetDictionary) {
      morphs.push({ mesh: m, idx: Object.entries(m.morphTargetDictionary) });
    }
  });
  return { bones, rest, morphs };
}

function setMorph(rig: Rig, re: RegExp, v: number) {
  for (const { mesh, idx } of rig.morphs) {
    const inf = mesh.morphTargetInfluences;
    if (!inf) continue;
    for (const [k, i] of idx) if (re.test(k)) inf[i] = v;
  }
}

/* ───────────── the AI head ───────────── */

const GLOW = '#9ef5e6';

/** Ceramic shell, dark glass face screen, glowing eyes, waveform mouth, ear pods and a halo. */
function makeAIHead() {
  const g = new THREE.Group();
  g.name = 'AIHead';
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: '#f3f5f4',
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffffff'),
  });
  const glow = new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false });

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.115, 64, 48), shellMat);
  shell.scale.set(0.9, 1.06, 0.98);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 64, 48),
    new THREE.MeshPhysicalMaterial({
      color: '#0c1615',
      roughness: 0.05,
      metalness: 0.3,
      clearcoat: 1,
    })
  );
  visor.scale.set(0.84, 0.64, 0.62);
  visor.position.set(0, 0.004, 0.06);

  const eyes = new THREE.Group();
  eyes.position.set(0, 0.016, 0.119);
  for (const x of [-0.029, 0.029]) {
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.012, 6, 16), glow);
    e.position.x = x;
    eyes.add(e);
  }
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.026, 0.117);
  const bars: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.012, 0.002), glow);
    b.position.x = (i - 3) * 0.0078;
    mouth.add(b);
    bars.push(b);
  }
  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 40), shellMat);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(sx * 0.1, 0, -0.005);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0024, 8, 48), glow);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(sx * 0.112, 0, -0.005);
    g.add(pod, ring);
  }
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.0016, 8, 120),
    new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.5, toneMapped: false })
  );
  halo.rotation.x = Math.PI / 2 - 0.22;
  halo.position.y = 0.035;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.12, 40),
    new THREE.MeshPhysicalMaterial({ color: '#2B3534', roughness: 0.35, clearcoat: 0.6 })
  );
  neck.position.y = -0.135;
  g.add(shell, visor, eyes, mouth, halo, neck);
  return { g, eyes, bars, halo, glow };
}

/** Holographic stethoscope and an "AI" badge, built around the chest in world space. */
function makeAIGear(neck: THREE.Vector3, chest: THREE.Vector3, sideX: number) {
  const g = new THREE.Group();
  g.name = 'AIGear';
  const glow = new THREE.MeshBasicMaterial({
    color: GLOW,
    toneMapped: false,
    transparent: true,
    opacity: 0.9,
  });
  const v = (x: number, y: number, z: number) =>
    new THREE.Vector3(neck.x + x, neck.y + y, neck.z + z);
  // Drapes over the collar (outside the coat) and down both lapels.
  const loop = new THREE.CatmullRomCurve3([
    v(0.075 * sideX, -0.4, 0.16),
    v(0.085 * sideX, -0.24, 0.155),
    v(0.09 * sideX, -0.1, 0.12),
    v(0.08 * sideX, -0.02, 0.05),
    v(0.05 * sideX, 0.02, -0.03),
    v(0, 0.035, -0.07),
    v(-0.05 * sideX, 0.02, -0.03),
    v(-0.08 * sideX, -0.02, 0.05),
    v(-0.09 * sideX, -0.1, 0.12),
    v(-0.085 * sideX, -0.24, 0.155),
    v(-0.08 * sideX, -0.33, 0.16),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(loop, 160, 0.0055, 10, false), glow));
  // Chest piece: a glowing ring that pulses like a heartbeat.
  const piece = new THREE.Group();
  piece.position.copy(v(0.075 * sideX, -0.43, 0.165));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.004, 12, 48), glow);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.022, 40),
    new THREE.MeshBasicMaterial({
      color: GLOW,
      toneMapped: false,
      transparent: true,
      opacity: 0.35,
    })
  );
  piece.add(ring, core);
  g.add(piece);
  // Ear tips on the other side.
  for (const dx of [-0.012, 0.012]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), glow);
    tip.position.copy(v(-0.08 * sideX + dx, -0.35, 0.165));
    g.add(tip);
  }
  // Badge over the pocket: a lit card reading "Saathi · AI".
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#0c1615';
  c.beginPath();
  c.roundRect(0, 0, 256, 128, 18);
  c.fill();
  c.strokeStyle = GLOW;
  c.lineWidth = 6;
  c.stroke();
  c.fillStyle = GLOW;
  c.font = '600 46px Helvetica Neue, Helvetica, Arial, sans-serif';
  c.fillText('Saathi', 26, 62);
  c.font = '500 30px Helvetica Neue, Helvetica, Arial, sans-serif';
  c.globalAlpha = 0.8;
  c.fillText('AI DOCTOR', 26, 104);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.096, 0.05),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true })
  );
  badge.position.set(chest.x + 0.134 * sideX, chest.y - 0.056, chest.z + 0.168);
  g.add(badge);
  return { g, piece, glow };
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
      m.frustumCulled = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const s = mat as THREE.MeshStandardMaterial;
        if (s.isMeshStandardMaterial) s.envMapIntensity = 0.8;
        // The human head is replaced by Saathi's AI head.
        if (/head|stetoskop|stethoscope/i.test(mat.name)) mat.visible = false;
      }
    });
  }, [model]);

  useEffect(() => bindPointer(), []);

  const ai = useMemo(() => makeAIHead(), []);
  const attached = useRef(false);
  const gear = useRef<ReturnType<typeof makeAIGear> | null>(null);

  const st = useRef({
    hover: 0,
    hovered: false,
    level: 0,
    blinkNext: 1.2,
    blinkStart: -1,
    look: new THREE.Vector3(),
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

    // Mount the AI head on the head bone once, upright in world space at the bind pose.
    if (!attached.current && B.Bip01_Head) {
      const hb = B.Bip01_Head;
      const p = new THREE.Vector3().setFromMatrixPosition(hb.matrixWorld);
      const want = new THREE.Matrix4().compose(
        p.add(new THREE.Vector3(0, 0.085, 0.012)),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      const local = hb.matrixWorld.clone().invert().multiply(want);
      local.decompose(ai.g.position, ai.g.quaternion, ai.g.scale);
      hb.add(ai.g);
      // Gear rides on the chest bone.
      const chestBone = B.Bip01_Spine2 ?? B.Bip01_Spine1;
      if (chestBone && B.Bip01_Neck && B.Bip01_L_UpperArm) {
        const n = new THREE.Vector3().setFromMatrixPosition(B.Bip01_Neck.matrixWorld);
        const ch = new THREE.Vector3().setFromMatrixPosition(chestBone.matrixWorld);
        const lx = new THREE.Vector3().setFromMatrixPosition(B.Bip01_L_UpperArm.matrixWorld).x;
        // Chest piece hangs on the viewer's right, like the original.
        const sideX = lx > ch.x ? 1 : -1;
        const made = makeAIGear(n, ch, sideX);
        const inv = chestBone.matrixWorld.clone().invert();
        inv.decompose(made.g.position, made.g.quaternion, made.g.scale);
        chestBone.add(made.g);
        gear.current = made;
      }
      attached.current = true;
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

    // Head + neck follow the pointer, with listening tilt / thinking glance / speaking nods.
    let yaw = pointer.x * 0.5;
    let pitch = -pointer.y * 0.28;
    let roll = 0;
    if (mood === 'thinking') {
      yaw = 0.3;
      pitch = -0.22;
      roll = 0.07;
    } else if (mood === 'listening') roll = 0.09;
    pitch += Math.sin(t * 7) * L * 0.04;
    S.look.x = damp(S.look.x, pitch, 5, dt);
    S.look.y = damp(S.look.y, yaw, 5, dt);
    S.look.z = damp(S.look.z, roll, 4, dt);
    const lookQ = (w: number) =>
      _q.setFromEuler(new THREE.Euler(-S.look.x * w, S.look.y * w, -S.look.z * w, 'YXZ'));
    if (B.Bip01_Neck) rotateWorld(B.Bip01_Neck, lookQ(0.35));
    if (B.Bip01_Head) rotateWorld(B.Bip01_Head, lookQ(0.65));

    // Face.
    let blink = 0;
    if (t > S.blinkNext && S.blinkStart < 0) S.blinkStart = t;
    if (S.blinkStart >= 0) {
      const p = (t - S.blinkStart) / 0.16;
      blink = p >= 1 ? 0 : Math.sin(p * Math.PI);
      if (p >= 1) {
        S.blinkStart = -1;
        S.blinkNext = t + 1.8 + Math.random() * 3.5;
      }
    }
    setMorph(rig, /EyeBlink/, blink);
    {
      const gx0 = mood === 'thinking' ? 0.6 : pointer.x;
      const gy0 = mood === 'thinking' ? 0.6 : pointer.y;
      ai.eyes.scale.y = Math.max(0.12, 1 - blink) * (1 - S.hover * 0.35);
      ai.eyes.position.x = damp(ai.eyes.position.x, gx0 * 0.012, 8, dt);
      ai.eyes.position.y = damp(ai.eyes.position.y, 0.016 + gy0 * 0.008, 8, dt);
      ai.bars.forEach((b, i) => {
        const wave = Math.abs(Math.sin(t * 13 + i * 1.2)) * (1 - Math.abs(i - 3) / 4.5);
        b.scale.y = damp(b.scale.y, 0.35 + L * 3.2 * wave + S.hover * 0.25, 20, dt);
      });
      ai.halo.rotation.z += dt * (0.35 + L * 1.5);
      const k = 1 + L * 0.6 + S.hover * 0.25;
      ai.glow.color.set(GLOW).multiplyScalar(k);
      if (gear.current) {
        const beat = (t * 1.2) % 1;
        const pulse = Math.exp(-beat * 9) + 0.6 * Math.exp(-Math.abs(beat - 0.22) * 14);
        gear.current.piece.scale.setScalar(1 + pulse * 0.18);
        gear.current.glow.opacity = 0.7 + pulse * 0.3;
      }
    }
    setMorph(rig, /JawOpen/, L * 0.5);
    setMorph(rig, /AA_VI_10_aa/, L * 0.5);
    setMorph(rig, /AA_VI_13_O/, Math.max(0, Math.sin(t * 5.3)) * L * 0.35);
    setMorph(rig, /MouthSmile/, 0.2 + S.hover * 0.45 + (up > 0 ? 0.3 : 0));
    setMorph(
      rig,
      /Brow(InnerUp|OuterUp)/,
      (mood === 'listening' ? 0.25 : 0) + L * 0.25 + S.hover * 0.2
    );
    setMorph(rig, /BrowDown/, think * 0.4);
    const gx = mood === 'thinking' ? 0.6 : pointer.x;
    const gy = mood === 'thinking' ? 0.6 : pointer.y;
    setMorph(rig, /EyeLookUp/, Math.max(0, gy) * 0.6);
    setMorph(rig, /EyeLookDown/, Math.max(0, -gy) * 0.6);
    setMorph(rig, /EyeLookOutLeft|EyeLookInRight/, Math.max(0, gx) * 0.6);
    setMorph(rig, /EyeLookInLeft|EyeLookOutRight/, Math.max(0, -gx) * 0.6);

    // Drag-to-spin with spring back.
    if (!S.dragging) S.spin = damp(S.spin, 0, 3, dt);
    if (turn.current) turn.current.rotation.y = S.spin;

    // Camera framing with a little parallax.
    const headY = B.Bip01_Head ? B.Bip01_Head.getWorldPosition(_a).y : 1.6;
    const aspect = size.width / Math.max(1, size.height);
    // Hero: a chest-up close-up so he fills the frame. Call: head and shoulders.
    const tgtY = framing === 'call' ? headY : headY - 0.28;
    const dist = framing === 'call' ? 1.1 : aspect < 0.9 ? 2.3 : 2.05;
    camera.position.x = damp(camera.position.x, pointer.x * 0.12, 2, dt);
    camera.position.y = damp(camera.position.y, tgtY + 0.05 + pointer.y * 0.05, 2, dt);
    camera.position.z = damp(camera.position.z, dist, 3, dt);
    camera.lookAt(0, tgtY, 0);
    void _id;
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
        camera={{ position: [0, 1.2, 3.7], fov: 28 }}
        eventPrefix="client"
      >
        <ambientLight intensity={0.85} />
        <directionalLight
          position={[-2.5, 4, 3.5]}
          intensity={1.8}
          color="#fff6ea"
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[3, 2, 2]} intensity={0.8} color="#e3ecff" />
        <directionalLight position={[0, 3, -4]} intensity={1.6} color="#ffffff" />
        <Environment resolution={256}>
          <Lightformer intensity={2.2} position={[-3, 3, 3]} scale={[4, 4, 1]} color="#ffffff" />
          <Lightformer intensity={0.9} position={[3, 1, 2]} scale={[3, 4, 1]} color="#e3eeff" />
          <Lightformer intensity={1.4} position={[0, 3, -4]} scale={[6, 2, 1]} color="#ffffff" />
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
