import { System } from "../ecs/System";
import { World } from "../ecs/World";
import { Query } from "../ecs/Query";

import { WallTag } from "../components/WallTag";
import { Transform } from "../components/Transform";
import { WallSize } from "../components/WallSize";

import { EngineEvents, type ECSSnapshot, type WallSnapshot } from "../events/EngineEvents";

/**
 * Chạy CUỐI CÙNG mỗi frame, sau tất cả các mutations.
 *
 * Thu thập dữ liệu tất cả wall entities (có WallTag + Transform + WallSize),
 * so sánh với frame trước. Nếu có thay đổi → emit snapshot để UI re-render.
 *
 * React không cần poll — nó chỉ subscribe và phản ứng khi có snapshot mới.
 */
export class SnapshotSystem extends System {
    private readonly events: EngineEvents;
    /** Checksum đơn giản để tránh emit khi data không đổi */
    private lastHash = "";

    constructor(events: EngineEvents) {
        super();
        this.events = events;
    }

    update(world: World): void {
        const entities = Query.entitiesWith(world, WallTag, Transform, WallSize);

        const walls: WallSnapshot[] = [];

        for (const e of entities) {
            const tag = world.getComponent(e, WallTag)!;
            const t   = world.getComponent(e, Transform)!;
            const s   = world.getComponent(e, WallSize)!;

            walls.push({
                wallId: tag.wallId,
                x:      t.x,
                y:      t.y,
                z:      t.z,
                w:      s.length,
                d:      s.thickness,
                rotY:   t.rotY,
            });
        }

        // Change detection — chỉ emit khi data thực sự thay đổi
        const hash = walls
            .map((w) =>
                `${w.wallId}:${w.x.toFixed(4)},${w.z.toFixed(4)},${w.w.toFixed(4)},${w.d.toFixed(4)},${w.rotY.toFixed(4)}`
            )
            .join("|");

        if (hash === this.lastHash) return;
        this.lastHash = hash;

        const snapshot: ECSSnapshot = { walls };
        this.events.emit("snapshot", snapshot);
    }
}
