import { setupScene } from './scene.js';
import { loadModel } from './loader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const { scene, camera, renderer, controls, updateExposure, updateLight, worldGroup, reticle } = setupScene();

let ui, btnClose, btnOpen;
let isAutoRotating = false;
let hitTestSource = null;
let hitTestSourceRequested = false;

let isInteracting = false;
let blockSelectUntil = 0;
let touchX = 0;
let initialDistance = 0;
let initialScale = 1;

async function init() {
    try {
        // 1. CARGAR UI Y ESPERAR A QUE ESTÉ LISTA
        const uiResponse = await fetch('ui.html');
        if (!uiResponse.ok) throw new Error('No se pudo cargar ui.html');
        const uiHtml = await uiResponse.text();
        
        const uiContainer = document.createElement('div');
        uiContainer.innerHTML = uiHtml;
        document.body.appendChild(uiContainer);

        // 2. ASIGNAR VARIABLES INMEDIATAMENTE DESPUÉS DE INYECTAR
        ui = document.getElementById('ui');
        btnClose = document.getElementById('close-menu');
        btnOpen = document.getElementById('open-menu');

        // Comprobación de seguridad para evitar el error de null
        if (ui && btnClose && btnOpen) {
            btnClose.onclick = () => { 
                ui.classList.add('hidden'); 
                btnOpen.style.display = 'block'; 
            };
            btnOpen.onclick = () => { 
                ui.classList.remove('hidden'); 
                btnOpen.style.display = 'none'; 
            };
        }

        // 3. ACTIVAR LÓGICA DE CONTROLES
        setupUIControls();

        // 4. CARGAR MODELOS
        const response = await fetch('meshes/list.json');
        const models = await response.json();
        const selector = document.getElementById('model-select');
        
        if (selector) {
            selector.innerHTML = '';
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.file; opt.textContent = m.name;
                selector.appendChild(opt);
            });
            selector.onchange = (e) => loadModel(worldGroup, `meshes/${e.target.value}`, controls);
            if (models.length > 0) loadModel(worldGroup, `meshes/${models[0].file}`, controls);
        }

    } catch (error) {
        console.error("Error en la inicialización:", error);
    }

    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));
    renderer.setAnimationLoop(render);
}

function setupUIControls() {
    // Pestañas
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(btn => {
        btn.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const pane = document.getElementById(targetId);
            if (pane) pane.classList.add('active');
        };
    });

    // Sliders con comprobación opcional (null-safe)
    const getEl = (id) => document.getElementById(id);
    
    getEl('exposure-slider')?.addEventListener('input', (e) => updateExposure(parseFloat(e.target.value)));
    getEl('model-rotation')?.addEventListener('input', (e) => worldGroup.rotation.y = parseFloat(e.target.value));
    getEl('auto-rotate')?.addEventListener('change', (e) => isAutoRotating = e.target.checked);
    
    const syncLight = () => {
        updateLight(
            parseFloat(getEl('light-angle').value || 0),
            parseFloat(getEl('light-intensity').value || 1),
            "#ffffff",
            parseFloat(getEl('shadow-opacity').value || 0.4)
        );
    };

    getEl('light-angle')?.addEventListener('input', syncLight);
    getEl('light-intensity')?.addEventListener('input', syncLight);
    getEl('shadow-opacity')?.addEventListener('input', syncLight);
}

// --- GESTIÓN TÁCTIL ---
window.addEventListener('touchstart', (e) => {
    if (e.target.closest('#ui') || e.target.closest('#open-menu')) return;
    if (renderer.xr.isPresenting) {
        if (e.touches.length === 1) { touchX = e.touches[0].pageX; isInteracting = false; }
        else if (e.touches.length === 2) {
            isInteracting = true;
            blockSelectUntil = Date.now() + 800;
            initialDistance = Math.hypot(e.touches[1].pageX - e.touches[0].pageX, e.touches[1].pageY - e.touches[0].pageY);
            initialScale = worldGroup.scale.x;
        }
    }
}, { passive: true });

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
}, { passive: true });

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

function render(timestamp, frame) {
    if (renderer.xr.isPresenting) {
        scene.background = null;
        if (ui) ui.style.display = 'none';
        if (btnOpen) btnOpen.style.display = 'none';
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
        if (ui) ui.style.display = 'block';
        if (btnOpen) btnOpen.style.display = (ui && ui.classList.contains('hidden')) ? 'block' : 'none';
        reticle.visible = false;
    }
    if (isAutoRotating) worldGroup.rotation.y += 0.01;
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();