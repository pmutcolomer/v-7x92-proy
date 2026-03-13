import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export function setupScene() {
    const scene = new THREE.Scene();
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Iluminación Ambiental
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // Luz Direccional (Ajustada para no cortar sombras)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(3, 10, 3);
    dirLight.castShadow = true;

    // CONFIGURACIÓN CRÍTICA: Área de sombra muy amplia
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.0005;

    worldGroup.add(dirLight); // Ahora es hija del grupo móvil

    // Shadow Catcher (Suelo)
    const planeGeometry = new THREE.PlaneGeometry(100, 100);
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.4 });
    const shadowPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    worldGroup.add(shadowPlane); // Ahora es hija del grupo móvil

    dirLight.target = shadowPlane;

    // Retículo para AR
    const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const exrLoader = new EXRLoader();
    exrLoader.load('textures/skybox.exr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
    });

    const updateExposure = (value) => renderer.toneMappingExposure = value;

    const updateLight = (angle, intensity, color, shadowOpacity) => {
        const radius = 5;
        dirLight.position.x = Math.cos(angle) * radius;
        dirLight.position.z = Math.sin(angle) * radius;
        dirLight.intensity = intensity;
        dirLight.color.set(color);
        planeMaterial.opacity = shadowOpacity;
    };

    return { scene, camera, renderer, controls, updateExposure, updateLight, worldGroup, reticle, dirLight };
}