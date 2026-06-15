import { describe, it, expect } from "vitest";
import {
    projectPointToWall,
    mountTransform,
    wallItemOffset,
    wallItemBaseY,
    wallItemPose,
    remapWallItemOnSplit,
    remapWallItemOnResize,
    occupancyLane,
    lanesConflict,
    wallItemOverlaps,
    type MountWall,
    type WallItemDims,
    type WallItemRange,
} from "src/shared/geometry/wallMount";

/** Tường nằm dọc trục +X từ (0,0) tới (4,0), dày 0.2. Pháp tuyến đơn vị n = (0, 1). */
const wallX: MountWall = { wallId: "1", ax: 0, az: 0, bx: 4, bz: 0, thickness: 0.2 };

describe("projectPointToWall", () => {
    it("trả t theo tỉ lệ dọc thân tường", () => {
        const r = projectPointToWall(wallX, 2, 0.05, 0.4);
        expect(r.t).toBeCloseTo(0.5); // giữa tường
        expect(r.fits).toBe(true);
    });

    it("side dương khi điểm ở phía +normal, âm khi phía kia", () => {
        expect(projectPointToWall(wallX, 2, 0.5, 0.4).side).toBe(1);
        expect(projectPointToWall(wallX, 2, -0.5, 0.4).side).toBe(-1);
    });

    it("clamp t để nửa-rộng không tràn 2 đầu tường", () => {
        // halfWidth 0.4 trên tường dài 4 → t kẹp trong [0.1, 0.9].
        expect(projectPointToWall(wallX, -10, 0.1, 0.4).t).toBeCloseTo(0.1);
        expect(projectPointToWall(wallX, 99, 0.1, 0.4).t).toBeCloseTo(0.9);
    });

    it("fits=false khi tường ngắn hơn bề rộng vật", () => {
        const shortWall: MountWall = { wallId: "2", ax: 0, az: 0, bx: 0.5, bz: 0, thickness: 0.2 };
        expect(projectPointToWall(shortWall, 0.25, 0.1, 0.4).fits).toBe(false);
    });
});

describe("mountTransform", () => {
    it("kệ treo: dịch tâm ra ngoài mặt tường theo offset, đúng phía side", () => {
        // offset = thickness/2 + halfDepth + gap = 0.1 + 0.125 + 0 = 0.225
        const mt = mountTransform(wallX, 0.5, 1, 0.225);
        expect(mt.x).toBeCloseTo(2);        // giữa tường theo X
        expect(mt.z).toBeCloseTo(0.225);    // ra ngoài theo +normal
    });

    it("side âm đẩy vật về phía -normal", () => {
        const mt = mountTransform(wallX, 0.5, -1, 0.225);
        expect(mt.z).toBeCloseTo(-0.225);
    });

    it("cửa (offset=0) nằm trên tim tường", () => {
        const mt = mountTransform(wallX, 0.25, 1, 0);
        expect(mt.x).toBeCloseTo(1);
        expect(mt.z).toBeCloseTo(0);
    });

    it("yaw đối nghịch giữa hai mặt tường (lệch π)", () => {
        const a = mountTransform(wallX, 0.5, 1, 0.2).rotY;
        const b = mountTransform(wallX, 0.5, -1, 0.2).rotY;
        expect(Math.abs(Math.abs(a - b) - Math.PI)).toBeLessThan(1e-9);
    });
});

const mountDims: WallItemDims = {
    behavior: "mount", depth: 0.25, height: 0.3, faceGap: 0, sill: 0, mountHeight: 1.3,
};
const openingDims: WallItemDims = {
    behavior: "opening", depth: 0.12, height: 2.1, faceGap: 0, sill: 0, mountHeight: 0,
};

describe("wallItemOffset", () => {
    it("opening luôn 0 (nhúng giữa tim tường)", () => {
        expect(wallItemOffset(0.2, openingDims)).toBe(0);
    });
    it("mount = thickness + depth/2 + faceGap (hở nửa-dày tường ngoài mặt)", () => {
        expect(wallItemOffset(0.2, mountDims)).toBeCloseTo(0.2 + 0.125 + 0); // 0.325
        expect(wallItemOffset(0.2, { ...mountDims, faceGap: 0.05 })).toBeCloseTo(0.375);
    });
});

describe("wallItemBaseY", () => {
    it("opening canh đáy ở sill", () => {
        expect(wallItemBaseY({ ...openingDims, sill: 0.9 })).toBeCloseTo(0.9);
    });
    it("mount canh tâm ở mountHeight → đáy = mountHeight − height/2", () => {
        expect(wallItemBaseY(mountDims)).toBeCloseTo(1.3 - 0.15); // 1.15
    });
});

