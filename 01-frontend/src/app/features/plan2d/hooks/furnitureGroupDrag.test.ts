/**
 * furnitureGroupDrag.test — toán thuần kéo/xoay nhóm (Phase 5.5).
 * collidesWithWalls chỉ đọc `w.polygon` (miter-poly px) → dựng Wall2D tối thiểu.
 */
import { describe, it, expect } from "vitest";
import { groupHitsWall, memberPoseHitsWall, type GroupMember } from "./furnitureGroupDrag";
import type { Wall2D } from "src/app/features/plan2d/types";

/** Wall2D tối thiểu: chỉ cần polygon (px) cho collidesWithWalls. */
function wall(polygon: { x: number; y: number }[]): Wall2D {
    return { polygon } as unknown as Wall2D;
}

/** Ô vuông tường (px) bao [minX,maxX]×[minY,maxY]. */
function squareWall(minX: number, minY: number, maxX: number, maxY: number): Wall2D {
    return wall([
        { x: minX, y: minY }, { x: maxX, y: minY },
        { x: maxX, y: maxY }, { x: minX, y: maxY },
    ]);
}

describe("memberPoseHitsWall", () => {
    const pose = { x: 100, y: 100, width: 40, depth: 40, rotDeg: 0 }; // spans 80..120

    it("chồng tường → true", () => {
        expect(memberPoseHitsWall(pose, [squareWall(110, 110, 200, 200)])).toBe(true);
    });
    it("tường ở xa → false", () => {
        expect(memberPoseHitsWall(pose, [squareWall(500, 500, 600, 600)])).toBe(false);
    });
    it("không có polygon → bỏ qua (false)", () => {
        expect(memberPoseHitsWall(pose, [wall([])])).toBe(false);
    });
});

describe("groupHitsWall", () => {
    const members: GroupMember[] = [
        { id: "a", originX: 100, originY: 100, width: 40, depth: 40, rotDeg: 0 },
        { id: "b", originX: 300, originY: 100, width: 40, depth: 40, rotDeg: 0 },
    ];
    const w = [squareWall(110, 110, 160, 160)]; // chỉ chạm vùng quanh (100..160)

    it("delta=0: thành viên 'a' đã chạm tường → true", () => {
        expect(groupHitsWall(members, 0, 0, w)).toBe(true);
    });
    it("dời cả cụm sang phải, ra khỏi tường → false", () => {
        expect(groupHitsWall(members, 400, 0, w)).toBe(false);
    });
    it("không tường → false", () => {
        expect(groupHitsWall(members, 0, 0, [])).toBe(false);
    });
});
