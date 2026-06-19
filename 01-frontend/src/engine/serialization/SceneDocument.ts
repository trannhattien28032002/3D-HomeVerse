    /**
 * SceneDocument — định dạng file lưu trữ scene HomeVerse (.homeverseplan).
 *
 * Chỉ lưu topology (nodes + walls) — KHÔNG lưu mesh, material, hay render state.
 * Toàn bộ geometry được ECS systems tái tạo sau khi deserialize.
 *
 * Phiên bản hiện tại: v1. Bump version khi có breaking change, viết migration function.
 *
 * Quy tắc thiết kế:
 *  - `version` là literal phân biệt (discriminated) để hàm migration switch theo nó.
 *  - Chỉ lưu topology (nodes + walls). Mọi geometry được ECS tái tạo qua pipeline
 *    system bình thường sau khi deserialize.
 *  - Không lưu mesh, không material, không render state.
 *  - Thêm field optional MỚI trong CÙNG version nếu vẫn tương thích ngược.
 *    Chỉ bump version khi có breaking change; kèm hàm migration.
 */

// ── Node record ───────────────────────────────────────────────────────────────

export type SceneNodeRecord = {
    /** ID uuid ổn định — phải duy nhất trong document. */
    id: string;
    /** Vị trí X world-space (mét). */
    x: number;
    /** Vị trí Z world-space (mét). */
    z: number;
};

// ── Wall record ───────────────────────────────────────────────────────────────

export type SceneWallRecord = {
    /** ID tường uuid ổn định — phải duy nhất trong document. */
    wallId: string;
    /** ID node đầu — phải tồn tại trong mảng nodes. */
    startNodeId: string;
    /** ID node cuối — phải tồn tại trong mảng nodes. */
    endNodeId: string;
    /** Độ dày tường (mét, ví dụ 0.15). */
    thickness: number;
    /** Chiều cao tường (mét, ví dụ 3.2). */
    height: number;
    /**
     * Material PBR áp lên CẢ tường (file cũ, 1 material). Optional, đọc-back-compat:
     * khi nạp, map thành cả 2 mặt. Không còn ghi mới — dùng `materialFaces`.
     * @deprecated thay bằng materialFaces
     */
    material?: string;
    /** Material PBR RIÊNG từng mặt tường (left/right → materials.json id). Optional. */
    materialFaces?: { left?: string; right?: string };
};

// ── Furniture record ───────────────────────────────────────────────────────────

export type SceneFurnitureRecord = {
    /** Model ID trong catalog — phải khớp một key trong FurnitureCatalog. */
    modelId: string;
    /** Vị trí X world-space (mét). */
    x: number;
    /**
     * Vị trí Y world-space (mét) — tâm-AABB theo chiều cao. Optional, tương thích
     * ngược: file cũ không có → factory tự đặt đồ đứng trên sàn (sy/2). Lưu khi đồ
     * được kê cao / treo (gizmo kéo trục Y) để giữ độ cao qua save/reload.
     */
    y?: number;
    /** Vị trí Z world-space (mét). */
    z: number;
    /** Góc yaw (radian) quanh trục world-Y. */
    rotY: number;
    /** Material đã chọn cho từng slot: slotId → materialId (materials.json). Optional. */
    materials?: Record<string, string>;
};

// ── Wall-item record (đồ bám tường: kệ treo, cửa, cửa sổ) ───────────────────────

export type SceneWallItemRecord = {
    /** Model ID trong catalog — phải khớp một key trong FurnitureCatalog. */
    modelId: string;
    /** wallId của bức tường đang bám — phải khớp một wall trong document. */
    hostWallId: string;
    /** Vị trí dọc tim tường (0..1). */
    t: number;
    /** Mặt tường (+1/−1) — lật model 180°. Áp cho cả kệ (mount) lẫn cửa/cửa sổ (opening). */
    side: number;
    /** Material đã chọn cho từng slot: slotId → materialId (materials.json). Optional. */
    materials?: Record<string, string>;
};

// ── Document root ─────────────────────────────────────────────────────────────

export type SceneDocument = {
    /** Phiên bản schema — luôn là literal 1 với shape này. */
    version: 1;
    nodes: SceneNodeRecord[];
    walls: SceneWallRecord[];
    /** Optional — file lưu cũ không có (khi nạp coi như danh sách rỗng). */
    furniture?: SceneFurnitureRecord[];
    /** Optional — đồ bám tường. File cũ không có → danh sách rỗng. */
    wallItems?: SceneWallItemRecord[];
    /**
     * Material sàn theo roomKey (sorted nodeIds) → materialId (materials.json).
     * Optional — phòng không có uuid bền nên dùng roomKey. File cũ không có.
     */
    floors?: Record<string, string>;
};

// ── Chuẩn bị cho tương lai ──────────────────────────────────────────────────────

/**
 * Union của mọi phiên bản document đã biết.
 * Khi thêm version 2, bổ sung `| SceneDocumentV2` ở đây và viết hàm
 * migrateV1toV2(doc: SceneDocument): SceneDocumentV2 trong migrations.ts.
 */
export type AnySceneDocument = SceneDocument;