describe("wallItemPose", () => {
    it("mount: X/Z ra ngoài mặt tường theo offset, centerY = mountHeight", () => {
        const p = wallItemPose(wallX, 0.5, 1, mountDims);
        expect(p.x).toBeCloseTo(2);
        expect(p.z).toBeCloseTo(0.325);     // offset ra +normal (thickness + depth/2)
        expect(p.baseY).toBeCloseTo(1.15);
        expect(p.centerY).toBeCloseTo(1.3); // baseY + height/2 = tâm tại mountHeight
    });
    it("opening: nằm trên tim tường, đáy ở sill bất kể side", () => {
        const p = wallItemPose(wallX, 0.25, -1, { ...openingDims, sill: 0 });
        expect(p.x).toBeCloseTo(1);
        expect(p.z).toBeCloseTo(0);         // offset 0 → trên tim tường
        expect(p.baseY).toBeCloseTo(0);
        expect(p.centerY).toBeCloseTo(2.1 / 2);
    });
});

describe("remapWallItemOnSplit", () => {
    it("item nửa đầu (t ≤ tSplit): giữ tường gốc, t' = t / tSplit", () => {
        const r = remapWallItemOnSplit(0.25, 0.5);
        expect(r.half).toBe("first");
        expect(r.t).toBeCloseTo(0.5); // 0.25/0.5 — giữ nguyên vị trí TUYỆT ĐỐI trên nửa ngắn
    });

    it("item nửa sau (t > tSplit): chuyển tường mới, t' = (t − tSplit)/(1 − tSplit)", () => {
        const r = remapWallItemOnSplit(0.75, 0.5);
        expect(r.half).toBe("second");
        expect(r.t).toBeCloseTo(0.5); // (0.75-0.5)/0.5
    });

    it("item lệch tâm nửa sau remap đúng tỉ lệ", () => {
        const r = remapWallItemOnSplit(0.9, 0.5);
        expect(r.half).toBe("second");
        expect(r.t).toBeCloseTo(0.8); // (0.9-0.5)/0.5
    });

    it("biên t === tSplit thuộc nửa đầu (t' = 1.0)", () => {
        const r = remapWallItemOnSplit(0.5, 0.5);
        expect(r.half).toBe("first");
        expect(r.t).toBeCloseTo(1.0);
    });

    it("tSplit sát hai đầu → coi như không cắt, giữ nguyên t trên tường gốc", () => {
        expect(remapWallItemOnSplit(0.3, 1e-9)).toEqual({ half: "first", t: 0.3 });
        expect(remapWallItemOnSplit(0.3, 1 - 1e-9)).toEqual({ half: "first", t: 0.3 });
    });

    it("t mới luôn nằm trong [0,1] với mọi (t, tSplit) hợp lệ", () => {
        for (const tSplit of [0.2, 0.5, 0.8]) {
            for (const t of [0.05, 0.2, 0.5, 0.8, 0.95]) {
                const r = remapWallItemOnSplit(t, tSplit);
                expect(r.t).toBeGreaterThanOrEqual(0);
                expect(r.t).toBeLessThanOrEqual(1);
            }
        }
    });
});

