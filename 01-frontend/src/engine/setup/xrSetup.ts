/**
 * xrSetup — WebXR (immersive-vr) cho chế độ "đi dạo" bằng kính (Quest 3, …).
 *
 * Phase 0–4 (xem VR-WALKTHROUGH-PLAN.md):
 *   - Render path XR + player rig (camera + controller trong một Group; dời rig = di chuyển).
 *   - Locomotion: teleport (cò) + snap-turn (stick phải) + đi mượt tuỳ chọn (stick trái).
 *   - Comfort: vignette tối viền khi đi mượt (giảm say); controller model thật.
 *   - Spawn vào GIỮA nhà (bbox các mesh, bỏ helper) thay vì gốc thế giới.
 *   - Điều khiển vào/ra VR (enter/exit/isSupported/subscribe) cho React (nút trên TopNavBar).
 *
 * Cô lập khỏi engine core: RenderSystem rẽ nhánh theo renderer.xr.isPresenting; loop đã đổi
 * sang renderer.setAnimationLoop ở engine.ts; update() được gọi mỗi frame TRƯỚC render.
 * File này không đụng ECS.
 */
import * as THREE from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import type { OrbitControlSystem } from "src/engine/systems/scene/OrbitControlSystem";
import type { XRControls } from "src/engine/engineTypes";

export type XRBundle = {
    /** Group chứa camera + controller khi ở VR. */
    rig: THREE.Group;
    /** Điều khiển cho React (enter/exit/isSupported/subscribe/isPresenting). */
    controls: XRControls;
    /** Gọi mỗi frame TRƯỚC render (chỉ làm việc khi isPresenting). dt = giây. */
    update(dt: number): void;
    dispose(): void;
};

const SNAP_TURN_DEG = 30;       // góc xoay mỗi lần snap (comfort)
const SNAP_ON = 0.7;            // ngưỡng kích snap-turn
const SNAP_OFF = 0.3;          // ngưỡng nhả (hysteresis)
const MOVE_DEADZONE = 0.15;     // vùng chết stick đi mượt
const MOVE_SPEED = 2.0;         // m/s đi mượt
const VIGNETTE_OPACITY = 0.55;  // độ tối viền khi đi mượt
const WALKABLE_NORMAL_Y = 0.6;  // teleport chỉ nhận bề mặt hướng lên
const WALKABLE_MAX_Y = 0.6;     // …và ở tầm sàn (không leo nóc tủ)
// Phase 5 (perf trên GPU Quest): knob độ phân giải framebuffer XR. 1.0 = native; hạ
// xuống (vd 0.8) nếu tụt FPS, nâng (vd 1.2) nếu còn dư. Áp ở lần requestSession sau.
const XR_FRAMEBUFFER_SCALE = 1.0;

