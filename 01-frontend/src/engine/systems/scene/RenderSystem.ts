import * as THREE from "three";
import { System } from "src/engine/ecs/System";
import { Query } from "src/engine/ecs/Query";
import { Transform } from "src/engine/components/core/Transform";
import { Mesh } from "src/engine/components/render/Mesh";
import { WorldSpaceMesh } from "src/engine/components/render/WorldSpaceMesh";
import { World } from "src/engine/ecs/World";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

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
 * Lưu ý hiệu năng: hiện đồng bộ MỌI mesh mỗi frame kể cả vật tĩnh — có thể tối ưu
 * bằng dirty-flag.
 */
export class RenderSystem extends System {
    private composer: EffectComposer;
    private renderer: THREE.WebGLRenderer;
    private camera: THREE.Camera;
    private overlayScene: THREE.Scene;
    /** revision-guard: World.revision đã sync lần cuối — skip mesh sync khi không có thay đổi ECS.
     *  composer.render() vẫn chạy mỗi frame để camera orbit hoạt động bình thường. */
    private _lastRevision: number = -1;

    constructor(composer: EffectComposer, renderer: THREE.WebGLRenderer, camera: THREE.Camera, overlayScene: THREE.Scene) {
        super();
        this.composer = composer;
        this.renderer = renderer;
        this.camera = camera;
        this.overlayScene = overlayScene;
    }

    update(world: World, deltaTime: number): void {
        if (world.revision !== this._lastRevision) {
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

        // Luôn render: camera orbit không bump revision nhưng vẫn cần frame mới.
        this.composer.render(deltaTime);

        // Gizmo overlay: vẽ chồng lên kết quả composer (giữ màu, không xoá), trên cùng.
        if (this.overlayScene.children.length > 0) {
            this.renderer.autoClear = false;
            this.renderer.clearDepth();
            this.renderer.render(this.overlayScene, this.camera);
            this.renderer.autoClear = true;
        }
    }
}
