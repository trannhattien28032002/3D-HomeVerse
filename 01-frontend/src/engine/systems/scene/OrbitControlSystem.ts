/**
 * OrbitControlSystem — quản lý camera 3D trong SceneView3D.
 *
 * Bao gồm:
 *   - OrbitControls (Three.js) cho pan/rotate bằng chuột
 *   - Custom zoom: zoom-to-cursor (không dùng OrbitControls.enableZoom)
 *   - Double-click: pan camera target tới điểm vừa click
 *   - setView(): animate camera tới preset (plan / perspective / eye-level)
 *   - rotateBy(): xoay ngang quanh target hiện tại (dùng cho nút rotation bar)
 *
 * Animation: dùng cubic ease-out (TRANSITION_DURATION = 0.55s).
 * Chặn camera dưới MIN_CAMERA_Y sau mỗi controls.update() để tránh xuyên sàn.
 *
 * Dependency: camera + renderer được inject từ createEngine/systemSetup.
 *             Không truy cập ECS World (void world trong update).
 */
import * as THREE from "three";
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CachedClientRect } from "src/shared/dom/cachedRect";
import type { CameraPreset } from "src/engine/engineTypes";

// Camera không bao giờ thấp hơn đây — tránh chui qua sàn nhà
const MIN_CAMERA_Y = 0.5;

// Thời gian animation khi chuyển preset (giây)
const TRANSITION_DURATION = 0.55;

/**
 * Định nghĩa các góc nhìn camera. Rationale xem .doc/camera_system_analysis.md.
 *   plan:        nhìn từ trên xuống (90°) — dùng cho chế độ 2D layout
 *   perspective: góc 3/4 (~35° elevation) — góc nhìn chính để cảm nhận tỉ lệ
 *   eye-level:   ngang tầm mắt (1.65m) — walkthrough preview
 */
