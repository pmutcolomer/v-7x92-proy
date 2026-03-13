import { setupScene } from './scene.js';
import { loadModel } from './loader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const { scene, camera, renderer, controls, updateExposure, updateLight, worldGroup, reticle, dirLight } = setupScene();

const uiElement = document.getElementById('ui');

// DESACTIVAMOS domOverlay para evitar la pantalla negra
document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test']
}));

let hitTestSource = null;
let hitTestSourceRequested = false;
let isAutoRotating = false;

// VARIABLES DE CONTROL
let isInteracting = false;
let blockSelectUntil = 0;
let touchX = 0;
let initialDistance = 0;
let initialScale = 1;

// GESTIÓN DE TOQUES (Solo rotación y escala en AR)
window.addEventListener('touchstart', (e) => {
    if (e.target.closest('#ui')) return;
    if (renderer.xr.isPresenting) {
        if (e.touches.length === 1) {
            touchX = e.touches[0].pageX;
            isInteracting = false;
        } else if (e.touches.length === 2) {
            isInteracting = true;
            blockSelectUntil = Date.now() + 800;
            initialDistance = Math.hypot(e.touches[1].pageX - e.touches[0].pageX, e.touches[1].pageY - e.touches[0].pageY);
            initialScale = worldGroup.scale.x;
        }
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (e.target.closest('#ui')) return;
    if (renderer.xr.isPresenting) {
        isInteracting = true;
        blockSelectUntil = Date.now() + 800;
        if (e.touches.length === 1) {
            const deltaX = e.touches[0].pageX - touchX;
            touchX = e.touches[0].pageX;
            worldGroup.rotation.y += deltaX * 0.007;
        } else if (e.touches.length === 2) {
            const currentDistance = Math.hypot(e.touches[1].pageX - e.touches[0].pageX, e.touches[1].pageY - e.touches[0].pageY);
            worldGroup.scale.setScalar(initialScale * (currentDistance / initialDistance));
        }
    }
}, { passive: false });

const controller = renderer.xr.getController(0);
controller.addEventListener('select', () => {
    const now = Date.now();
    if (reticle.visible && renderer.xr.isPresenting && now > blockSelectUntil) {
        worldGroup.position.setFromMatrixPosition(reticle.matrix);
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        worldGroup.lookAt(camPos.x, worldGroup.position.y, camPos.z);
    }
});
scene.add(controller);

// VINCULACIÓN DE SLIDERS (Escritorio)
const syncLight = () => {
    updateLight(
        parseFloat(document.getElementById('light-angle').value),
        parseFloat(document.getElementById('light-intensity').value),
        "#ffffff",
        parseFloat(document.getElementById('shadow-opacity').value)
    );
};

document.getElementById('light-angle').addEventListener('input', syncLight);
document.getElementById('light-intensity').addEventListener('input', syncLight);
document.getElementById('shadow-opacity').addEventListener('input', syncLight);
document.getElementById('exposure-slider').addEventListener('input', (e) => updateExposure(parseFloat(e.target.value)));
document.getElementById('model-rotation').addEventListener('input', (e) => worldGroup.rotation.y = parseFloat(e.target.value));
document.getElementById('auto-rotate').addEventListener('change', (e) => isAutoRotating = e.target.checked);
document.getElementById('close-menu').onclick = () => uiElement.classList.toggle('hidden');

async function initApp() {
    try {
        const modelSelector = document.getElementById('model-select');
        const response = await fetch('meshes/list.json');
        const models = await response.json();
        modelSelector.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.file; opt.textContent = m.name;
            modelSelector.appendChild(opt);
        });
        modelSelector.onchange = (e) => loadModel(worldGroup, `meshes/${e.target.value}`, controls);
        if (models.length > 0) loadModel(worldGroup, `meshes/${models[0].file}`, controls);
    } catch (e) { console.error(e); }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((timestamp, frame) => {
    if (renderer.xr.isPresenting) {
        scene.background = null;
        uiElement.style.display = 'none'; // OCULTAR UI EN AR PARA EVITAR ERRORES
        if (frame) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            const session = renderer.xr.getSession();
            if (!hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then(s => {
                    session.requestHitTestSource({ space: s }).then(source => hitTestSource = source);
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
    } else {
        scene.background = scene.environment;
        uiElement.style.display = 'block'; // MOSTRAR UI AL SALIR
        reticle.visible = false;
    }
    if (isAutoRotating) worldGroup.rotation.y += 0.01;
    controls.update();
    renderer.render(scene, camera);
});

initApp();