/**
 * sceneSetup — dựng nền tảng Three.js: Scene, Camera, Renderer.
 *
 * Bao gồm: lưới sàn (grid), trục toạ độ (axes), fog, tone mapping ACES, và nạp
 * HDRI studio.exr làm environment map cho phản chiếu PBR. Các lựa chọn (FOV 45°,
 * grid 0.5m/ô, fog) đều theo quy ước trực quan hoá kiến trúc — xem comment inline.
 */
import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

export type SceneBundle = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
};

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
    const scene = new THREE.Scene();
    const axesHelper = new THREE.AxesHelper(100);
    axesHelper.renderOrder = 2;
    scene.add(axesHelper);
    // Phủ 50m, 100 ô chia → 0.5m mỗi ô.
    // Giường đôi (1.4m × 2m) chiếm ~3×4 ô; một phòng (5m × 4m) là 10×8 ô.
    // Không ảnh hưởng world units, snapping hay dimension — chỉ là mật độ trực quan.
    const gridHelper = new THREE.GridHelper(50, 100, 0xb0a090, 0xd0c8bc);
    gridHelper.position.y = -0.001;
    gridHelper.renderOrder = 1;
    scene.add(gridHelper);
    // Fog kéo ra xa để không cắt phòng ở 20m; vẫn làm dịu hậu cảnh.
    scene.fog = new THREE.Fog(0xf0f0f0, 40, 80);
    scene.background = new THREE.Color(0xf0f0f0);

    // FOV 45° theo quy ước trực quan hoá kiến trúc (≈ống kính 50mm trên full-frame).
    // 75° (mặc định Three.js) là kiểu camera game khiến phòng trông như đồ chơi.
    // Camera kéo lùi tương ứng để cùng cảnh vừa khít ở góc hẹp hơn.
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
