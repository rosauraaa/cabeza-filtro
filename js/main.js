import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { sfx, unlockAudio } from "./sfx.js";

// Perillas de calibracion: si la mascara queda chica/grande o desplazada en algun telefono, ajustar aqui.
const MASK_SCALE = 1.0;       // 1.0 = el ancho de cara de MediaPipe (landmarks 234-454)
const SMOOTH = 0.55;          // 0 = sin suavizado, 1 = congelado
const MOUTH_TRIGGER = 0.5;    // jawOpen > 50 % dispara confeti
const BROWS_TRIGGER = 0.55;   // browInnerUp > 55 % lanza el gorro
const WINK_TRIGGER = 0.6;     // un ojo cerrado > 60 % y el otro abierto
const COOLDOWN = 0.9;         // segundos entre disparos del mismo gesto

const $ = (id) => document.getElementById(id);
const video = $("cam");
const canvas = $("gl");
const status = (t) => ($("status").textContent = t);

// ---------------------------------------------------------------- three.js
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
// camara ortografica en pixeles del video: x a la derecha, y hacia arriba, z hacia la camara
const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10000, 10000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(0.3, 0.6, 1);
scene.add(sun);

let W = 1, H = 1;
function resize() {
  W = video.videoWidth;
  H = video.videoHeight;
  renderer.setSize(W, H, false);
  Object.assign(camera, { left: 0, right: W, top: 0, bottom: -H });
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- mascara
const mask = new THREE.Group();
mask.visible = false;
scene.add(mask);
let cap, mixer, spinAction;
let faceMeshes = [];   // la cabeza tiene varios materiales -> three la parte en varias mallas
const morph = {};

async function loadMask() {
  const gltf = await new GLTFLoader().loadAsync("assets/models/mask.glb");
  mask.add(gltf.scene);
  cap = gltf.scene.getObjectByName("Cap");
  gltf.scene.getObjectByName("Head").traverse((o) => o.morphTargetDictionary && faceMeshes.push(o));
  Object.assign(morph, faceMeshes[0].morphTargetDictionary);
  mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip).play();
    if (clip.name === "PropellerSpin") spinAction = action;
  }
}

// ---------------------------------------------------------------- particulas (cubitos)
const particles = [];
const geo = new THREE.BoxGeometry(1, 1, 1);
const COLORS = ["#ff3b3b", "#2f80ff", "#ffc93c", "#4cd964", "#ff4fa3", "#ffffff"];
for (let i = 0; i < 150; i++) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.5 }));
  m.visible = false;
  scene.add(m);
  particles.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
}

function burst(origin, size, n, dir, spread, colors = COLORS) {
  let made = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.life = 0.9 + Math.random() * 0.5;
    p.m.visible = true;
    p.m.position.copy(origin);
    p.m.scale.setScalar(size * (0.6 + Math.random() * 0.6));
    p.m.material.color.set(colors[made % colors.length]);
    p.v.copy(dir).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.3) * spread, Math.random() * spread * 0.5));
    p.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    if (++made >= n) break;
  }
}

function updateParticles(dt, gravity) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.v.y -= gravity * dt;
    p.m.position.addScaledVector(p.v, dt);
    p.m.rotation.x += p.spin.x * dt;
    p.m.rotation.y += p.spin.y * dt;
    if (p.life < 0.3) p.m.scale.multiplyScalar(0.9);
    if (p.life <= 0) p.m.visible = false;
  }
}

// ---------------------------------------------------------------- gestos
const cooldown = { mouth: 0, brows: 0, wink: 0 };
let capJump = 0;  // segundos restantes del salto del gorro
const smooth = (a, b, x) => THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);

function chip(id) {
  const el = $(`chip-${id}`);
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 500);
}

