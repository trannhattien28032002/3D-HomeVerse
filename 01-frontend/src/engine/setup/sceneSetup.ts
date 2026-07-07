/**
 * sceneSetup — dựng nền tảng Three.js: Scene, Camera, Renderer.
 *
 * Bao gồm: lưới sàn (grid), trục toạ độ (axes), fog, tone mapping ACES, và nạp
 * HDRI studio.hdr làm environment map cho phản chiếu PBR. Các lựa chọn (FOV 45°,
 * grid 0.5m/ô, fog) đều theo quy ước trực quan hoá kiến trúc — xem comment inline.
 */
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { resolveAssetUrl } from "src/shared/catalog/assetUrl";

export type SceneBundle = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
};

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
    const scene = new THREE.Scene();
    const axesHelper = new THREE.AxesHelper(100);
    axesHelper.renderOrder = 2;
    // LW-02: trục toạ độ chỉ là công cụ debug — ẩn ở production. Và không cho raycast
    // (zoom-to-cursor / pick không bao giờ nên bắt trúng đường trục).
    axesHelper.visible = import.meta.env.DEV;
    axesHelper.raycast = () => {};
    scene.add(axesHelper);
    // Phủ 50m, 100 ô chia → 0.5m mỗi ô.
    // Giường đôi (1.4m × 2m) chiếm ~3×4 ô; một phòng (5m × 4m) là 10×8 ô.
    // Không ảnh hưởng world units, snapping hay dimension — chỉ là mật độ trực quan.
    const gridHelper = new THREE.GridHelper(50, 100, 0xb0a090, 0xd0c8bc);
    gridHelper.position.y = -0.001;
    gridHelper.renderOrder = 1;
    // LW-02: lưới (200 line segments) là child cố định của scene — loại khỏi raycast để
    // intersectObjects(scene.children, true) không phải duyệt nó mỗi lần pick.
    gridHelper.raycast = () => {};
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

    // WebXR — buộc đường XRWebGLLayer (baseLayer) thay vì XRProjectionLayer:
    //   three (WebXRManager) dựng projection layer qua `new XRWebGLBinding(session, gl)` — API
    //   NATIVE — mỗi khi `typeof XRWebGLBinding !== 'undefined'` (luôn đúng ở Chrome). Binding này
    //   vỡ với "session giả" của WebXR API Emulator ("parameter 1 is not of type 'XRSession'").
    //   WebXRManager CHỘP cờ `supportsGlBinding` đúng lúc renderer được tạo → ta ẩn tạm
    //   XRWebGLBinding chỉ trong khoảnh khắc đó rồi khôi phục → manager rơi về baseLayer
    //   (tương thích cả emulator lẫn Quest; foveation vẫn chạy qua XRWebGLLayer.fixedFoveation).
    const xrGlobal = window as unknown as { XRWebGLBinding?: unknown };
    const savedXRBinding = xrGlobal.XRWebGLBinding;
    const renderer = ((): THREE.WebGLRenderer => {
        try {
            xrGlobal.XRWebGLBinding = undefined;
            return new THREE.WebGLRenderer({ canvas, antialias: true });
        } finally {
            xrGlobal.XRWebGLBinding = savedXRBinding;
        }
    })();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Cap DPR ở 2 (CR-03/LW-01): màn 4K/Retina có devicePixelRatio 3 → render 9× số pixel
    // (MSAA half-float + OutlinePass) cho gần như không lợi ích nhìn thấy. Composer kế thừa
    // tỉ lệ này qua renderer.getPixelRatio() trong postprocessSetup.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x202030, 1);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    // HG-04: HDRI chỉ cung cấp phản chiếu ambient nên KHÔNG nằm trên đường tới hạn
    // của lần vẽ đầu. Hoãn fetch sang sau khung hình đầu tiên (double-rAF) để:
    //   1) cảnh kịp paint bằng background phẳng trước, và
    //   2) PMREM prefilter (GPU spike) cùng băng thông không tranh chấp với GLB/KTX2
    //      tải lúc khởi động.
    // Asset đã đổi từ studio.exr 3.4 MB (2048×1024 float, không nén) → studio.hdr
    // 0.74 MB (1024×512 RGBE RLE) qua scripts/convert-hdri.mjs — 512–1024 equirect là
    // quá đủ cho phản chiếu. RenderSystem (CR-03) phát hiện scene.environment đổi tham
    // chiếu và render lại đúng một lần khi HDRI nạp xong.
    const loadEnvironment = () => {
        new HDRLoader().load(resolveAssetUrl("/hdri/studio.hdr")!, (texture) => {
            const envMap = pmrem.fromEquirectangular(texture).texture;
            scene.environment = envMap;
            scene.background = envMap;
            texture.dispose();
        });
    };
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(loadEnvironment));
    } else {
        loadEnvironment();
    }

    return { scene, camera, renderer };
}
