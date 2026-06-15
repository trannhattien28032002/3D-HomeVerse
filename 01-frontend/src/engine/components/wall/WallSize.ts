import { Component } from "src/engine/ecs/Component";

/**
 * WallSize — kích thước hiển thị của tường (chiều dài, chiều cao).
 *
 * Lưu ý: `thickness` được nhận ở options cho tương thích call-site nhưng KHÔNG
 * lưu ở đây — độ dày là nguồn sự thật duy nhất tại WallNodes.thickness.
 */
type WallSizeOptions = {
    length?: number;
    height?: number;
    thickness?: number; // accepted for call-site compat but NOT stored — use WallNodes.thickness
};

export class WallSize extends Component {
    length: number;
    height: number;

    constructor({
        length = 5,
        height = 3,
    }: WallSizeOptions = {}) {
        super();
        this.length = length;
        this.height = height;
    }
}