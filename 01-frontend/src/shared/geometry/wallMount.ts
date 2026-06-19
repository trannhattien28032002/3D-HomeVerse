/**
 * wallMount — NGUỒN CHÂN LÝ thuần (pure, world-space, mét) cho việc bám tường.
 *
 * Không phụ thuộc engine/THREE/React → unit-test dễ và dùng chung cho placement,
 * command handler, WallMountSystem. Quy ước:
 *   - Tham số `t` ∈ [0,1] chạy dọc TIM tường từ node start (A) tới node end (B).
 *   - `side` ∈ {+1,−1} chọn mặt tường (theo dấu pháp tuyến đơn vị n = rot90(u)).
 *   - rotY (three.js Y-rotation): trục +Z local của vật hướng RA NGOÀI mặt đã chọn,
 *     tức lưng (−Z) áp vào tường (đúng cho kệ); cửa nhúng giữa nên hướng nào cũng được.
 */

/** Một bức tường ở dạng đoạn tim + bề dày, kèm wallId bền vững. */
export interface MountWall {
    wallId: string;
    ax: number;
    az: number;
    bx: number;
    bz: number;
    thickness: number;
}

export interface MountTransform {
    /** Tâm vật theo X (world, mét). */
    x: number;
    /** Tâm vật theo Z (world, mét). */
    z: number;
    /** Yaw quanh trục Y (radian). */
    rotY: number;
}

const EPS = 1e-6;

