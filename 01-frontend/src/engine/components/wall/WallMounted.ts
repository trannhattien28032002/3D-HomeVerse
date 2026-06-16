import { Component } from "src/engine/ecs/Component";

/**
 * WallMounted — NGUỒN CHÂN LÝ kiểu topology cho đồ bám tường (giống WallNodes).
 *
 * Thay vì lưu vị trí XYZ tuyệt đối, lưu tham số bám tường:
 *   - hostWallId : wallId (bền vững) của bức tường đang bám.
 *   - t          : vị trí dọc TIM tường, 0..1 (0 = node start, 1 = node end).
 *   - side       : +1 / −1 — mặt tường vật áp vào (theo dấu pháp tuyến tường).
 *   - mountHeight: tâm-Y của vật (mét) so với sàn.
 *
 * WallMountSystem suy Transform (x,y,z,rotY) từ các tham số này + toạ độ node hiện
 * tại mỗi frame → khi node tường bị kéo, vật tự bám theo mà không cần cập nhật thủ công.
 */
export class WallMounted extends Component {
    hostWallId: string;
    t: number;
    side: number;
    mountHeight: number;

    constructor(hostWallId: string, t: number, side: number, mountHeight: number) {
        super();
        this.hostWallId = hostWallId;
        this.t = t;
        this.side = side;
        this.mountHeight = mountHeight;
    }
}