describe("remapWallItemOnResize (giữ khoảng cách tuyệt đối tới node neo)", () => {
    it("kéo END dài gấp đôi: item bám node start giữ nguyên vị trí tuyệt đối (t' = t/2)", () => {
        // len 4 → 8, item ở t=0.5 (cách start 2m) phải vẫn cách start 2m ⇒ t' = 2/8 = 0.25
        expect(remapWallItemOnResize(0.5, "end", 4, 8)).toBeCloseTo(0.25);
    });

    it("kéo END co một nửa: t' = t·lenOld/lenNew (cách start bất biến)", () => {
        // len 4 → 2, item cách start 1m (t=0.25) ⇒ t' = 1/2 = 0.5
        expect(remapWallItemOnResize(0.25, "end", 4, 2)).toBeCloseTo(0.5);
    });

    it("kéo START: neo là node end, giữ khoảng cách tới end", () => {
        // len 4 → 8, item cách end (1-0.25)*4 = 3m ⇒ t' = 1 - 3/8 = 0.625
        expect(remapWallItemOnResize(0.25, "start", 4, 8)).toBeCloseTo(0.625);
    });

    it("clamp theo nửa-rộng để item không tràn đầu tường", () => {
        // halfWidthT = 0.2 ⇒ raw nhỏ bị kéo về 0.2
        expect(remapWallItemOnResize(0.02, "end", 10, 10, 0.2)).toBeCloseTo(0.2);
        expect(remapWallItemOnResize(0.99, "end", 10, 10, 0.2)).toBeCloseTo(0.8);
    });

    it("tường ngắn hơn item (2·halfWidthT ≥ 1) → trả 0.5 (best-effort)", () => {
        expect(remapWallItemOnResize(0.3, "end", 4, 1, 0.6)).toBeCloseTo(0.5);
    });

    it("lenNew/lenOld suy biến (≈0) → giữ nguyên t", () => {
        expect(remapWallItemOnResize(0.4, "end", 4, 1e-9)).toBeCloseTo(0.4);
        expect(remapWallItemOnResize(0.4, "end", 1e-9, 4)).toBeCloseTo(0.4);
    });

    it("rigid (lenNew == lenOld) → t bất biến cả 2 vai trò (cơ sở MOVE_NODES skip)", () => {
        // Tịnh tiến cứng: tường giữ nguyên chiều dài ⇒ remap là no-op dù role nào.
        for (const t of [0.1, 0.37, 0.5, 0.92]) {
            expect(remapWallItemOnResize(t, "end", 3.5, 3.5)).toBeCloseTo(t);
            expect(remapWallItemOnResize(t, "start", 3.5, 3.5)).toBeCloseTo(t);
        }
    });

    it("áp từng bước giữ khoảng cách tuyệt đối bất biến (ổn định khi drag)", () => {
        // start cố định, kéo end qua 3 bước: 4→5→7→6. Item cách start 1m (t0=0.25).
        let t = 0.25;
        t = remapWallItemOnResize(t, "end", 4, 5);
        t = remapWallItemOnResize(t, "end", 5, 7);
        t = remapWallItemOnResize(t, "end", 7, 6);
        expect(t * 6).toBeCloseTo(1); // khoảng cách tới start vẫn = 1m
    });
});

describe("occupancyLane", () => {
    it("opening → lane 0 (cả hai mặt) bất kể side", () => {
        expect(occupancyLane("opening", 1)).toBe(0);
        expect(occupancyLane("opening", -1)).toBe(0);
    });
    it("mount → lane = side", () => {
        expect(occupancyLane("mount", 1)).toBe(1);
        expect(occupancyLane("mount", -1)).toBe(-1);
    });
});

describe("lanesConflict", () => {
    it("lane 0 đụng mọi lane", () => {
        expect(lanesConflict(0, 0)).toBe(true);
        expect(lanesConflict(0, 1)).toBe(true);
        expect(lanesConflict(-1, 0)).toBe(true);
    });
    it("hai mặt ±1 chỉ đụng khi cùng mặt", () => {
        expect(lanesConflict(1, 1)).toBe(true);
        expect(lanesConflict(-1, -1)).toBe(true);
        expect(lanesConflict(1, -1)).toBe(false);
        expect(lanesConflict(-1, 1)).toBe(false);
    });
});

describe("wallItemOverlaps (xung đột = t-chồng VÀ lane tương thích)", () => {
    // Item rộng halfWidthT=0.1 quanh t.
    const r = (t: number, lane: number): WallItemRange => ({ tMin: t - 0.1, tMax: t + 0.1, lane });

    it("kệ mặt A vs kệ mặt B cùng t → KHÔNG xung đột", () => {
        expect(wallItemOverlaps(0.5, 0.1, +1, [r(0.5, -1)])).toBe(false);
    });
    it("kệ mặt A vs kệ mặt A đè nhau → xung đột", () => {
        expect(wallItemOverlaps(0.5, 0.1, +1, [r(0.5, +1)])).toBe(true);
    });
    it("kệ mặt A vs kệ mặt A tách rời t → KHÔNG xung đột", () => {
        expect(wallItemOverlaps(0.2, 0.1, +1, [r(0.8, +1)])).toBe(false);
    });
    it("cửa (lane 0) vs kệ mọi mặt cùng t → xung đột", () => {
        expect(wallItemOverlaps(0.5, 0.1, 0, [r(0.5, +1)])).toBe(true);
        expect(wallItemOverlaps(0.5, 0.1, 0, [r(0.5, -1)])).toBe(true);
    });
    it("kệ vs cửa (lane 0) cùng t → xung đột", () => {
        expect(wallItemOverlaps(0.5, 0.1, +1, [r(0.5, 0)])).toBe(true);
    });
    it("cửa vs cửa đè nhau → xung đột", () => {
        expect(wallItemOverlaps(0.5, 0.1, 0, [r(0.5, 0)])).toBe(true);
    });
});
