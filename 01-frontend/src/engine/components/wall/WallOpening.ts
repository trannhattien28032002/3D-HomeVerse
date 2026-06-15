import { Component } from "src/engine/ecs/Component";

/**
 * WallOpening — lỗ khoét trên tường cho cửa ra vào / cửa sổ.
 *
 *   - hostWallId : wallId (bền vững) của bức tường bị khoét.
 *   - t          : vị trí dọc TIM tường, 0..1 (0 = node start, 1 = node end).
 *   - width      : bề rộng lỗ (mét, dọc thân tường).
 *   - height     : chiều cao lỗ (mét).
 *   - sill       : độ cao mép dưới lỗ so với sàn (mét). Cửa đi = 0; cửa sổ > 0.
 *   - side       : mặt cửa hướng ra (+1 = pháp tuyến dương, −1 = pháp tuyến âm).
 *                  Dùng để flip model 180° — vị trí (x,z) không đổi vì offset = 0.
 *
 * Dùng cho hai mục đích:
 *   1. WallMountSystem suy Transform của model cửa từ (t, sill, side) như WallMounted.
 *   2. WallGeometrySystem gom WallOpening theo hostWallId rồi khoét tường bằng CSG.
 */
export class WallOpening extends Component {
    hostWallId: string;
    t: number;
    width: number;
    height: number;
    sill: number;
    /** Mặt cửa hướng ra: +1 = pháp tuyến dương, −1 = pháp tuyến âm (flip 180°). */
    side: number;

    constructor(hostWallId: string, t: number, width: number, height: number, sill: number, side: number = 1) {
        super();
        this.hostWallId = hostWallId;
        this.t = t;
        this.width = width;
        this.height = height;
        this.sill = sill;
        this.side = side;
    }
}

