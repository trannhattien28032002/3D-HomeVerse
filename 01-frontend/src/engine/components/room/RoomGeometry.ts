import { Component } from "src/engine/ecs/Component";

/**
 * RoomGeometry — đa giác một căn phòng đã phát hiện (kết quả của RoomDetection).
 *
 * `points` là chu vi phòng theo toạ độ world XZ; `area` là diện tích (m²). Dùng
 * để tô nền phòng, hiển thị nhãn diện tích, và dựng sàn.
 */
export class RoomGeometry extends Component {
    points: { x: number; z: number }[];
    area: number;
    /** Khóa phòng bền (sorted nodeIds) — dùng để gắn material sàn qua rebuild topology. */
    key: string;

    constructor(points: { x: number; z: number }[], area: number, key: string = "") {
        super();
        this.points = points;
        this.area = area;
        this.key = key;
    }
}
