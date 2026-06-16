import * as THREE from "three";
import type { CachedClientRect } from "src/shared/dom/cachedRect";

/**
 * PointerRotateTracker — rotate "vô-lăng": suy yaw từ GÓC CON TRỎ quanh tâm vật,
 * KHÔNG lấy từ quaternion của TransformControls (tránh đảo chiều khi kéo gần trọn
 * vòng — xem applyRotateCheck trong gizmoHandles).
 *
 * Cách dùng:
 *   trackPointer(clientX, clientY)  — nuôi vị trí con trỏ (gọi ở capture-phase pointermove)
 *   begin(object, startYaw)         — chốt mốc lúc bắt đầu drag rotate
 *   computeYaw(object)              — yaw thô cho frame hiện tại (đơn điệu, unwrap ±π)
 *
 * Trạng thái cộng dồn (accum/prev) là toán thuần — tách khỏi GizmoSystem để file
 * system gọn hơn và dễ kiểm thử riêng.
 */
export class PointerRotateTracker {
    /** Dấu chiều quay: +1 hoặc -1 (đổi nếu xoay ngược cảm giác mong đợi). */
    private static readonly POINTER_SIGN = -1;

    private readonly camera: THREE.Camera;
    /** rect canvas cache — angleAround() đọc mỗi frame khi rotate. */
    private readonly rectCache: CachedClientRect;

    /** Vị trí con trỏ mới nhất (clientX/clientY). */
    private readonly lastPointer = { x: 0, y: 0 };
    /** Yaw của vật lúc bắt đầu rotate-drag (radian). */
    private startYaw = 0;
    /** Góc con trỏ đo lần trước (radian) — để cộng dồn delta unwrap qua ±π. */
    private prevAngle = 0;
    /** Tổng góc con trỏ đã quay từ lúc bắt đầu (radian, đơn điệu). */
    private accumAngle = 0;
    private readonly _tmpWorldPos = new THREE.Vector3();

    constructor(camera: THREE.Camera, rectCache: CachedClientRect) {
        this.camera = camera;
        this.rectCache = rectCache;
    }

    /** Lưu vị trí con trỏ mới nhất (gọi ở capture-phase để cập nhật TRƯỚC objectChange). */
    trackPointer(clientX: number, clientY: number): void {
        this.lastPointer.x = clientX;
        this.lastPointer.y = clientY;
    }

    /** Chốt mốc lúc bắt đầu kéo: yaw gốc + góc con trỏ gốc làm mốc cộng dồn. */
    begin(object: THREE.Object3D, startYaw: number): void {
        this.startYaw = startYaw;
        this.accumAngle = 0;
        this.prevAngle = this.angleAround(object);
    }

    /**
     * Yaw thô (radian) cho frame hiện tại = yaw gốc + tổng góc con trỏ đã quay.
     * Delta mỗi frame được unwrap về [-π, π] rồi cộng dồn → đơn điệu, không đảo
     * dù kéo qua mốc ±π hay quay nhiều vòng.
     */
    computeYaw(object: THREE.Object3D): number {
        const ang = this.angleAround(object);
        let d = ang - this.prevAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        this.accumAngle += d;
        this.prevAngle = ang;
        return this.startYaw + PointerRotateTracker.POINTER_SIGN * this.accumAngle;
    }

    /**
     * Góc con trỏ hiện tại quanh tâm vật (đo trên màn hình, radian).
     * Chiếu world-position của object về pixel rồi atan2(dy, dx) so với con trỏ.
     */
    private angleAround(object: THREE.Object3D): number {
        object.getWorldPosition(this._tmpWorldPos);
        this._tmpWorldPos.project(this.camera); // → NDC
        const rect = this.rectCache.get();
        const cx = rect.left + (this._tmpWorldPos.x * 0.5 + 0.5) * rect.width;
        const cy = rect.top + (-this._tmpWorldPos.y * 0.5 + 0.5) * rect.height;
        return Math.atan2(this.lastPointer.y - cy, this.lastPointer.x - cx);
    }
}
