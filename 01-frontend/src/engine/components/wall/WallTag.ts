import { Component } from "src/engine/ecs/Component";

/**
 * WallTag — đánh dấu một entity là "bức tường" và gắn ID tường ổn định (wallId).
 *
 * wallId độc lập với entity ID của ECS: nó là định danh bền vững dùng trong
 * topology (NodeRegistry.connectedWallIds), serialization và lệnh undo/redo.
 */
export class WallTag extends Component {
    wallId: string;

    constructor(wallId: string) {
        super();
        this.wallId = wallId;
    }
}
