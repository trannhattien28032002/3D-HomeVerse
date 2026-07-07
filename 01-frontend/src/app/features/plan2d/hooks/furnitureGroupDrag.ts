/**
 * furnitureGroupDrag — toán THUẦN cho kéo/xoay NHÓM (multi-select) trong PlanView2D.
 *
 * Tách khỏi useFurnitureDrag (Phase 5.5, bước "viết unit trước khi chẻ"): các phép kiểm
 * va chạm tường của cụm là thuần dữ liệu (OBB px → SAT miter-poly), không đụng Konva/React
 * → unit-test được. Hook giữ phần imperative (đọc/ghi Konva node, refs) và gọi vào đây.
 *
 * Quy ước: toạ độ px Konva; `walls` là Wall2D (miter-poly) như collision2D.
 */
import { obbCorners, collidesWithWalls } from "src/app/components/editor/tools/collision2D";
import type { Wall2D } from "src/app/features/plan2d/types";

/** Một thành viên cụm tại gốc (px) + cỡ (px) + góc (Konva deg). */
export type GroupMember = {
    id: string;
    originX: number;
    originY: number;
    width: number;
    depth: number;
    rotDeg: number;
};

/** Một thành viên ở pose ỨNG VIÊN (px + góc) để kiểm tường sau khi xoay. */
export type GroupMemberPose = {
    x: number;
    y: number;
    width: number;
    depth: number;
    rotDeg: number;
};

/** Một thành viên có chạm tường tại pose cho trước không? (OBB px → SAT miter-poly). */
export function memberPoseHitsWall(pose: GroupMemberPose, walls: Wall2D[]): boolean {
    return collidesWithWalls(obbCorners(pose.x, pose.y, pose.width, pose.depth, pose.rotDeg), walls);
}

/**
 * Bất kỳ thành viên nào của cụm chạm tường khi dời theo delta (dx,dy) px?
 * Dùng cho group-move (phương án B: cụm rigid, CHẶN TƯỜNG mọi thành viên).
 */
export function groupHitsWall(members: GroupMember[], dx: number, dy: number, walls: Wall2D[]): boolean {
    for (const m of members) {
        if (memberPoseHitsWall({ x: m.originX + dx, y: m.originY + dy, width: m.width, depth: m.depth, rotDeg: m.rotDeg }, walls)) {
            return true;
        }
    }
    return false;
}
