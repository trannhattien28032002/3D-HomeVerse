import { Component } from "../ecs/Component";

/**
 * Gắn vào wall entity.
 * Thay vì lưu tọa độ trực tiếp, wall chỉ biết ID của 2 nodes.
 * WallGeometrySystem sẽ lookup NodeRegistry để lấy tọa độ thật.
 */
export class WallNodes extends Component {
    startNodeId: number;
    endNodeId: number;
    thickness: number;

    constructor(startNodeId: number, endNodeId: number, thickness: number) {
        super();
        this.startNodeId = startNodeId;
        this.endNodeId = endNodeId;
        this.thickness = thickness;
    }
}
