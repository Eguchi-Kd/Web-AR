// js/title-screen.js
import { initThree, preloadVRM, createPlaceholder } from './three-vrm-loader.js';

const DATA_VRM = './assets/Aorin.vrm';
const POSE_FILES = [
  './assets/pose1.json',
  './assets/pose2.json',
  './assets/pose3.json',
  './assets/pose4.json',
  './assets/pose5.json'
];

let scene, camera, renderer;
let vrmModel = null;
let vrmInstance = null;
let modelReady = false;

let rotateSpeed = 0.0025;
const poses = [];
let poseIndex = 0;
let lastPoseSwitch = 0;
const POSE_INTERVAL = 5000;

let _animationRunning = false;

export async function startTitle() {
  const th = await initThree('three-wrap');
  scene = th.scene; camera = th.camera; renderer = th.renderer;

  // Preload VRM model
  try {
    document.getElementById('dbgModel').textContent = 'loading VRM...';
    const res = await preloadVRM(DATA_VRM);
    vrmInstance = res.vrm;
    vrmModel = res.scene;
    vrmModel.scale.setScalar(1.0);
    vrmModel.position.set(0, 0, 0);
    scene.add(vrmModel);
    modelReady = true;
    document.getElementById('dbgModel').textContent = 'VRM loaded';
  } catch (e) {
    console.warn('VRM preload failed:', e);
    document.getElementById('dbgModel').textContent = 'VRM load failed, using placeholder';
    document.getElementById('dbgMsg').textContent = String(e).slice(0, 200);
    const ph = createPlaceholder();
    scene.add(ph);
    vrmModel = ph;
    modelReady = true;
  }

  // preload pose files
  await loadPoses();

  // initialize pose timing
  lastPoseSwitch = performance.now();
  poseIndex = -1;
  switchToNextPose();

  // start render loop
  _animationRunning = true;
  renderer.setAnimationLoop(render);
}

export function stopTitle() {
  // Stop the three.js animation loop
  try {
    if (renderer) {
      renderer.setAnimationLoop(null);
    }
  } catch (e) {
    console.warn('stopTitle: failed to stop animation loop', e);
  }
  _animationRunning = false;
  // Optionally remove canvas to allow new renderers to create their own
  try {
    const container = document.getElementById('three-wrap');
    if (container) {
      // remove child canvas elements
      const canvases = container.getElementsByTagName('canvas');
      for (let i = canvases.length - 1; i >= 0; i--) {
        canvases[i].remove();
      }
    }
  } catch(e) {
    console.warn('stopTitle cleanup error', e);
  }
}

async function loadPoses() {
  for (let i = 0; i < POSE_FILES.length; i++) {
    try {
      const r = await fetch(POSE_FILES[i]);
      if (!r.ok) { console.warn('Pose file not found:', POSE_FILES[i]); continue; }
      const j = await r.json();
      const poseObj = (j && j.pose) ? j.pose : j;
      poses.push(poseObj);
      console.log('Loaded pose', POSE_FILES[i]);
    } catch (e) {
      console.warn('Failed loading pose', POSE_FILES[i], e);
    }
  }
  if (poses.length === 0) {
    console.warn('No poses loaded. Using idle pose only.');
    document.getElementById('dbgMsg').textContent = 'No pose files found';
  } else {
    document.getElementById('dbgMsg').textContent = `Loaded ${poses.length} pose(s)`;
  }
}

function switchToNextPose() {
  if (poses.length === 0) return;
  poseIndex = (poseIndex + 1) % poses.length;
  applyPose(poses[poseIndex]);
  document.getElementById('dbgPose').textContent = String(poseIndex);
  lastPoseSwitch = performance.now();
}

function applyPose(poseObj) {
  if (!vrmInstance || !vrmInstance.humanoid) return;
  const humanoid = vrmInstance.humanoid;
  for (const boneKey in poseObj) {
    try {
      const data = poseObj[boneKey];
      if (!data || !data.rotation) continue;
      let node = null;
      try {
        if (typeof humanoid.getBoneNode === 'function') {
          node = humanoid.getBoneNode(boneKey);
        }
      } catch (e) {}
      if (!node) {
        node = vrmInstance.scene.getObjectByName(boneKey) || vrmInstance.scene.getObjectByProperty('name', boneKey);
      }
      if (!node) {
        const alt = boneKey.charAt(0).toUpperCase() + boneKey.slice(1);
        try { node = humanoid.getBoneNode ? humanoid.getBoneNode(alt) : null; } catch(e){ node = null; }
      }
      if (!node) continue;
      const q = data.rotation;
      if (Array.isArray(q) && q.length >= 4) {
        node.quaternion.set(q[0], q[1], q[2], q[3]);
      }
    } catch (e) {
      console.warn('applyPose error on bone', boneKey, e);
    }
  }
}

function render(time) {
  if (!_animationRunning) return;
  if (vrmModel) {
    vrmModel.rotation.y += rotateSpeed * 16;
  }
  if (performance.now() - lastPoseSwitch > POSE_INTERVAL) {
    switchToNextPose();
  }
  if (renderer) renderer.render(scene, camera);
}
