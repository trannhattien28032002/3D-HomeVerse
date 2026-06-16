/**
 * WallOpeningPreview — preview CSG tường khi kéo/đặt Door/Window.
 *
 * Chiến lược 2-bước để giữ chi phí CSG/frame = O(1) evaluate():
 *
 *   begin(wallMesh, poly, height, wall, existingOpenings)
 *     → pre-compute  baseGeo = wall − old_holes  (1 lần duy nhất)
 *
 *   update(ghostOpening)
 *     → previewGeo = baseGeo − ghost_hole        (1 evaluate() mỗi mousemove)
 *     → throttle: chỉ chạy khi |Δt| > T_THRESHOLD
 *
 *   hide()    → ẩn previewMesh, restore wall thật
 *   dispose() → dọn geometry + mesh, restore wall thật
 *
 * previewMesh KHÔNG tham gia collision — chỉ dùng để hiển thị.
 */
import * as THREE from "three";
import { Evaluator, Brush, SUBTRACTION } from "three-bvh-csg";

import { buildExtrudeGeo } from "src/engine/systems/wall/wallMeshBuilder";
import type { Point2D } from "src/engine/components/wall/WallPolygon";
import type { MountWall } from "src/shared/geometry/wallMount";
import type { OpeningCut } from "src/engine/systems/wall/wallOpeningCutter";

/** Ngưỡng Δt tối thiểu để trigger lại CSG preview. */
const T_THRESHOLD = 0.008;

/** Evaluator dùng chung trong module — tránh tạo lại mỗi lần. */
const _evaluator = new Evaluator();
_evaluator.useGroups = false;

export class WallOpeningPreview {
    private readonly scene: THREE.Scene;

    /** Mesh tạm hiển thị preview — geometry thay đổi mỗi lần update(). */
    private previewMesh: THREE.Mesh | null = null;

    /**
     * Geometry tường đã trừ các lỗ cũ (pre-computed 1 lần khi begin()).
     * Làm operand A cho CSG mỗi mousemove.
     */
    private baseGeo: THREE.BufferGeometry | null = null;

    /** Wall mesh thật đang bị ẩn khi preview hiển thị. */
    private activeWallMesh: THREE.Mesh | null = null;

    /** Thông số tường (cần để tính tâm lỗ ghost mỗi update). */
    private wall: MountWall | null = null;

    /**
     * offsetY dùng nhất quán với wallOpeningCutter.ts:
     * Y ∈ [-h/2, +h/2] → RenderSystem nâng position.y = height/2.
     */
    private offsetY = 0;

    /** t của lần update() cuối — dùng để throttle. */
    private lastT: number | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    // -----------------------------------------------------------------------

    /**
     * Bắt đầu phiên preview cho một bức tường.
     * Pre-compute baseGeo = wall − existingOpenings (chạy 1 lần duy nhất).
     *
     * @param wallMesh          Mesh tường thật (sẽ bị ẩn khi preview hiện).
     * @param poly              Polygon tường (world-space XZ).
     * @param height            Chiều cao tường (mét).
     * @param wall              Thông số vị trí/hướng/độ dày tường.
     * @param existingOpenings  Các lỗ đã commit trên tường này (không tính ghost).
     */
    begin(
        wallMesh: THREE.Mesh,
        poly: Point2D[],
        height: number,
        wall: MountWall,
        existingOpenings: OpeningCut[],
    ): void {
        this.dispose(); // dọn phiên cũ nếu còn

        this.activeWallMesh = wallMesh;
        this.wall = wall;
        this.offsetY = height / 2; // khớp quy ước WorldSpaceMesh (wallOpeningCutter.ts:45)
        this.lastT = null;

        // Pre-compute baseGeo = wall − old_holes.
        this.baseGeo = this.buildBaseGeo(poly, height, existingOpenings);

        // previewMesh dùng chung material với wall thật (không clone — chỉ hiển thị).
        const mat = Array.isArray(wallMesh.material)
            ? wallMesh.material[0]
            : wallMesh.material;
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        // Kế thừa transform của wall thật (RenderSystem đặt position.y = height/2).
        mesh.position.copy(wallMesh.position);
        mesh.rotation.copy(wallMesh.rotation);
        mesh.visible = false;
        this.scene.add(mesh);
        this.previewMesh = mesh;
    }

    // -----------------------------------------------------------------------

