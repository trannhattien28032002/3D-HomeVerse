/**
 * wallItemTopology — accessor đọc/ghi topology của wall-item bất kể opening/mount.
 *
 * Vì sao cần: nhiều call-site (slideWallItem, flipWallItemByGizmo, snapWallItemRotation,
 * handleMoveWallItem) đụng MỘT entity mà KHÔNG biết trước nó là cửa (WallOpening) hay kệ
 * (WallMounted) — phải lặp pattern `wo ? wo.x : wm?.x` và rải non-null `wm!` ở nhánh mount.
 * Gom về một chỗ DUY NHẤT còn `getComponent(WallOpening) ?? getComponent(WallMounted)`:
 *   - call-site đọc/ghi qua {@link getWallItemTopology}/{@link setWallItemTopology};
 *   - xoá được các `!` smell ở nhánh mount mà không giảm rõ ràng.
 *
 * KHÔNG đụng các site `wo!/wm!` nằm trong Query.entitiesWith(WallOpening|WallMounted) —
 * ở đó kiểu đã được Query bảo chứng (xem PHASE5 §5.1).
 *
 * Lưu ý hành vi: `side` trả về là side THẬT của component (±1, kể cả cửa dùng để flip
 * model). KHÔNG hard-code side=1 cho opening như describeScene — đó là quyết định riêng
 * của tầng AI, không gộp vào đây.
 */
import { World } from "src/engine/ecs/World";
import { WallOpening } from "src/engine/components/wall/WallOpening";
import { WallMounted } from "src/engine/components/wall/WallMounted";

export type WallItemKind = "opening" | "mount";

export interface WallItemTopology {
    kind: WallItemKind;
    hostWallId: string;
    t: number;
    side: number;
}

/** Đọc topology của 1 wall-item bất kể opening/mount; null nếu entity không phải wall-item. */
export function getWallItemTopology(world: World, entity: string): WallItemTopology | null {
    const wo = world.getComponent(entity, WallOpening);
    if (wo) return { kind: "opening", hostWallId: wo.hostWallId, t: wo.t, side: wo.side };
    const wm = world.getComponent(entity, WallMounted);
    if (wm) return { kind: "mount", hostWallId: wm.hostWallId, t: wm.t, side: wm.side };
    return null;
}

/**
 * Ghi t/side/hostWallId trở lại đúng component đang có (no-op nếu không phải wall-item).
 * Chỉ ghi các field được truyền trong `patch`.
 */
export function setWallItemTopology(
    world: World,
    entity: string,
    patch: Partial<Omit<WallItemTopology, "kind">>,
): void {
    const wo = world.getComponent(entity, WallOpening);
    const target = wo ?? world.getComponent(entity, WallMounted);
    if (!target) return;
    if (patch.hostWallId !== undefined) target.hostWallId = patch.hostWallId;
    if (patch.t !== undefined) target.t = patch.t;
    if (patch.side !== undefined) target.side = patch.side;
}
