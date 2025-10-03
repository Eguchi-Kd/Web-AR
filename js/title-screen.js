// title-screen.js
import { initThree, preloadVRM, createPlaceholder } from './three-vrm-loader.js';

// File paths (relative)
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

let rotateSpeed = 0.0025; // rad per ms approx -> tuned for mobile
const poses = []; // loaded pose JSONs
let poseIndex = 0;
let lastPoseSwitch = 0;
const POSE_INTERVAL = 5000; // 5 seconds

export async function startTitle() {
  const th = await initThree('three-wrap');
  scene = th.scene; camera = th.camera; renderer = th.renderer;

  // Preload VRM model
  const vrmUrl = DATA_VRM;
  try {
    document.getElementById('dbgModel').textContent = 'checking...';
    const exists = await fetch(vrmUrl, { method:'HEAD' }).then(r => r.ok).catch(()=>false);
    if (exists) {
      document.getElementById('dbgModel').textContent = 'loading VRM...';
      const res = await preloadVRM(vrmUrl);
      vrmInstance = res.vrm;
      vrmModel = res.scene;
      // Tune scale & position for smartphone portrait view
      vrmModel.scale.setScalar(1.0);
      vrmModel.position.set(0, 0, 0);
      scene.add(vrmModel);
      modelReady = true;
      document.getElementById('dbgModel').textContent = 'VRM loaded';
    } else {
      document.getElementById('dbgModel').textContent = 'VRM not found, using placeholder';
      const ph = createPlaceholder();
      scene.add(ph);
      vrmModel = ph;
      modelReady = true;
    }
  } catch(e){
    console.error(e);
    document.getElementById('dbgModel').textContent = 'load error, placeholder';
    const ph = createPlaceholder();
    scene.add(ph);
    vrmModel = ph;
    modelReady = true;
    document.getElementById('dbgMsg').textContent = String(e).slice(0,200);
  }

  // preload pose files
  await loadPoses();

  // initialize pose timing
  lastPoseSwitch = performance.now();
  poseIndex = -1;
  switchToNextPose();

  // start render loop
  renderer.setAnimationLoop(render);
}

async function loadPoses() {
  // load JSON pose definitions; skip missing files
  for (let i = 0; i < POSE_FILES.length; i++) {
    try {
      const r = await fetch(POSE_FILES[i]);
      if (!r.ok) { console.warn('Pose file not found:', POSE_FILES[i]); continue; }
      const j = await r.json();
      poses.push(j.pose || j);
      console.log('Loaded pose', POSE_FILES[i]);
    } catch(e) {
      console.warn('Failed loading pose', POSE_FILES[i], e);
    }
  }
  if (poses.length === 0) {
    console.warn('No poses loaded. Using idle pose only.');
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
  // poseObj maps bone keys (like rightUpperLeg) to { rotation: [x,y,z,w] }
  if (!vrmInstance || !vrmInstance.humanoid) return;
  const humanoid = vrmInstance.humanoid;
  for (const boneKey in poseObj) {
    try {
      const data = poseObj[boneKey];
      if (!data || !data.rotation) continue;
      // try to get bone node; first attempt humanoid.getBoneNode with the key
      let node = null;
      try {
        if (typeof humanoid.getBoneNode === 'function') {
          node = humanoid.getBoneNode(boneKey);
        }
      } catch(e) {
        // ignore
      }
      // fallback: search by common node name in scene
      if (!node) {
        node = vrmInstance.scene.getObjectByName(boneKey) || vrmInstance.scene.getObjectByProperty('name', boneKey);
      }
      if (!node) {
        // sometimes bone keys are LowerCamelCase for VRM schema; try common humanoid mapping
        const alt = boneKey.charAt(0).toUpperCase() + boneKey.slice(1);
        try {
          node = humanoid.getBoneNode ? humanoid.getBoneNode(alt) : null;
        } catch(e){}
      }
      if (!node) {
        continue;
      }
      const q = data.rotation;
      if (Array.isArray(q) && q.length >= 4) {
        node.quaternion.set(q[0], q[1], q[2], q[3]);
      }
    } catch(e) {
      console.warn('applyPose error on bone', boneKey, e);
    }
  }
}

function render(time) {
  // rotate model slowly around Y for idle motion
  if (vrmModel) {
    // rotation amount scaled
    vrmModel.rotation.y += rotateSpeed * 16;
  }
  // handle pose switching every POSE_INTERVAL ms
  if (performance.now() - lastPoseSwitch > POSE_INTERVAL) {
    switchToNextPose();
  }
  renderer.render(scene, camera);
}