export function setupXR(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    orbit: OrbitControlSystem,
): XRBundle {
    renderer.xr.enabled = true;
    try {
        renderer.xr.setReferenceSpaceType("local-floor");
    } catch {
        // giữ mặc định nếu runtime không nhận 'local-floor'
    }
    // Phase 5 perf: foveation tối đa (1) → hạ độ phân giải vùng rìa mắt, tiết kiệm fill-rate
    // trên GPU di động Quest mà gần như không thấy ở trung tâm. + knob framebuffer scale.
    renderer.xr.setFoveation?.(1);
    renderer.xr.setFramebufferScaleFactor?.(XR_FRAMEBUFFER_SCALE);

    const rig = new THREE.Group();
    rig.name = "xrRig";
    scene.add(rig);

    // ── Controllers: tia ngắm (target-ray) + model tay (grip) ───────────────────
    const rayGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
    ]);
    const rayMat = new THREE.LineBasicMaterial({ color: 0x33aaff });

    type Ctrl = THREE.XRTargetRaySpace & { userData: { isSelecting?: boolean } };
    const controllers: Ctrl[] = [];
    const grips: THREE.XRGripSpace[] = [];
    const modelFactory = new XRControllerModelFactory();

    const onSelectStart = (e: { target: THREE.Object3D }) => {
        (e.target as Ctrl).userData.isSelecting = true;
    };
    const onSelectEnd = (e: { target: THREE.Object3D }) => {
        const c = e.target as Ctrl;
        c.userData.isSelecting = false;
        if (marker.visible) teleportTo(marker.position);
    };

    for (let i = 0; i < 2; i++) {
        const c = renderer.xr.getController(i) as Ctrl;
        const line = new THREE.Line(rayGeom, rayMat);
        line.scale.z = 5;
        c.add(line);
        c.addEventListener("selectstart", onSelectStart);
        c.addEventListener("selectend", onSelectEnd);
        rig.add(c);
        controllers.push(c);

        const grip = renderer.xr.getControllerGrip(i);
        grip.add(modelFactory.createControllerModel(grip));
        rig.add(grip);
        grips.push(grip);
    }

    // ── Marker teleport (vòng dẹt nằm trên sàn) ─────────────────────────────────
    const markerGeom = new THREE.RingGeometry(0.15, 0.22, 32).rotateX(-Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({
        color: 0x33aaff,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
    });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.visible = false;
    marker.renderOrder = 999;
    scene.add(marker);

    // ── Vignette chống say: vành tối bám đầu, chỉ hiện khi đi mượt ───────────────
    const vignetteGeom = new THREE.RingGeometry(0.4, 4, 48);
    const vignetteMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const vignette = new THREE.Mesh(vignetteGeom, vignetteMat);
    vignette.position.z = -1; // 1m trước mặt
    vignette.renderOrder = 1000;
    vignette.frustumCulled = false;
    vignette.visible = false;
    camera.add(vignette);

    // ── Scratch ─────────────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const tmpMatrix = new THREE.Matrix4();
    const tmpCamWorld = new THREE.Vector3();
    const tmpForward = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);
    let snapReady = true;

    /** Dời rig sao cho XZ của camera (đầu người chơi) rơi đúng `target`. */
    function teleportTo(target: THREE.Vector3): void {
        camera.getWorldPosition(tmpCamWorld);
        rig.position.x += target.x - tmpCamWorld.x;
        rig.position.z += target.z - tmpCamWorld.z;
        rig.position.y = target.y;
    }

    /** Xoay snap quanh trục đứng qua ĐẦU người chơi (đỡ chóng mặt hơn quanh gốc rig). */
    function snapTurn(deg: number): void {
        const angle = THREE.MathUtils.degToRad(deg);
        camera.getWorldPosition(tmpCamWorld);
        const dx = rig.position.x - tmpCamWorld.x;
        const dz = rig.position.z - tmpCamWorld.z;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        rig.position.x = tmpCamWorld.x + (dx * cos - dz * sin);
        rig.position.z = tmpCamWorld.z + (dx * sin + dz * cos);
        rig.rotateY(angle);
    }

    /** Ngắm từ controller: điểm đi-được gần nhất, hoặc null. */
    function aimFloor(c: THREE.Object3D): THREE.Vector3 | null {
        tmpMatrix.identity().extractRotation(c.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
        const hits = raycaster.intersectObjects(scene.children, true);
        for (const h of hits) {
            const obj = h.object as THREE.Mesh;
            if (obj === marker || obj === vignette || !obj.isMesh || !h.face) continue;
            const ny = h.face.normal.clone().transformDirection(obj.matrixWorld).y;
            if (ny > WALKABLE_NORMAL_Y && h.point.y < WALKABLE_MAX_Y) return h.point.clone();
        }
        return null;
    }

    /** Tâm XZ của bbox các mesh thật (helper là LineSegments nên tự bị loại). */
    function computeSpawnXZ(): { x: number; z: number } {
        const box = new THREE.Box3();
        const tmp = new THREE.Box3();
        scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh || o === marker || o === vignette) return;
            tmp.setFromObject(m);
            if (!tmp.isEmpty()) box.union(tmp);
        });
        if (box.isEmpty()) return { x: 0, z: 0 };
        const c = box.getCenter(new THREE.Vector3());
        return { x: c.x, z: c.z };
    }

    function update(dt: number): void {
        if (!renderer.xr.isPresenting) return;

        // Teleport aim từ controller đang bóp cò.
        marker.visible = false;
        for (const c of controllers) {
            if (!c.userData.isSelecting) continue;
            const hit = aimFloor(c);
            if (hit) {
                marker.position.copy(hit).setY(hit.y + 0.01);
                marker.visible = true;
            }
            break;
        }

        // Đọc thumbstick 2 tay (Quest: axes[2]=X, axes[3]=Y).
        const session = renderer.xr.getSession();
        let turnX = 0;
        let moveX = 0;
        let moveY = 0;
        if (session) {
            for (const src of session.inputSources) {
                const gp = src.gamepad;
                if (!gp) continue;
                const ax = gp.axes[2] ?? gp.axes[0] ?? 0;
                const ay = gp.axes[3] ?? gp.axes[1] ?? 0;
                if (src.handedness === "right") turnX = ax;
                else if (src.handedness === "left") { moveX = ax; moveY = ay; }
            }
        }

        // Snap-turn (stick phải, có hysteresis).
        if (snapReady && Math.abs(turnX) > SNAP_ON) {
            snapTurn(turnX > 0 ? -SNAP_TURN_DEG : SNAP_TURN_DEG);
            snapReady = false;
        } else if (Math.abs(turnX) < SNAP_OFF) {
            snapReady = true;
        }

        // Đi mượt (stick trái) theo hướng nhìn ngang của camera.
        const moving = Math.hypot(moveX, moveY) > MOVE_DEADZONE;
        if (moving) {
            camera.getWorldDirection(tmpForward);
            tmpForward.y = 0;
            tmpForward.normalize();
            tmpRight.crossVectors(tmpForward, UP).normalize(); // phải = forward × up
            const step = MOVE_SPEED * dt;
            // Đẩy stick lên (axes Y âm) = tiến.
            rig.position.addScaledVector(tmpForward, -moveY * step);
            rig.position.addScaledVector(tmpRight, moveX * step);
        }

        // Vignette: mờ dần theo trạng thái đi mượt.
        const target = moving ? VIGNETTE_OPACITY : 0;
        vignetteMat.opacity += (target - vignetteMat.opacity) * Math.min(1, dt * 8);
        vignette.visible = vignetteMat.opacity > 0.01;
    }

    // ── Vào/ra VR ────────────────────────────────────────────────────────────────
    let savedPos: THREE.Vector3 | null = null;
    let savedQuat: THREE.Quaternion | null = null;
    let presenting = false;
    let prevShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const listeners = new Set<(p: boolean) => void>();

    const onSessionStart = () => {
        presenting = true;
        // Phase 5 perf: scene walkthrough tĩnh (không di đồ trong VR) → bake shadow MỘT lần
        // rồi đóng băng, khỏi cập nhật shadow map mỗi frame stereo. Khôi phục khi thoát.
        prevShadowAutoUpdate = renderer.shadowMap.autoUpdate;
        renderer.shadowMap.needsUpdate = true;
        renderer.shadowMap.autoUpdate = false;
        orbit.controls.enabled = false;
        savedPos = camera.position.clone();
        savedQuat = camera.quaternion.clone();
        rig.add(camera);
        camera.position.set(0, 0, 0);
        camera.quaternion.identity();
        const spawn = computeSpawnXZ();
        rig.position.set(spawn.x, 0, spawn.z);
        rig.rotation.set(0, 0, 0);
        listeners.forEach((l) => l(true));
    };

    const onSessionEnd = () => {
        presenting = false;
        // Khôi phục shadow động cho editor desktop (di đồ → bóng phải cập nhật lại).
        renderer.shadowMap.autoUpdate = prevShadowAutoUpdate;
        renderer.shadowMap.needsUpdate = true;
        rig.remove(camera);
        if (savedPos) camera.position.copy(savedPos);
        if (savedQuat) camera.quaternion.copy(savedQuat);
        camera.updateProjectionMatrix();
        marker.visible = false;
        vignette.visible = false;
        vignetteMat.opacity = 0;
        orbit.controls.enabled = true;
        listeners.forEach((l) => l(false));
    };

    renderer.xr.addEventListener("sessionstart", onSessionStart);
    renderer.xr.addEventListener("sessionend", onSessionEnd);

    const controls: XRControls = {
        isSupported: () =>
            typeof navigator !== "undefined" && navigator.xr
                ? navigator.xr.isSessionSupported("immersive-vr").catch(() => false)
                : Promise.resolve(false),
        isPresenting: () => presenting,
        async enter() {
            if (presenting || typeof navigator === "undefined" || !navigator.xr) return;
            // KHÔNG xin 'layers': khi feature này bật, three dựng projection layer qua
            // `new XRWebGLBinding(session, gl)` (API native) → vỡ với session "giả" của
            // WebXR API Emulator ("parameter 1 is not of type 'XRSession'"). Bỏ đi để three
            // rơi về đường XRWebGLLayer baseLayer — tương thích emulator + Quest, đủ perf +
            // foveation (qua XRWebGLLayer.fixedFoveation).
            const session = await navigator.xr.requestSession("immersive-vr", {
                optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
            });
            await renderer.xr.setSession(session as XRSession);
        },
        async exit() {
            await renderer.xr.getSession()?.end();
        },
        subscribe(cb) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
    };

    return {
        rig,
        controls,
        update,
        dispose() {
            renderer.xr.removeEventListener("sessionstart", onSessionStart);
            renderer.xr.removeEventListener("sessionend", onSessionEnd);
            listeners.clear();
            for (const c of controllers) {
                c.removeEventListener("selectstart", onSelectStart);
                c.removeEventListener("selectend", onSelectEnd);
                rig.remove(c);
            }
            for (const g of grips) rig.remove(g);
            camera.remove(vignette);
            rig.remove(camera);
            scene.remove(rig);
            scene.remove(marker);
            rayGeom.dispose();
            rayMat.dispose();
            markerGeom.dispose();
            markerMat.dispose();
            vignetteGeom.dispose();
            vignetteMat.dispose();
            renderer.xr.enabled = false;
        },
    };
}
