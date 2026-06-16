import { Component } from "src/engine/ecs/Component";

/**
 * FurnitureTag — đánh dấu entity là một món nội thất và gắn `modelId` (khoá catalog).
 * Dùng để phân biệt đồ với tường/sàn, và để serialization biết nạp lại model nào.
 */
export class FurnitureTag extends Component {
    readonly modelId: string;

    constructor(modelId: string) {
        super();
        this.modelId = modelId;
    }
}
