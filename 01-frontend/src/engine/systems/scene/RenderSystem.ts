import * as THREE from "three";
import { System } from "src/engine/ecs/System";
import { Query } from "src/engine/ecs/Query";
import { Transform } from "src/engine/components/core/Transform";
import { Mesh } from "src/engine/components/render/Mesh";
import { WorldSpaceMesh } from "src/engine/components/render/WorldSpaceMesh";
import { World } from "src/engine/ecs/World";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import type { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import type { RenderScheduler } from "src/engine/rendering/RenderScheduler";
import { perfEnabled, perfMark } from "src/engine/rendering/perfProbe";

/**
 * RenderSystem — đồng bộ Transform của ECS xuống mesh Three.js rồi render scene.
 *
 * Hai đường đặt vị trí:
 *   - WorldSpaceMesh: toạ độ đã nằm trong geometry → chỉ set y, reset xoay (dùng cho tường).
 *   - Mặc định      : áp đầy đủ position + quaternion từ Transform (dùng cho đồ thường).
 * Là system chạy gần CUỐI mỗi frame. Render qua EffectComposer (RenderPass →
 * OutlinePass → OutputPass) thay vì renderer.render trực tiếp để hỗ trợ viền chọn.
 *
 * Gizmo nằm ở `overlayScene` riêng và được render SAU composer (autoClear=false +
 * clearDepth) để OutlinePass KHÔNG tô viền lên gizmo — TransformControls tự bật lại
 * visible của handle trong updateMatrixWorld nên nếu ở scene chính sẽ lọt vào mask outline.
 *
 * On-demand rendering (CR-03): KHÔNG render mỗi frame. Chỉ render khi có thay đổi nhìn
 * thấy được, phát hiện qua 4 nguồn:
 *   1. ECS revision đổi (đồng thời sync Transform→mesh — đây là việc duy nhất cần revision).
 *   2. Camera đổi (orbit/zoom/transition) — so vị trí + quaternion + fov với frame cuối.
 *   3. Environment/background đổi (HDRI nạp xong sau boot) — so tham chiếu texture.
 *   4. RenderScheduler.requestRender() — cho thay đổi "preview" không bump revision
 *      (ghost đặt đồ, hover/attach/detach gizmo, đổi viền chọn). Xem RenderScheduler.
 * Khi cả 4 đều "yên" → bỏ qua composer.render(): GPU không còn chạy OutlinePass mãi
 * lúc cảnh tĩnh. Ngoài ra tắt hẳn OutlinePass khi không chọn gì (selectedObjects rỗng).
 */
export class RenderSystem extends System {
    private composer: EffectComposer;
    private renderer: THREE.WebGLRenderer;
    private camera: THREE.Camera;
    private overlayScene: THREE.Scene;
    private outlinePass: OutlinePass;
    private scene: THREE.Scene;
    private scheduler: RenderScheduler;

    /** revision-guard: World.revision đã sync lần cuối — skip mesh sync khi không có thay đổi ECS. */
    private _lastRevision: number = -1;

    // ── Trạng thái camera/scene đã render lần cuối (để phát hiện thay đổi) ──────────
    private _lastCamPos = new THREE.Vector3(NaN, NaN, NaN);
    private _lastCamQuat = new THREE.Quaternion(NaN, NaN, NaN, NaN);
    private _lastFov = NaN;
    private _lastEnv: THREE.Texture | null = null;
    private _lastBackground: THREE.Texture | THREE.Color | null = null;

    constructor(
        composer: EffectComposer,
        renderer: THREE.WebGLRenderer,
        camera: THREE.Camera,
        overlayScene: THREE.Scene,
        outlinePass: OutlinePass,
        scene: THREE.Scene,
        scheduler: RenderScheduler,
    ) {
        super();
        this.composer = composer;
        this.renderer = renderer;
        this.camera = camera;
        this.overlayScene = overlayScene;
        this.outlinePass = outlinePass;
        this.scene = scene;
        this.scheduler = scheduler;
    }

    /** Đồng bộ Transform của ECS xuống mesh Three.js (dùng chung cho đường desktop + XR). */
    private syncTransforms(world: World): void {
        const entities = Query.entitiesWith(world, Transform, Mesh);

        for (const entity of entities) {
            const transform = world.getComponent(entity, Transform)!;
            const meshComp = world.getComponent(entity, Mesh)!;
            const mesh = meshComp.mesh;
            const isWorldSpace = world.hasComponent(entity, WorldSpaceMesh);

            if (isWorldSpace) {
                mesh.position.set(0, transform.y, 0);
                mesh.rotation.set(0, 0, 0);
            } else {
                mesh.position.set(transform.x, transform.y, transform.z);
                mesh.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
            }
        }

        this._lastRevision = world.revision;
    }

    update(world: World, deltaTime: number): void {
        // 0) VR (WebXR): bỏ qua on-demand gating + EffectComposer + gizmo overlay. Phải
        //    render stereo MỌI frame; renderer.xr tự thay camera bằng ArrayCamera 2 mắt.
        //    OutlinePass/postprocess không stereo nên không dùng trong VR (walkthrough).
        if (this.renderer.xr.isPresenting) {
            if (world.revision !== this._lastRevision) this.syncTransforms(world);
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // 1) ECS revision đổi → sync Transform xuống mesh + cần render.
        const revisionChanged = world.revision !== this._lastRevision;
        if (revisionChanged) {
            this.syncTransforms(world);
        }

        // 2) Camera đổi? OrbitControlSystem chạy TRƯỚC trong cùng frame nên camera đã
        //    cập nhật. So bit-exact: khi OrbitControls settle (delta < EPS) nó không ghi
        //    lại position nữa → giá trị bất biến → so sánh dừng vòng render.
        const cam = this.camera as THREE.PerspectiveCamera;
        const cameraChanged =
            !this._lastCamPos.equals(this.camera.position) ||
            !this._lastCamQuat.equals(this.camera.quaternion) ||
            this._lastFov !== cam.fov;

        // 3) Environment/background đổi (HDRI nạp xong) — so tham chiếu.
        const envChanged =
            this._lastEnv !== this.scene.environment ||
            this._lastBackground !== this.scene.background;

        // 4) Thay đổi preview không bump revision (ghost/gizmo/viền chọn).
        const requested = this.scheduler.consume();

        if (!revisionChanged && !cameraChanged && !envChanged && !requested) {
            // Không có gì đổi: bỏ qua render. Canvas giữ nguyên frame cuối.
            return;
        }

        // OutlinePass tốn fill-rate kể cả khi rỗng → tắt hẳn khi không chọn gì.
        this.outlinePass.enabled = this.outlinePass.selectedObjects.length > 0;

        const probing = perfEnabled();
        if (probing) {
            // autoReset=false + reset thủ công để info GOM draw call qua TẤT CẢ pass của
            // composer (mỗi pass gọi renderer.render sẽ tự reset nếu để autoReset mặc định).
            this.renderer.info.autoReset = false;
            this.renderer.info.reset();
        }
        const _t0 = probing ? performance.now() : 0;
        this.composer.render(deltaTime);
        if (probing) {
            const on = this.outlinePass.enabled;
            // GPU async: cần readPixels để buộc đồng bộ thì mới đo đúng GPU time, nhưng
            // CPU-side composer.render (submit draw calls + JS của các pass) đã đủ để so
            // sánh tương đối giữa OutlinePass bật vs tắt.
            perfMark(on ? "composer.render (outline ON)" : "composer.render (outline OFF)", performance.now() - _t0);
            perfMark(on ? "draw calls (outline ON)" : "draw calls (outline OFF)", this.renderer.info.render.calls);
            perfMark("triangles (K)", this.renderer.info.render.triangles / 1000);
            this.renderer.info.autoReset = true;
        }

        // Gizmo overlay: vẽ chồng lên kết quả composer (giữ màu, không xoá), trên cùng.
        if (this.overlayScene.children.length > 0) {
            this.renderer.autoClear = false;
            this.renderer.clearDepth();
            this.renderer.render(this.overlayScene, this.camera);
            this.renderer.autoClear = true;
        }

        // Ghi nhận trạng thái đã render để so sánh frame sau.
        this._lastCamPos.copy(this.camera.position);
        this._lastCamQuat.copy(this.camera.quaternion);
        this._lastFov = cam.fov;
        this._lastEnv = this.scene.environment;
        this._lastBackground = this.scene.background;
    }
}
