import { setupScene } from './scene.js';
import { loadModel } from './loader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const { scene, camera, renderer, controls, updateExposure, updateLight, worldGroup, reticle, dirLight } = setupScene();

document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.getElementById('ui') }
}));

let hitTestSource = null;
let hitTestSourceRequested = false;
let isAutoRotating = false;

// Rotación táctil
let touchX = 0;
window.addEventListener('touchstart', (e) => { if (renderer.xr.isPresenting) touchX = e.touches[0].pageX; });
window.addEventListener('touchmove', (e) => {
    if (renderer.xr.isPresenting && e.touches.length === 1 && e.target.tagName !== 'INPUT') {
        const deltaX = e.touches[0].pageX - touchX;
        touchX = e.touches[0].pageX;
        worldGroup.rotation.y += deltaX * 0.007;
    }
});

// Colocación AR
const controller = renderer.xr.getController(0);
controller.addEventListener('select', () => {
    if (reticle.visible && renderer.xr.isPresenting) {
        worldGroup.position.setFromMatrixPosition(reticle.matrix);
        worldGroup.position.y += 0.001;
    }
});
scene.add(controller);

// --- REPARACIÓN: Resize Automático ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// UI y Carga
const modelSelector = document.getElementById('model-select');
const modelRotationSlider = document.getElementById('model-rotation');
const autoRotateCheck = document.getElementById('auto-rotate');

document.querySelectorAll('#light-angle, #light-intensity, #light-color, #shadow-opacity').forEach(el => {
    el.addEventListener('input', () => {
        updateLight(
            parseFloat(document.getElementById('light-angle').value),
            parseFloat(document.getElementById('light-intensity').value),
            document.getElementById('light-color').value,
            parseFloat(document.getElementById('shadow-opacity').value)
        );
    });
});

modelRotationSlider.addEventListener('input', (e) => worldGroup.rotation.y = parseFloat(e.target.value));
autoRotateCheck.addEventListener('change', (e) => isAutoRotating = e.target.checked);
document.getElementById('exposure-slider').addEventListener('input', (e) => updateExposure(parseFloat(e.target.value)));

async function initApp() {
    try {
        const response = await fetch('meshes/list.json');
        const models = await response.json();
        modelSelector.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.file; opt.textContent = m.name;
            modelSelector.appendChild(opt);
        });
        
        modelSelector.addEventListener('change', (e) => {
            loadModel(worldGroup, `meshes/${e.target.value}`, controls);
        });
        
        if (models.length > 0) loadModel(worldGroup, `meshes/${models[0].file}`, controls);
    } catch (error) { console.error(error); }
}

renderer.setAnimationLoop((timestamp, frame) => {
    if (renderer.xr.isPresenting) {
        scene.background = null;
        if (frame) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            const session = renderer.xr.getSession();
            if (!hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then((viewerSpace) => {
                    session.requestHitTestSource({ space: viewerSpace }).then((source) => hitTestSource = source);
                });
                hitTestSourceRequested = true;
            }
            if (hitTestSource) {
                const results = frame.getHitTestResults(hitTestSource);
                if (results.length > 0) {
                    reticle.visible = true;
                    reticle.matrix.fromArray(results[0].getPose(referenceSpace).transform.matrix);
                } else { reticle.visible = false; }
            }
        }
        dirLight.target.updateMatrixWorld();
        dirLight.shadow.camera.updateProjectionMatrix();
    } else {
        scene.background = scene.environment;
        reticle.visible = false;
    }
    if (isAutoRotating) {
        worldGroup.rotation.y += 0.01;
        modelRotationSlider.value = worldGroup.rotation.y % 6.28;
    }
    controls.update();
    renderer.render(scene, camera);
});

initApp();