const tmp = new THREE.Vector3();
function applyGestures(bs, faceW, dt) {
  const s = (name) => bs[name] ?? 0;
  const jaw = s("jawOpen");
  const brows = Math.max(s("browInnerUp"), (s("browOuterUpLeft") + s("browOuterUpRight")) / 2);
  const blinkL = s("eyeBlinkLeft"), blinkR = s("eyeBlinkRight");

  // gestos continuos -> shape keys hechos en Blender
  for (const { morphTargetInfluences: inf } of faceMeshes) {
    inf[morph.MouthOpen] = smooth(0.05, 0.55, jaw);
    inf[morph.BrowsUp] = smooth(0.15, 0.6, brows);
    inf[morph.BlinkL] = smooth(0.3, 0.6, blinkL);
    inf[morph.BlinkR] = smooth(0.3, 0.6, blinkR);
  }

  for (const k in cooldown) cooldown[k] -= dt;

  // boca abierta -> confeti de cubitos que sale de la boca
  if (jaw > MOUTH_TRIGGER && cooldown.mouth <= 0) {
    cooldown.mouth = COOLDOWN;
    mask.localToWorld(tmp.set(0, -0.45, 0.75));
    burst(tmp, faceW * 0.07, 40, new THREE.Vector3(0, faceW * 0.8, faceW * 1.5), faceW * 2.4);
    sfx.boing();
    chip("mouth");
  }

  // cejas arriba -> el gorro sale volando con la helice a toda velocidad
  if (brows > BROWS_TRIGGER && cooldown.brows <= 0 && capJump <= 0) {
    cooldown.brows = COOLDOWN;
    capJump = 1.0;
    sfx.whoosh();
    chip("brows");
  }

  // guino (un ojo cerrado y el otro abierto) -> estrellitas desde ese ojo
  const winkL = blinkL > WINK_TRIGGER && blinkR < 0.3;
  const winkR = blinkR > WINK_TRIGGER && blinkL < 0.3;
  if ((winkL || winkR) && cooldown.wink <= 0) {
    cooldown.wink = COOLDOWN;
    mask.localToWorld(tmp.set(winkL ? 0.3 : -0.3, 0.32, 0.75));
    burst(tmp, faceW * 0.05, 14, new THREE.Vector3(0, faceW * 1.2, faceW), faceW * 1.2, ["#ffc93c", "#ffffff"]);
    sfx.ding();
    chip("wink");
  }
}

function updateCap(dt) {
  // se suma DESPUES de mixer.update, que reescribe la posicion del gorro cada frame (CapBob)
  if (capJump <= 0) { spinAction.timeScale = 1; return; }
  capJump -= dt;
  const t = 1 - capJump;              // 0 -> 1
  cap.position.y += Math.sin(t * Math.PI) * 0.9;
  cap.rotation.y += t * Math.PI * 4;
  spinAction.timeScale = 5;
}

// ---------------------------------------------------------------- seguimiento facial
const target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 };
const rotM = new THREE.Matrix4();
const P = (lm, i, v = new THREE.Vector3()) => v.set(lm[i].x * W, -lm[i].y * H, -lm[i].z * W);
const L = new THREE.Vector3(), R = new THREE.Vector3(), sc = new THREE.Vector3(), pos = new THREE.Vector3();

function updatePose(res) {
  const lm = res.faceLandmarks[0];
  P(lm, 234, L);
  P(lm, 454, R);
  const faceW = L.distanceTo(R);
  target.pos.copy(L).add(R).multiplyScalar(0.5);
  rotM.fromArray(res.facialTransformationMatrixes[0].data).decompose(pos, target.quat, sc);
  target.scale = faceW * MASK_SCALE;

  if (!mask.visible) {   // primera deteccion: sin suavizado para que no "vuele" desde otra parte
    mask.position.copy(target.pos);
    mask.quaternion.copy(target.quat);
    mask.scale.setScalar(target.scale);
  } else {
    const k = 1 - SMOOTH;
    mask.position.lerp(target.pos, k);
    mask.quaternion.slerp(target.quat, k);
    mask.scale.setScalar(THREE.MathUtils.lerp(mask.scale.x, target.scale, k));
  }
  return faceW;
}

// ---------------------------------------------------------------- arranque
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  resize();
}

async function loadLandmarker() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
}

$("sound").addEventListener("click", (e) => {
  unlockAudio();
  e.currentTarget.hidden = true;
});
window.addEventListener("pointerdown", unlockAudio, { once: true });
video.addEventListener("resize", resize);

let landmarker;
try {
  status("Abriendo cámara…");
  await startCamera();
  status("Cargando detector facial y máscara…");
  [landmarker] = await Promise.all([loadLandmarker(), loadMask()]);
  $("loading").hidden = true;
} catch (err) {
  console.error(err);
  status(`No se pudo iniciar 😢 (${err.name || err.message}). Abre la página con HTTPS y permite la cámara.`);
  throw err;
}

const clock = new THREE.Clock();
let lastVideoTime = -1;
let faceW = 200;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const res = landmarker.detectForVideo(video, performance.now());
    const found = res.faceLandmarks.length > 0;
    if (found) {
      faceW = updatePose(res);
      const bs = Object.fromEntries(res.faceBlendshapes[0].categories.map((c) => [c.categoryName, c.score]));
      applyGestures(bs, faceW, dt);
    }
    mask.visible = found;
    $("hint").hidden = found;
  }
  mixer.update(dt);
  updateCap(dt);
  updateParticles(dt, faceW * 3);
  renderer.render(scene, camera);
});
