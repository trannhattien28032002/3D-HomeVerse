import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

export type SceneBundle = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
};

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
    const scene = new THREE.Scene();
    scene.add(new THREE.AxesHelper(5));
    // 50m extent, 100 divisions → 0.5m per cell.
    // A standard double bed (1.4m × 2m) occupies ~3×4 cells; a room (5m × 4m) is 10×8 cells.
    // This does not affect world units, snapping, or dimensions — purely visual density.
    scene.add(new THREE.GridHelper(50, 100, 0xb0a090, 0xd0c8bc));
    // Fog pulled back so it doesn't clip rooms at 20m; still softens the background.
    scene.fog = new THREE.Fog(0xf0f0f0, 40, 80);
    scene.background = new THREE.Color(0xf0f0f0);

    // FOV 45° matches architectural visualization convention (≈50mm lens on full-frame).
    // 75° (Three.js default) is a game-camera setting that makes rooms read as toy-scale.
    // Camera pulled back proportionally so the same scene fits at the narrower angle.
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 12, 16);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x202030, 1);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    new EXRLoader()
        .setPath("/hdri")
        .load("/studio.exr", (texture) => {
            const envMap = pmrem.fromEquirectangular(texture).texture;
            scene.environment = envMap;
            scene.background = envMap;
            texture.dispose();
        });

    return { scene, camera, renderer };
}
