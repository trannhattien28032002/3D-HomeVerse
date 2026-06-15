import { Component } from "src/engine/ecs/Component";

export type Point2D = { x: number; z: number };

/**
 * WallPolygon — hình chiếu mặt bằng (footprint) của tường dưới dạng tứ giác.
 *
 * Sau khi WallGeometrySystem tính toán góc nối (corner join), kết quả 4 đỉnh
 * được lưu ở đây để dựng mesh 3D và vẽ tường trong khung nhìn 2D.
 */
export class WallPolygon extends Component {
    // 4 điểm tạo nên đa giác bức tường (theo thứ tự để vẽ)
    // p1, p2: hai điểm ở đầu start
    // p3, p4: hai điểm ở đầu end
    points: [Point2D, Point2D, Point2D, Point2D];

    // Lưu lại chiều cao để dễ dàng build geometry
    height: number;

    constructor(points: [Point2D, Point2D, Point2D, Point2D], height: number = 1) {
        super();
        this.points = points;
        this.height = height;
    }
}
