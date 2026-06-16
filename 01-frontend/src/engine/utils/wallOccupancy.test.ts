/**
 * wallOccupancy.test — buildOccupiedRanges (truyền lane) + occupiedOverlaps
 * (delegate sang wallItemOverlaps, quy tắc lane-aware).
 */
import { describe, it, expect } from "vitest";
import { buildOccupiedRanges, occupiedOverlaps, findOverlappingWallItems, type WallItemOccupancy, type WallItemForOverlap } from "src/engine/utils/wallOccupancy";

describe("buildOccupiedRanges", () => {
    it("đổi {t, halfWidthT, lane} → {tMin, tMax, lane}", () => {
        const items: WallItemOccupancy[] = [{ t: 0.5, halfWidthT: 0.1, lane: -1 }];
        expect(buildOccupiedRanges(items)).toEqual([{ tMin: 0.4, tMax: 0.6, lane: -1 }]);
    });
});

describe("occupiedOverlaps (lane-aware)", () => {
    const ranges = buildOccupiedRanges([{ t: 0.5, halfWidthT: 0.1, lane: +1 }]);

    it("ứng viên cùng mặt, chồng t → xung đột", () => {
        expect(occupiedOverlaps(0.5, 0.1, +1, ranges)).toBe(true);
    });
    it("ứng viên khác mặt, chồng t → KHÔNG xung đột", () => {
        expect(occupiedOverlaps(0.5, 0.1, -1, ranges)).toBe(false);
    });
    it("ứng viên cửa (lane 0), chồng t → xung đột bất kể mặt range", () => {
        expect(occupiedOverlaps(0.5, 0.1, 0, ranges)).toBe(true);
    });
    it("ứng viên cùng mặt nhưng tách rời t → KHÔNG xung đột", () => {
        expect(occupiedOverlaps(0.1, 0.05, +1, ranges)).toBe(false);
    });
});

describe("findOverlappingWallItems (flag đỏ overlap sau resize/merge)", () => {
    const lens = new Map<string, number>([["w1", 4]]);

    it("2 cửa chồng t-range trên cùng tường → cả 2 bị flag", () => {
        const items: WallItemForOverlap[] = [
            { hostWallId: "w1", t: 0.40, width: 1.0, behavior: "opening", side: 1 }, // [0.275,0.525]
            { hostWallId: "w1", t: 0.50, width: 1.0, behavior: "opening", side: 1 }, // [0.375,0.625]
        ];
        expect(findOverlappingWallItems(items, lens)).toEqual(new Set([0, 1]));
    });

    it("2 cửa cách xa → không flag", () => {
        const items: WallItemForOverlap[] = [
            { hostWallId: "w1", t: 0.15, width: 0.8, behavior: "opening", side: 1 },
            { hostWallId: "w1", t: 0.85, width: 0.8, behavior: "opening", side: 1 },
        ];
        expect(findOverlappingWallItems(items, lens).size).toBe(0);
    });

    it("2 kệ chồng t nhưng KHÁC mặt tường → không xung đột", () => {
        const items: WallItemForOverlap[] = [
            { hostWallId: "w1", t: 0.5, width: 1.0, behavior: "mount", side: 1 },
            { hostWallId: "w1", t: 0.5, width: 1.0, behavior: "mount", side: -1 },
        ];
        expect(findOverlappingWallItems(items, lens).size).toBe(0);
    });

    it("cửa (lane 0) đụng kệ chồng t dù khác mặt", () => {
        const items: WallItemForOverlap[] = [
            { hostWallId: "w1", t: 0.5, width: 1.0, behavior: "opening", side: 1 },
            { hostWallId: "w1", t: 0.5, width: 1.0, behavior: "mount", side: -1 },
        ];
        expect(findOverlappingWallItems(items, lens)).toEqual(new Set([0, 1]));
    });

    it("item ở 2 tường khác nhau → không xét chéo tường", () => {
        const items: WallItemForOverlap[] = [
            { hostWallId: "w1", t: 0.5, width: 1.0, behavior: "opening", side: 1 },
            { hostWallId: "w2", t: 0.5, width: 1.0, behavior: "opening", side: 1 },
        ];
        expect(findOverlappingWallItems(items, new Map([["w1", 4], ["w2", 4]])).size).toBe(0);
    });

    it("thiếu length / chỉ 1 item → bỏ qua", () => {
        const single: WallItemForOverlap[] = [{ hostWallId: "w1", t: 0.5, width: 1, behavior: "opening", side: 1 }];
        expect(findOverlappingWallItems(single, lens).size).toBe(0);
        const noLen: WallItemForOverlap[] = [
            { hostWallId: "wX", t: 0.4, width: 1, behavior: "opening", side: 1 },
            { hostWallId: "wX", t: 0.5, width: 1, behavior: "opening", side: 1 },
        ];
        expect(findOverlappingWallItems(noLen, new Map()).size).toBe(0);
    });
});