const CAMERA_PRESETS: Record<CameraPreset, { position: THREE.Vector3; target: THREE.Vector3; fov: number }> = {
    // Nhìn từ trên (bird's-eye). Lệch Z cực nhỏ để tránh gimbal lock tại đúng (0, y, 0).
    plan: {
        position: new THREE.Vector3(0, 25, 0.001),
        target:   new THREE.Vector3(0, 0, 0),
        fov: 45,
    },
    // Phối cảnh 3/4: ~35° độ cao. Góc duy nhất thấy đồng thời sàn + tường + chiều sâu
    // — góc nhìn chính để cảm nhận tỉ lệ.
    perspective: {
        position: new THREE.Vector3(10, 10, 14),
        target:   new THREE.Vector3(0, 1.2, 0), // ngang giữa tường, không phải sàn
        fov: 45,
    },
    // Đi bộ ngang tầm mắt. Camera ở 1.65m (cao tầm mắt), hơi nhìn xuống để góc polar
    // luôn dưới ngưỡng π/2 của OrbitControls.
    "eye-level": {
        position: new THREE.Vector3(0, 1.65, 8),
        target:   new THREE.Vector3(0, 1.55, 0),
        fov: 65,
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Cubic ease-out: bắt đầu nhanh, giảm tốc mượt khi tới vị trí đích.
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraTransition = {
    fromCamPos: THREE.Vector3;
    toCamPos:   THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget:   THREE.Vector3;
    fromFov:    number;
    toFov:      number;
    elapsed:    number;
};

// ─── System ───────────────────────────────────────────────────────────────────

export class OrbitControlSystem extends System {
    controls: OrbitControls;

    private camera: THREE.Camera;
    private scene: THREE.Scene;
    private domElement: HTMLElement;
    // LW-03: rect canvas được cache, invalidate khi resize/scroll — onMouseMove đọc
    // mỗi lần di chuột nên gọi getBoundingClientRect() trực tiếp dễ gây forced-reflow.
    private rectCache: CachedClientRect;

    private zoomDelta = 0;
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    // MD-02: điểm world-space mà zoom-to-cursor hướng tới. Tính MỘT LẦN khi lăn chuột
    // (onWheel) thay vì raycast đệ quy toàn scene mỗi frame trong suốt quán tính zoom.
    private zoomFocusWorld: THREE.Vector3 | null = null;

    private focusPoint: THREE.Vector3 | null = null;
    private _transition: CameraTransition | null = null;

    constructor(
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene
    ) {
        super();
        this.camera = camera;
        this.scene = scene;
        this.domElement = renderer.domElement;
        this.rectCache = new CachedClientRect(this.domElement);

        this.controls = new OrbitControls(camera, renderer.domElement);

        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.enableZoom = false;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 2000;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);

        this.domElement.addEventListener("wheel", this.onWheel, { passive: false });
        this.domElement.addEventListener("mousemove", this.onMouseMove);
        this.domElement.addEventListener("dblclick", this.onDoubleClick);
    }

    // ── Event handlers ──────────────────────────────────────────────────────

    private onMouseMove = (event: MouseEvent) => {
        const rect = this.rectCache.get();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    private onWheel = (event: WheelEvent) => {
        event.preventDefault();
        // Mọi thao tác cuộn đều huỷ animation chuyển preset để người dùng nắm
        // quyền điều khiển ngay, không phải "đánh nhau" với animation.
        this._transition = null;
        this.zoomDelta -= event.deltaY * 0.001;
        this.zoomDelta = Math.max(-0.5, Math.min(0.5, this.zoomDelta));
        this.focusPoint = null;
        // MD-02: raycast tại con trỏ chỉ MỘT LẦN cho mỗi event lăn chuột. Các frame
        // quán tính sau đó tái dùng điểm world này (con trỏ hầu như đứng yên khi zoom
        // giảm tốc) → không còn intersectObjects(scene, true) đệ quy mỗi frame.
        this.zoomFocusWorld = this.pickCursorWorldPoint();
    };

    private onDoubleClick = () => {
        const hitPoint = this.pickCursorWorldPoint();
        if (hitPoint) {
            this.focusPoint = hitPoint;
            this.zoomDelta = 0;
        }
    };

    /**
     * Raycast từ con trỏ: trả điểm chạm mesh hiển thị gần nhất, hoặc giao điểm với
     * mặt sàn (y=0). Trả về vector world MỚI (an toàn để giữ lại). null nếu trượt cả hai.
     */
    private pickCursorWorldPoint(): THREE.Vector3 | null {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.scene.children, true);
        const meshHit = hits.find(h => h.object.type === "Mesh" && h.object.visible)?.point;
        if (meshHit) return meshHit.clone();
        const ground = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(this.groundPlane, ground) ? ground : null;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Xoay mượt camera trái/phải quanh target hiện tại `angleDeg` độ
     * (dương = sang trái / CCW khi nhìn từ trên xuống).
     */
    rotateBy(angleDeg: number): void {
        const rad    = angleDeg * (Math.PI / 180);
        const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        const cos    = Math.cos(rad);
        const sin    = Math.sin(rad);
        const newX   = cos * offset.x - sin * offset.z;
        const newZ   = sin * offset.x + cos * offset.z;
        const cam    = this.camera as THREE.PerspectiveCamera;
        this._transition = {
            fromCamPos: this.camera.position.clone(),
            toCamPos:   new THREE.Vector3(
                this.controls.target.x + newX,
                this.camera.position.y,
                this.controls.target.z + newZ,
            ),
            fromTarget: this.controls.target.clone(),
            toTarget:   this.controls.target.clone(),
            fromFov:    cam.fov,
            toFov:      cam.fov,
            elapsed:    0,
        };
        this.zoomDelta  = 0;
        this.focusPoint = null;
    }

    /** Animate camera mượt tới một preset kiến trúc có tên. */
    setView(preset: CameraPreset): void {
        const p   = CAMERA_PRESETS[preset];
        const cam = this.camera as THREE.PerspectiveCamera;
        this._transition = {
            fromCamPos: this.camera.position.clone(),
            toCamPos:   p.position.clone(),
            fromTarget: this.controls.target.clone(),
            toTarget:   p.target.clone(),
            fromFov:    cam.fov,
            toFov:      p.fov,
            elapsed:    0,
        };
        // Huỷ quán tính zoom để không "đánh nhau" với animation.
        this.zoomDelta  = 0;
        this.focusPoint = null;
    }

    dispose() {
        this.domElement.removeEventListener("wheel", this.onWheel);
        this.domElement.removeEventListener("mousemove", this.onMouseMove);
        this.domElement.removeEventListener("dblclick", this.onDoubleClick);
        this.rectCache.dispose();
        this.controls.dispose();
    }

    // ── Update loop ─────────────────────────────────────────────────────────

    update(world: World, deltaTime: number): void {
        void world;

        if (this._transition) {
            // Tiến animation và áp cubic ease-out để camera giảm tốc vào vị trí
            // thay vì đến đích với tốc độ không đổi.
            this._transition.elapsed += deltaTime;
            const raw = Math.min(1, this._transition.elapsed / TRANSITION_DURATION);
            const t   = easeOutCubic(raw);

            this.camera.position.lerpVectors(this._transition.fromCamPos, this._transition.toCamPos, t);
            this.controls.target.lerpVectors(this._transition.fromTarget, this._transition.toTarget, t);

            const cam = this.camera as THREE.PerspectiveCamera;
            cam.fov = THREE.MathUtils.lerp(this._transition.fromFov, this._transition.toFov, t);
            cam.updateProjectionMatrix();

            if (raw >= 1) this._transition = null;

        } else if (Math.abs(this.zoomDelta) > 0.0001) {
            // MD-02: dùng điểm focus đã raycast sẵn ở onWheel — không raycast mỗi frame.
            const hitPoint = this.zoomFocusWorld;

            if (hitPoint) {
                const targetWorld = hitPoint.clone();

                const MAX_ZOOM_DIST = this.controls.target.distanceTo(this.camera.position) * 3;
                const distToHit    = this.camera.position.distanceTo(targetWorld);

                if (distToHit > MAX_ZOOM_DIST) {
                    const dir = new THREE.Vector3().subVectors(targetWorld, this.camera.position).normalize();
                    targetWorld.copy(this.camera.position).addScaledVector(dir, MAX_ZOOM_DIST);
                }

                const zoomStep      = this.zoomDelta * 0.15;
                const camToTarget   = new THREE.Vector3().subVectors(targetWorld, this.camera.position);
                const focusToTarget = new THREE.Vector3().subVectors(targetWorld, this.controls.target);

                this.camera.position.addScaledVector(camToTarget, zoomStep);
                this.controls.target.addScaledVector(focusToTarget, zoomStep);

                // Giữ target orbit trên mặt sàn — nếu trôi xuống dưới y=0,
                // OrbitControls tính lại vị trí camera quanh điểm dưới đất đó và có
                // thể đẩy camera xuống dưới sàn ở update() kế tiếp.
                if (this.controls.target.y < 0) this.controls.target.y = 0;
            }

            this.zoomDelta *= 0.8;
        }

        // Pan tới điểm focus từ double-click — bỏ qua khi đang có transition để
        // hai chuyển động không "đánh nhau".
        if (this.focusPoint && !this._transition) {
            const dist = this.controls.target.distanceTo(this.focusPoint);
            if (dist > 0.01) {
                this.controls.target.lerp(this.focusPoint, 0.1);
            } else {
                this.controls.target.copy(this.focusPoint);
                this.focusPoint = null;
            }
        }

        this.controls.update();

        // Chặn sàn cứng áp SAU controls.update() — OrbitControls tính lại
        // camera.position từ toạ độ cầu nội bộ ở mỗi update(), nên mọi hiệu chỉnh
        // Y trước lời gọi này đều bị ghi đè.
        if (this.camera.position.y < MIN_CAMERA_Y) {
            this.camera.position.y = MIN_CAMERA_Y;
        }
    }
}