function wallBasis(wall: MountWall): { len: number; ux: number; uz: number; nx: number; nz: number } {
    const dx = wall.bx - wall.ax;
    const dz = wall.bz - wall.az;
    const len = Math.hypot(dx, dz) || EPS;
    const ux = dx / len;
    const uz = dz / len;
    return { len, ux, uz, nx: -uz, nz: ux };
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Chiếu một điểm world (px,pz) lên một bức tường:
 *   - `t`    : vị trí dọc tim tường (đã clamp để nửa-rộng `halfWidth` không tràn 2 đầu).
 *   - `side` : mặt tường gần điểm hơn (+1/−1).
 *   - `fits` : true nếu tường đủ dài để chứa vật (len ≥ 2·halfWidth).
 */
export function projectPointToWall(
    wall: MountWall,
    px: number,
    pz: number,
    halfWidth: number,
): { t: number; side: number; fits: boolean } {
    const { len, ux, uz, nx, nz } = wallBasis(wall);
    const rx = px - wall.ax;
    const rz = pz - wall.az;
    const proj = rx * ux + rz * uz;
    const distN = rx * nx + rz * nz;
    const side = distN >= 0 ? 1 : -1;

    const minProj = halfWidth;
    const maxProj = len - halfWidth;
    const fits = maxProj >= minProj;
    const t = fits ? clamp(proj, minProj, maxProj) / len : 0.5;
    return { t, side, fits };
}

/**
 * Tính tâm XZ + yaw của vật từ tham số bám tường.
 * `offset` = khoảng dịch tâm theo pháp tuyến (mét), tính từ TIM tường về phía `side`:
 *   - kệ treo : offset = thickness + halfDepth + faceGap (lưng hở nửa-dày tường so với mặt).
 *   - cửa/cửa sổ: offset = 0 (vật nhúng giữa bề dày tường).
 */
export function mountTransform(
    wall: MountWall,
    t: number,
    side: number,
    offset: number,
): MountTransform {
    const { len, ux, uz, nx, nz } = wallBasis(wall);
    const px = wall.ax + ux * (t * len);
    const pz = wall.az + uz * (t * len);
    return {
        x: px + nx * side * offset,
        z: pz + nz * side * offset,
        rotY: Math.atan2(side * nx, side * nz),
    };
}

/**
 * Kích thước + kiểu bám của một wall-item, đã chuẩn-hoá khỏi engine (thuần, mét).
 *   - behavior "opening" : nhúng giữa bề dày tường (offset 0); đáy ở `sill`.
 *   - behavior "mount"   : treo ngoài mặt tường; tâm-Y ở `mountHeight`.
 * `depth` là bề sâu vuông góc tường (chọn 1 nguồn duy nhất ở engine — xem resolveWallItemDims);
 * `height` là chiều cao hiển thị (dùng suy `baseY` cho mount, và `centerY`).
 */
export interface WallItemDims {
    behavior: "opening" | "mount";
    depth: number;
    height: number;
    faceGap: number;
    sill: number;
    mountHeight: number;
}

export interface WallItemPose extends MountTransform {
    /** Cao độ đáy model so với sàn (mét). */
    baseY: number;
    /** Cao độ tâm model so với sàn (mét) = baseY + height/2. */
    centerY: number;
}

/**
 * Dịch tâm theo pháp tuyến tính từ TIM tường:
 *   - opening: 0 (nhúng giữa bề dày tường).
 *   - mount  : thickness + depth/2 + faceGap.
 *     Gồm 2 phần nửa-dày: `thickness/2` để ra tới MẶT tường, cộng `thickness/2` nữa làm
 *     KHE HỞ — nhờ vậy vật treo (kệ/tranh) không lấn sâu vào trong tường mà hở đúng
 *     nửa chiều dày tường so với mặt tường. `depth/2` đưa lưng vật về đúng vị trí; faceGap
 *     là tinh chỉnh thêm theo từng item (mặc định 0).
 */
export function wallItemOffset(thickness: number, d: WallItemDims): number {
    return d.behavior === "opening" ? 0 : thickness + d.depth / 2 + d.faceGap;
}

/** Cao độ đáy model: opening canh đáy ở `sill`; mount canh tâm ở `mountHeight` (đáy = mountHeight − height/2). */
export function wallItemBaseY(d: WallItemDims): number {
    return d.behavior === "opening" ? d.sill : d.mountHeight - d.height / 2;
}

/**
 * Pose đầy đủ của wall-item: gộp {@link mountTransform} (X/Z/yaw) với cao độ (baseY/centerY).
 * Nguồn chân lý DUY NHẤT cho cả spawn, ghost xem-trước, bám-tường mỗi-frame, và kéo gizmo.
 * Hệ chỉ chỉnh X/Z (WallMountSystem, slideWallItem) bỏ qua baseY/centerY.
 */
export function wallItemPose(wall: MountWall, t: number, side: number, d: WallItemDims): WallItemPose {
    const mt = mountTransform(wall, t, side, wallItemOffset(wall.thickness, d));
    const baseY = wallItemBaseY(d);
    return { x: mt.x, z: mt.z, rotY: mt.rotY, baseY, centerY: baseY + d.height / 2 };
}

// ---------------------------------------------------------------------------
// Remap wall-item khi tường host bị cắt (split)
// ---------------------------------------------------------------------------

/** Kết quả remap một wall-item khi tường host bị chia tại tỉ lệ tSplit. */
export interface WallItemSplitRemap {
    /** "first" = ở lại tường gốc (nửa đầu); "second" = chuyển sang tường mới (nửa sau). */
    half: "first" | "second";
    /** t mới (0..1) trên nửa tương ứng. */
    t: number;
}

/**
 * Remap `t` của wall-item khi tường host bị cắt tại tỉ lệ `tSplit` ∈ (0,1) dọc tim
 * tường GỐC. Vì `t` chuẩn-hoá theo chiều dài, split (giữ wallId cho nửa đầu, tạo
 * wallId mới cho nửa sau) làm `t` cũ trỏ sai chỗ — hàm này tính lại cho từng nửa:
 *   - item nửa đầu (t ≤ tSplit): giữ tường gốc, t' = t / tSplit.
 *   - item nửa sau (t > tSplit): chuyển tường mới, t' = (t − tSplit) / (1 − tSplit).
 *
 * Phân loại theo TÂM item. `tSplit` sát hai đầu (≤EPS hoặc ≥1−EPS) coi như không cắt
 * (giữ nguyên trên tường gốc) — caller hiếm khi gặp do guard EPS lúc tìm giao điểm.
 */
export function remapWallItemOnSplit(t: number, tSplit: number): WallItemSplitRemap {
    if (tSplit <= EPS || tSplit >= 1 - EPS) return { half: "first", t };
    return t <= tSplit
        ? { half: "first", t: t / tSplit }
        : { half: "second", t: (t - tSplit) / (1 - tSplit) };
}

/**
 * Remap `t` của wall-item khi tường host bị RESIZE (kéo 1 endpoint đổi chiều dài).
 *
 * Bảo toàn KHOẢNG CÁCH TUYỆT ĐỐI của item tới node KHÔNG di chuyển (node neo) —
 * khác với split (chuẩn-hoá theo tỉ lệ). Nhờ vậy kéo dài/co tường dọc trục thì cửa/kệ
 * đứng yên tuyệt đối; xoay tường quanh neo thì item xoay theo (hành vi cứng):
 *   - `movedEnd` = "end"   (neo = node start): d = t·lenOld giữ nguyên ⇒ t' = t·lenOld/lenNew.
 *   - `movedEnd` = "start" (neo = node end):   d = (1−t)·lenOld giữ nguyên ⇒ t' = 1 − (1−t)·lenOld/lenNew.
 *
 * Clamp t' về [halfWidthT, 1−halfWidthT] để item không tràn 2 đầu tường; nếu tường
 * ngắn hơn item (2·halfWidthT ≥ 1) → trả 0.5 (giữa, best-effort như projectPointToWall).
 * `halfWidthT` = (itemWidth/2)/lenNew (đơn vị t); truyền 0 để bỏ clamp theo bề rộng.
 *
 * Ổn định khi áp từng bước trong drag liên tục: mỗi bước giữ d bất biến ⇒ chuỗi bước
 * cũng giữ d. Áp dụng PER-WALL nên node junction (nhiều tường) remap độc lập từng tường.
 */
export function remapWallItemOnResize(
    t: number,
    movedEnd: "start" | "end",
    lenOld: number,
    lenNew: number,
    halfWidthT: number = 0,
): number {
    if (lenNew <= EPS || lenOld <= EPS) return t;
    const raw = movedEnd === "end"
        ? (t * lenOld) / lenNew
        : 1 - ((1 - t) * lenOld) / lenNew;
    const lo = halfWidthT;
    const hi = 1 - halfWidthT;
    if (lo >= hi) return 0.5;
    return clamp(raw, lo, hi);
}

// ---------------------------------------------------------------------------
// Overlap detection cho wall items dọc tim tường
// ---------------------------------------------------------------------------

/**
 * "Lane" occupancy của một wall-item dọc tim tường:
 *   - +1 / −1 : kệ/tranh treo CHỈ chiếm 1 mặt tường (theo `side`).
 *   - 0       : cửa/cửa sổ khoét XUYÊN bề dày → chiếm CẢ HAI mặt.
 * Tách "mặt vật áp vào" (side, luôn ±1 kể cả cửa để flip model) khỏi "lane chiếm chỗ".
 */
export function occupancyLane(behavior: "opening" | "mount", side: number): number {
    return behavior === "opening" ? 0 : side;
}

/**
 * Hai lane có xung đột chỗ không? Lane 0 (cả hai mặt) đụng MỌI lane; hai lane ±1
 * chỉ đụng khi cùng mặt → kệ mặt A và kệ mặt B (cùng t) KHÔNG xung đột.
 */
export function lanesConflict(a: number, b: number): boolean {
    return a === 0 || b === 0 || a === b;
}

/** Phạm vi t-range + lane mà một item chiếm trên tim tường. */
export interface WallItemRange {
    tMin: number;
    tMax: number;
    /** Lane occupancy (xem {@link occupancyLane}): +1/−1 một mặt, 0 = cả hai mặt. */
    lane: number;
}

/**
 * Kiểm tra item (lane `lane`) tại `t` ± `halfWidthT` có xung đột chỗ với range nào không.
 * `halfWidthT` = (item.width / 2) / wallLength — đơn vị t ∈ [0,1].
 * Xung đột ⇔ t-range chồng nhau VÀ lane tương thích ({@link lanesConflict}).
 *
 * NGUỒN CHÂN LÝ DUY NHẤT cho quy tắc xung đột wall-item — placement ghost (tô đỏ),
 * gizmo drag (chặn), MOVE_WALL_ITEM đều gọi qua đây để không fork logic.
 */
export function wallItemOverlaps(
    t: number,
    halfWidthT: number,
    lane: number,
    occupied: WallItemRange[],
): boolean {
    const ghostMin = t - halfWidthT;
    const ghostMax = t + halfWidthT;
    for (const r of occupied) {
        if (ghostMax > r.tMin + EPS && ghostMin < r.tMax - EPS && lanesConflict(lane, r.lane)) {
            return true;
        }
    }
    return false;
}

/**
 * Tính rotY của tường cho side = +1 (dùng để so sánh khi flip).
 * Không cần tính pose đầy đủ — chỉ cần hướng pháp tuyến.
 */
export function wallNaturalRotY(wall: MountWall): number {
    const { nx, nz } = wallBasis(wall);
    return Math.atan2(nx, nz);
}

// ---------------------------------------------------------------------------
// Kernel giải `t` cuối khi kéo wall-item (Phase 5.2)
// ---------------------------------------------------------------------------

/**
 * Clamp `t` về [minT, maxT]; tường ngắn hơn item (minT ≥ maxT) → 0.5 (giữa, best-effort,
 * cùng quy ước projectPointToWall khi không fit). NGUỒN DUY NHẤT cho clamp-biên wall-item:
 * 2D `projectToNearestWall` và nhánh "reject" của {@link resolveWallItemT} cùng gọi.
 */
export function clampWallItemT(t: number, minT: number, maxT: number): number {
    return minT < maxT ? clamp(t, minT, maxT) : 0.5;
}

/**
 * Clamp `t` sao cho khoảng (t − halfT, t + halfT) không cắt qua vùng occupied XUNG ĐỘT LANE.
 * Range khác lane (kệ mặt bên kia) bị bỏ qua → không đẩy item ra vô cớ.
 * Snap qua bên kia dựa vào vị trí tương đối của t so với tâm range — không snap lùi về phía cũ.
 * Nội bộ nhánh "snap" của {@link resolveWallItemT} (trước ở gizmoHandles).
 */
function clampTAgainstOccupied(t: number, halfT: number, lane: number, occupied: WallItemRange[]): number {
    for (const r of occupied) {
        if (!lanesConflict(lane, r.lane)) continue; // khác mặt → không cản
        const ghostMin = t - halfT;
        const ghostMax = t + halfT;
        if (ghostMax <= r.tMin || ghostMin >= r.tMax) continue; // không overlap
        const tMid = (r.tMin + r.tMax) / 2;
        // Snap qua bên kia tâm range theo hướng con trỏ đang tiến vào.
        t = t >= tMid ? r.tMax + halfT : r.tMin - halfT;
    }
    return t;
}

/** Chính sách khi `t` mong muốn đè item khác cùng lane. */
export type OverlapPolicy = "snap" | "reject";

export interface WallItemTResult {
    /** `t` cuối (đã clamp biên + theo policy). */
    t: number;
    /** Có còn đè item cùng lane tại `t` cuối không. */
    overlapping: boolean;
}

/**
 * Giải `t` cuối cho 1 tường + item từ `t` mong muốn — NGUỒN CHÂN LÝ chung cho cả 2 đường
 * (gizmo 3D, command). KHÔNG đọc World / KHÔNG đụng THREE → thuần số, test được.
 *
 *  - "snap"  : đẩy ra khỏi range cùng-lane (clampTAgainstOccupied) rồi clamp biên
 *              [minT,maxT]; `overlapping` tính tại `t` cuối (gizmo 3D — không bao giờ từ chối).
 *  - "reject": chỉ clamp biên ({@link clampWallItemT}, có fallback 0.5 khi tường ngắn);
 *              `overlapping` để caller tự quyết giữ/commit (command — giữ nguyên nếu đè).
 *
 * Lưu ý policy KHÁC NHAU CÓ CHỦ ĐÍCH (xem PHASE5 §5.2): snap không có fallback 0.5 vì
 * caller (slideWallItem) đã chặn bằng `fits=false` trước khi tới đây.
 */
export function resolveWallItemT(
    t: number,
    halfWidthT: number,
    minT: number,
    maxT: number,
    lane: number,
    occupied: WallItemRange[],
    policy: OverlapPolicy,
): WallItemTResult {
    if (policy === "snap") {
        const snapped = clampTAgainstOccupied(t, halfWidthT, lane, occupied);
        const finalT = clamp(snapped, minT, maxT);
        return { t: finalT, overlapping: wallItemOverlaps(finalT, halfWidthT, lane, occupied) };
    }
    const finalT = clampWallItemT(t, minT, maxT);
    return { t: finalT, overlapping: wallItemOverlaps(finalT, halfWidthT, lane, occupied) };
}
