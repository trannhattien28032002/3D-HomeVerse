import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    snapCenterToGrid,
    resolveWallSnap,
    resolveNeighborSnap,
    resolveAlignment,
    type WallSegment,
    type FurnitureBox,
} from "src/shared/geometry/alignment";
import { WALL_SNAP_GAP_M, WALL_SNAP_TOL_M, SNAP_M, setSnapM } from "src/shared/constants/placement";

// Các test edge-snap dưới đây viết cho lưới 0.25 (giá trị SNAP_M cũ). Từ khi SNAP_M
// mặc định = 0.01 + grid chỉnh runtime qua setSnapM, ta pin lưới 0.25 để giữ nguyên
// intent gốc của assertion, rồi khôi phục mặc định sau mỗi test.
beforeEach(() => setSnapM(0.25));
afterEach(() => setSnapM(SNAP_M));

// Tường nằm dọc trục X từ (0,0) đến (4,0), bề dày 0.2 → 2 mặt tại z = ±0.1.
const wallAlongX: WallSegment = { ax: 0, az: 0, bx: 4, bz: 0, thickness: 0.2 };

describe("snapCenterToGrid (edge-snap)", () => {
    it("aligns the AABB edge to the grid for an axis-aligned box", () => {
        // box 0.8×0.8 (half 0.4). Mép −X/−Z phải rơi vào lưới.
        const r = snapCenterToGrid(0.5, 0.5, 0.4, 0.4, 0);
        expect(r.x).toBeCloseTo(0.4); // edge tại 0.0
        expect(r.z).toBeCloseTo(0.4);
        // mép (center − half) là bội số của SNAP_M
        expect((r.x - 0.4) % 0.25).toBeCloseTo(0);
    });
    it("is idempotent", () => {
        const a = snapCenterToGrid(1.37, -0.62, 0.4, 0.3, 0);
        const b = snapCenterToGrid(a.x, a.z, 0.4, 0.3, 0);
        expect(b.x).toBeCloseTo(a.x);
        expect(b.z).toBeCloseTo(a.z);
    });
});

describe("resolveWallSnap", () => {
    const tol = WALL_SNAP_TOL_M;
    const gap = WALL_SNAP_GAP_M;

    it("hugs furniture edge to the nearest wall face within tolerance", () => {
        // center z=0.6, box half 0.4 → mép tại 0.2, mặt tường tại 0.1, cách 0.1 < tol.
        const r = resolveWallSnap(2, 0.6, 0.4, 0.4, 0, [wallAlongX], tol, gap);
        // mép nên áp sát mặt + gap → center = 0.1 + 0.4 + gap.
        expect(r.z).toBeCloseTo(0.5 + gap);
        expect(r.x).toBeCloseTo(2); // không đổi theo phương dọc tường
        expect(r.guides).toHaveLength(1);
        expect(r.guides[0].kind).toBe("wall");
        expect(r.guides[0].z1).toBeCloseTo(0.1); // guide nằm trên mặt tường
    });

    it("does not snap when the edge is beyond tolerance", () => {
        const r = resolveWallSnap(2, 1.0, 0.4, 0.4, 0, [wallAlongX], tol, gap);
        expect(r.z).toBeCloseTo(1.0);
        expect(r.guides).toHaveLength(0);
    });

    it("does not snap when furniture is outside the wall span", () => {
        // x = 10 nằm ngoài đoạn [0,4] → không kê cạnh tường này.
        const r = resolveWallSnap(10, 0.6, 0.4, 0.4, 0, [wallAlongX], tol, gap);
        expect(r.z).toBeCloseTo(0.6);
        expect(r.guides).toHaveLength(0);
    });

    it("is OBB-aware: rotation changes the normal reach", () => {
        // Footprint 0.8 (X) × 0.4 (Z): hw=0.4, hd=0.2.
        // rotY=0 → reach theo pháp tuyến (Z) = hd = 0.2.
        const flat = resolveWallSnap(2, 0.4, 0.4, 0.2, 0, [wallAlongX], tol, gap);
        expect(flat.z).toBeCloseTo(0.1 + 0.2 + gap);
        // rotY=90° → cạnh dài (hw=0.4) quay về pháp tuyến → reach = 0.4.
        const turned = resolveWallSnap(2, 0.6, 0.4, 0.2, Math.PI / 2, [wallAlongX], tol, gap);
        expect(turned.z).toBeCloseTo(0.1 + 0.4 + gap);
    });

    it("snaps along the wall normal for an angled wall", () => {
        const diag: WallSegment = { ax: 0, az: 0, bx: 4, bz: 4, thickness: 0.2 };
        // Điểm gần mặt tường nghiêng (pháp tuyến (-1,1)/√2).
        const r = resolveWallSnap(2.0, 2.0, 0.3, 0.3, 0, [diag], tol, gap);
        // Có thể snap hoặc không tuỳ khoảng cách; nếu snap thì phải có guide.
        if (r.guides.length > 0) {
            // dịch chuyển nằm dọc pháp tuyến: Δx ≈ −Δz.
            const dx = r.x - 2.0;
            const dz = r.z - 2.0;
            expect(dx).toBeCloseTo(-dz, 5);
        }
    });
});

describe("resolveNeighborSnap", () => {
    const neighbor: FurnitureBox = { cx: 0, cz: 0, hw: 0.4, hd: 0.4, rotY: 0 };

    it("aligns flush to a neighbor edge within tolerance", () => {
        // self gần mép phải neighbor (x=0.8 = 0.4+0.4) và phủ theo Z.
        const r = resolveNeighborSnap(0.75, 0.0, 0.4, 0.4, 0, [neighbor], WALL_SNAP_TOL_M);
        expect(r.x).toBeCloseTo(0.8);
        expect(r.z).toBeCloseTo(0);
        expect(r.guides.length).toBeGreaterThanOrEqual(1);
        expect(r.guides[0].kind).toBe("neighbor");
    });

    it("does not align when beyond tolerance", () => {
        const r = resolveNeighborSnap(1.5, 0.0, 0.4, 0.4, 0, [neighbor], WALL_SNAP_TOL_M);
        expect(r.x).toBeCloseTo(1.5);
        expect(r.guides).toHaveLength(0);
    });
});

describe("resolveAlignment (integration)", () => {
    it("returns grid edge-snap when there are no walls", () => {
        const r = resolveAlignment({ cx: 0.5, cz: 0.5, hw: 0.4, hd: 0.4, rotY: 0, walls: [] });
        expect(r.x).toBeCloseTo(0.4);
        expect(r.z).toBeCloseTo(0.4);
        expect(r.guides).toHaveLength(0);
    });

    it("applies grid snap then wall override", () => {
        // cz=0.45 → edge-snap lưới về 0.4 (nằm gọn trong dung sai mặt tường),
        // sau đó wall-snap đẩy mép áp sát mặt → center = 0.1 + 0.4 + gap.
        const r = resolveAlignment({
            cx: 2.0, cz: 0.45, hw: 0.4, hd: 0.4, rotY: 0, walls: [wallAlongX],
        });
        expect(r.guides.length).toBeGreaterThanOrEqual(1);
        expect(r.z).toBeCloseTo(0.5 + WALL_SNAP_GAP_M);
    });
});
