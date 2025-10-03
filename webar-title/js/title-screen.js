// title-screen.js
import { initThree, preloadVRM, createPlaceholder } from './three-vrm-loader.js';

const DATA_VRM = './assets/Aorin.vrm';
const DATA_USDZ = './assets/Aorin.usdz';

let scene, camera, renderer;
let vrmModel = null;
let vrmInstance = null;
let modelReady = false;

let rotateSpeed = 0.4 * Math.PI / 180;
let currentRotationY = 0;

const poses = [
  { name:'pose0', rotY: 0.0, headX: 0.0, scale: 1.0 },
  { name:'pose1', rotY: 0.2, headX: 0.12, scale: 1.02 },
  { name:'pose2', rotY: -0.15, headX: -0.08, scale: 0.98 },
  { name:'pose3', rotY: 0.45, headX: 0.06, scale: 1.05 }
];
let poseIndex = 0;
let poseTarget = null;
let poseStartTime = 0;
let poseTweenDuration = 600;

export async function startTitle() {
  const th = await initThree('three-wrap');
  scene = th.scene; camera = th.camera; renderer = th.renderer;

  // Preload model if available
  const vrmUrl = DATA_VRM;
  try {
    document.getElementById('dbgModel').textContent = 'checking...';
    const exists = await fetch(vrmUrl, { method:'HEAD' }).then(r => r.ok).catch(()=>false);
    if (exists) {
      document.getElementById('dbgModel').textContent = 'loading VRM...';
      const res = await preloadVRM(vrmUrl);
      vrmInstance = res.vrm;
      vrmModel = res.scene;
      vrmModel.scale.setScalar(1.0);
      vrmModel.position.set(0,0,0);
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

  // start pose cycle timer
  setNextPose();
  setInterval(()=> {
    setNextPose();
  }, 5000);

  // start render loop
  renderer.setAnimationLoop(render);
}

function setNextPose(){
  poseIndex = (poseIndex + 1) % poses.length;
  const p = poses[poseIndex];
  poseTarget = { rotY: p.rotY, scale: p.scale };
  poseStartTime = performance.now();
  document.getElementById('dbgPose').textContent = String(poseIndex);
}

function updatePoseTween(now){
  if (!poseTarget || !vrmModel) return;
  const t = Math.min(1, (now - poseStartTime) / poseTweenDuration);
  // lerp rotation and scale
  const targetY = poseTarget.rotY;
  const currentY = vrmModel.rotation.y;
  vrmModel.rotation.y = THREE.MathUtils.lerp(currentY, targetY, t * 0.1); // smooth small change
  const targetS = poseTarget.scale;
  const curS = vrmModel.scale.x;
  const s = THREE.MathUtils.lerp(curS, targetS, t * 0.06);
  vrmModel.scale.setScalar(s);
}

function render(time){
  // continuous slow rotation
  if (vrmModel) {
    vrmModel.rotation.y += rotateSpeed * 0.5; // slower
    updatePoseTween(time);
  }
  renderer.render(scene, camera);
}
