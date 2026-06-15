import { Component } from "src/engine/ecs/Component";

/**
 * WallNodes — gắn vào wall entity, mô tả tường bằng *topology* thay vì toạ độ.
 *
 * Tường chỉ giữ ID của 2 node đầu/cuối + độ dày. WallGeometrySystem sẽ tra
 * NodeRegistry để lấy toạ độ thật rồi dựng hình. Nhờ vậy khi kéo một node,
 * mọi tường nối vào nó tự cập nhật mà không cần sửa từng tường.
 */
export class WallNodes extends Component {
    startNodeId: string;
    endNodeId: string;
    thickness: number;

    constructor(startNodeId: string, endNodeId: string, thickness: number) {
        super();
        this.startNodeId = startNodeId;
        this.endNodeId = endNodeId;
        this.thickness = thickness;
    }
}