    /**
     * Cập nhật preview với vị trí ghost mới.
     * Throttle: bỏ qua nếu |t − lastT| ≤ T_THRESHOLD.
     *
     * @param ghostOpening  Thông số lỗ ghost (t, width, height, sill).
     */
    update(ghostOpening: OpeningCut): void {
        const preview = this.previewMesh;
        const base = this.baseGeo;
        const wallMesh = this.activeWallMesh;
        const wall = this.wall;
        if (!preview || !base || !wallMesh || !wall) return;

        // Throttle.
        if (
            this.lastT !== null &&
            Math.abs(ghostOpening.t - this.lastT) < T_THRESHOLD
        ) {
            // Đảm bảo trạng thái hiển thị luôn đúng kể cả khi throttle.
            if (!preview.visible) {
                preview.visible = true;
                wallMesh.visible = false;
            }
            return;
        }
        this.lastT = ghostOpening.t;

        // Tính hướng tường và tâm lỗ ghost.
        const dx = wall.bx - wall.ax;
        const dz = wall.bz - wall.az;
        const len = Math.hypot(dx, dz) || 1e-6;
        const ux = dx / len;
        const uz = dz / len;
        const yaw = Math.atan2(-uz, ux);

        const cx = wall.ax + ux * (ghostOpening.t * len);
        const cz = wall.az + uz * (ghostOpening.t * len);

        // Cutter box cho lỗ ghost — primitive Box (tối ưu nhất cho CSG).
        const holeGeo = new THREE.BoxGeometry(
            ghostOpening.width,
            ghostOpening.height,
            wall.thickness * 1.4,
        );
        const holeBrush = new Brush(holeGeo);
        holeBrush.position.set(
            cx,
            ghostOpening.sill + ghostOpening.height / 2 - this.offsetY,
            cz,
        );
        holeBrush.rotation.y = yaw;
        holeBrush.updateMatrixWorld();

        const baseBrush = new Brush(base);
        baseBrush.updateMatrixWorld();

        // 1 evaluate() duy nhất mỗi update().
        const result = _evaluator.evaluate(baseBrush, holeBrush, SUBTRACTION);
        holeGeo.dispose();

        // Gán geometry mới, dispose geometry preview cũ (nhưng không dispose baseGeo).
        const oldGeo = preview.geometry;
        preview.geometry = result.geometry;
        if (oldGeo !== base && oldGeo.attributes.position) {
            oldGeo.dispose();
        }

        // Show preview, hide wall thật.
        preview.visible = true;
        wallMesh.visible = false;
    }

    // -----------------------------------------------------------------------

    /**
     * Ẩn preview và restore wall thật.
     * Gọi khi ghost rời tường hoặc vị trí không hợp lệ.
     */
    hide(): void {
        if (this.previewMesh) this.previewMesh.visible = false;
        if (this.activeWallMesh) this.activeWallMesh.visible = true;
        this.lastT = null;
    }

    // -----------------------------------------------------------------------

    /**
     * Dọn toàn bộ tài nguyên và restore wall thật.
     * Gọi khi kết thúc phiên placement (confirm hoặc cancel).
     */
    dispose(): void {
        this.hide();

        if (this.previewMesh) {
            this.scene.remove(this.previewMesh);
            // Dispose geometry của previewMesh (nếu khác baseGeo).
            if (this.previewMesh.geometry !== this.baseGeo) {
                this.previewMesh.geometry.dispose();
            }
            this.previewMesh = null;
        }

        if (this.baseGeo) {
            this.baseGeo.dispose();
            this.baseGeo = null;
        }

        this.activeWallMesh = null;
        this.wall = null;
        this.lastT = null;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Tính baseGeo = wall − existingOpenings.
     * Nếu không có lỗ cũ, trả về geometry tường đặc.
     * offsetY = height / 2 (khớp quy ước WorldSpaceMesh).
     */
    private buildBaseGeo(
        poly: Point2D[],
        height: number,
        existingOpenings: OpeningCut[],
    ): THREE.BufferGeometry {
        const wall = this.wall!;
        const offsetY = this.offsetY;
        const baseGeoRaw = buildExtrudeGeo(poly, height, offsetY);

        if (existingOpenings.length === 0) return baseGeoRaw;

        const dx = wall.bx - wall.ax;
        const dz = wall.bz - wall.az;
        const len = Math.hypot(dx, dz) || 1e-6;
        const ux = dx / len;
        const uz = dz / len;
        const yaw = Math.atan2(-uz, ux);

        let resultBrush = new Brush(baseGeoRaw);
        resultBrush.updateMatrixWorld();

        const intermediates: THREE.BufferGeometry[] = [];

        for (const op of existingOpenings) {
            const cx = wall.ax + ux * (op.t * len);
            const cz = wall.az + uz * (op.t * len);

            const holeGeo = new THREE.BoxGeometry(
                op.width,
                op.height,
                wall.thickness * 1.4,
            );
            const hole = new Brush(holeGeo);
            hole.position.set(cx, op.sill + op.height / 2 - offsetY, cz);
            hole.rotation.y = yaw;
            hole.updateMatrixWorld();

            const next = _evaluator.evaluate(resultBrush, hole, SUBTRACTION);
            holeGeo.dispose();
            intermediates.push(resultBrush.geometry);
            resultBrush = next;
        }

        const out = resultBrush.geometry;
        for (const g of intermediates) g.dispose();
        return out;
    }
}
