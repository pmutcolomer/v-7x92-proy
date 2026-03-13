import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
let currentModel = null;

export function loadModel(container, path, controls) {
    if (currentModel) {
        container.remove(currentModel);
        currentModel.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.dispose) child.material.dispose();
            }
        });
    }

    loader.load(path, (gltf) => {
        currentModel = gltf.scene;
        
        currentModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // REPARACIÓN: Centrado y Pivot
        const box = new THREE.Box3().setFromObject(currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        currentModel.position.x = -center.x;
        currentModel.position.z = -center.z;
        currentModel.position.y = -box.min.y; 

        container.add(currentModel);

        if (controls) {
            // Hacemos que la cámara mire al centro del modelo
            controls.target.set(0, size.y / 2, 0);
            controls.update();
        }
    });
}