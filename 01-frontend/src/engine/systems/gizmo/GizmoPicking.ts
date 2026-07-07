/**
 * GizmoPicking — nhánh INPUT→EVENT của GizmoSystem (Phase 5.4, tách đầu tiên vì độc lập nhất).
 *
 * Trách nhiệm: chuột trái → raycast phân giải pick (sàn/tường/furniture) → attach gizmo
 * hoặc phát event chọn; chuột phải → bỏ chọn. Không đụng state body-swap / drag — thuần
 * input. Sở hữu raycaster + mouse + 3 mảng scratch raycast (do mình tái dùng).
 */
import * as THREE from "three";
import { resolvePick } from "src/engine/systems/gizmo/gizmoHandles";
import { perfEnabled, perfMark } from "src/engine/rendering/perfProbe";
import type { GizmoContext } from "src/engine/systems/gizmo/gizmoContext";

export class GizmoPicking {
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private pickObjects: THREE.Object3D[] = [];
    /** Mesh tường để raycast chọn đổi material (tách khỏi furniture — không attach gizmo). */
    private wallPickObjects: THREE.Object3D[] = [];
    /** Mesh sàn phòng để raycast chọn đổi material sàn (ưu tiên thấp nhất). */
    private roomPickObjects: THREE.Object3D[] = [];

    private readonly ctx: GizmoContext;

    constructor(ctx: GizmoContext) {
        this.ctx = ctx;
    }

    onMouseDown = (event: MouseEvent): void => {
        // Chỉ chuột TRÁI mới chọn/thao tác. Chuột phải/giữa bỏ qua — bỏ chọn do
        // onContextMenu xử lý (tránh attach gizmo chớp nháy rồi lại detach).
        if (event.button !== 0) return;

        // attach/detach của TransformControls KHÔNG phát "change" → tự báo vẽ lại
        // để gizmo + viền chọn cập nhật ngay sau click.
        this.ctx.requestRender();

        // LW-03: listener gắn trên rendererDomElement nên event.target chính là canvas
        // (không có child) → dùng rect cache thay vì getBoundingClientRect() mỗi click.
        const rect = this.ctx.rectCache.get();

        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.ctx.camera);

        if (this.ctx.controls.dragging) return;

        // Mỗi click chỉ phát ĐÚNG MỘT sự kiện chọn — setSelected (phía UI) thay thế
        // toàn bộ selection nên không cần phát kèm null để dọn loại còn lại.
        const _t0 = perfEnabled() ? performance.now() : 0;
        const pick = resolvePick(this.raycaster, this.ctx.world, this.ctx.meshRegistry, {
            furniture: this.pickObjects,
            wall: this.wallPickObjects,
            room: this.roomPickObjects,
        });
        if (perfEnabled()) perfMark("resolvePick (click raycast)", performance.now() - _t0);

        switch (pick.kind) {
            case "none":
                this.ctx.controls.detach();
                this.ctx.events?.emit("entitySelected", { entityId: null });
                return;
            case "floor":
                this.ctx.controls.detach();
                this.ctx.events?.emit("floorSelected", { roomKey: pick.roomKey });
                return;
            case "wall":
                this.ctx.controls.detach();
                this.ctx.events?.emit("wallSelected", { wallId: pick.wallId });
                return;
            case "furniture":
                this.ctx.controls.attach(pick.attachTarget);
                this.ctx.applyGizmoAxes(pick.entityId);
                this.ctx.events?.emit("entitySelected", { entityId: pick.entityId });
                return;
        }
    };

    /** Chuột phải trên canvas → bỏ chọn mọi thứ + chặn menu ngữ cảnh trình duyệt. */
    onContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        if (this.ctx.controls.dragging) return;
        this.clearSelection();
    };

    /**
     * Bỏ chọn mọi thứ trong 3D: gỡ gizmo + phát 3 event null để dọn viền chọn
     * (SelectionHighlight) và đồng bộ store React (useEngineSelectionSync).
     * Dùng cho nút Screenshot và chuột phải.
     */
    clearSelection(): void {
        this.ctx.controls.detach();
        this.ctx.events?.emit("entitySelected", { entityId: null });
        this.ctx.events?.emit("wallSelected", { wallId: null });
        this.ctx.events?.emit("floorSelected", { roomKey: null });
        this.ctx.requestRender();
    }
}
