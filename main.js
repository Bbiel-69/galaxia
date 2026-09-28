import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  BlackHoleShader,
  CosmicBackgroundShader,
} from "./blackholeshader.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const bgMaterial = new THREE.ShaderMaterial({
  vertexShader: CosmicBackgroundShader.vertexShader,
  fragmentShader: CosmicBackgroundShader.fragmentShader,
  uniforms: CosmicBackgroundShader.uniforms,
  depthWrite: false,
});
const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMaterial);
const bgScene = new THREE.Scene();
const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
bgScene.add(bgMesh);

function createStars(count, size, range) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const starColors = [
    new THREE.Color(0x9bb0ff),
    new THREE.Color(0xffffff),
    new THREE.Color(0xfff4ea),
    new THREE.Color(0xffd2a1),
  ];

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * range;
    positions[i * 3 + 1] = (Math.random() - 0.5) * range;
    positions[i * 3 + 2] = (Math.random() - 0.5) * range;

    const color = starColors[Math.floor(Math.random() * starColors.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    }),
  );
}

const starsBackground = createStars(3000, 0.02, 30);
const starsForeground = createStars(1000, 0.05, 15);
scene.add(starsBackground, starsForeground);

const jetGeometry = new THREE.CylinderGeometry(0.01, 0.4, 6, 32, 1, true);
const jetMaterial = new THREE.MeshBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.4,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
const jetTop = new THREE.Mesh(jetGeometry, jetMaterial);
jetTop.position.y = 3;
const jetBottom = jetTop.clone();
jetBottom.position.y = -3;
jetBottom.rotation.z = Math.PI;
const jetGroup = new THREE.Group();
jetGroup.add(jetTop, jetBottom);
scene.add(jetGroup);

const composer = new EffectComposer(renderer);
const scenePass = new RenderPass(scene, camera);
scenePass.clear = false;
composer.addPass(scenePass);
composer.addPass(
  new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4,
    0.4,
    0.25,
  ),
);
composer.addPass(new ShaderPass(BlackHoleShader));

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  CosmicBackgroundShader.uniforms.resolution.value.set(width, height);
}

window.addEventListener("resize", resize);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  CosmicBackgroundShader.uniforms.time.value = elapsedTime;
  BlackHoleShader.uniforms.time.value = elapsedTime;
  starsBackground.rotation.y = elapsedTime * 0.01;
  starsForeground.rotation.y = elapsedTime * 0.02;
  jetGroup.rotation.y = elapsedTime * 0.5;

  renderer.autoClear = false;
  renderer.clear();
  renderer.render(bgScene, bgCamera);
  composer.render();
}

animate();
