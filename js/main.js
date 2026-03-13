import { setupScene } from './scene.js';
import { loadModel } from './loader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const { scene, camera, renderer, controls, updateExposure, updateLight, worldGroup, reticle, dirLight } = setupScene();

// 1. UI Y BOTÓN AR
const uiElement = document.getElementById('ui');

document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: uiElement }
}));

// 2. INSTRUCCIONES PARA EL USUARIO
const instruction = document.createElement('div');
instruction.id = 'ar-instruction';
instruction.innerHTML = 'Mueve el móvil para detectar el suelo';
instruction.style.cssText = 'position:fixed; bottom:120px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:12px 24px; border-radius:30px; font-size:14px; display:none; z-index:9999; pointer-events:none; border: 1px solid #444;';
document.body.appendChild(instruction);

let hitTestSource = null;
let hitTestSourceRequested = false;
let isAutoRotating = false;
let isInteracting = false; // Bloquea el "salto" de posición si estamos rotando/escalando

// VARIABLES DE GESTOS
let touchX = 0;
let initialDistance = 0;
let initialScale = 1;

// 3. EVENTOS TÁCTILES (ROTACIÓN Y ESCALA)
window.addEventListener('touchstart', (e) => {
    // Ignorar si tocamos el menú
    if (e.target.closest('#ui') || e.target.closest('#toggle-ui')) return;
    
    if (renderer.xr.isPresenting) {
        isInteracting = false; 
        if (e.touches.length === 1) {
            touchX = e.touches[0].pageX;
        } else if (e.touches.length === 2) {
            initialDistance = Math.hypot(e.touches[1].pageX - e.touches[0].pageX, e.touches[1].pageY - e.touches[0].pageY);
            initialScale = worldGroup.scale.x;
            isInteracting = true; 
        }
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (e.target.closest('#ui') || e.target.closest('#toggle-ui')) return;

    if (renderer.xr.isPresenting) {
        isInteracting = true; // Si hay movimiento, marcamos como interacción activa
        
        if (e.touches.length === 1) {
            // Rotación
            const deltaX = e.touches[0].pageX - touchX;
            touchX = e.touches[0].pageX;
            worldGroup.rotation.y += deltaX * 0.007;
            document.getElementById('model-rotation').value = worldGroup.rotation.y % 6.28;
        } else if (e.touches.length === 2) {
            // Escala (Pinch)
            const currentDistance = Math.hypot(e.touches[1].pageX - e.touches[0].pageX, e.touches[1].pageY - e.touches[0].pageY);
            const newScale = initialScale * (currentDistance / initialDistance);
            worldGroup.scale.setScalar(newScale);
        }
    }
});

// 4. COLOCACIÓN EN EL MUNDO (SELECT)
const controller = renderer.xr.getController(0);
controller.addEventListener('select', () => {
    // Solo movemos el objeto si NO estamos rotando o escalando
    if (reticle.visible && renderer.xr.isPresenting && !isInteracting) {
        worldGroup.position.setFromMatrixPosition(reticle.matrix);
        
        // Orientar el modelo hacia la cámara (el usuario)
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        worldGroup.lookAt(camPos.x, worldGroup.position.y, camPos.z);
    }
    // Pequeño retardo para limpiar el estado después de soltar
    setTimeout(() => { isInteracting = false; }, 150);
});
scene.add(controller);

// 5. AJUSTE DINÁMICO DE PANTALLA
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 6. VINCULACIÓN DE INTERFAZ
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
        modelSelector.addEventListener('change', (e) => loadModel(worldGroup, `meshes/${e.target.value}`, controls));
        if (models.length > 0) loadModel(worldGroup, `meshes/${models[0].file}`, controls);
    } catch (error) { console.error("Error cargando modelos:", error); }
}

// 7. BUCLE DE ANIMACIÓN
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
                    instruction.style.display = 'none';
                    reticle.matrix.fromArray(results[0].getPose(referenceSpace).transform.matrix);
                } else {
                    reticle.visible = false;
                    instruction.style.display = 'block';
                }
            }
        }
        dirLight.target.updateMatrixWorld();
    } else {
        scene.background = scene.environment;
        reticle.visible = false;
        instruction.style.display = 'none';
    }

    if (isAutoRotating) {
        worldGroup.rotation.y += 0.01;
        modelRotationSlider.value = worldGroup.rotation.y % 6.28;
    }
    
    controls.update();
    renderer.render(scene, camera);
});

initApp();