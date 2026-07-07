// @vitest-environment jsdom
/**
 * useFloorPlanSnapshot.test — test hành vi thật của adapter world→pixel + invariant
 * quan trọng nhất mà báo cáo review nêu tên (BAO-CAO-REVIEW-DA-CHIEU.md §SOLID):
 * "hợp đồng ngầm về array identity" — 7 `useMemo` phụ thuộc `snap?.nodes/walls/...`
 * (eslint-disable react-hooks/exhaustive-deps) CHỈ recompute khi collection con đó
 * đổi reference, KHÔNG phải khi cả object `snap` đổi. Test này khẳng định invariant
 * đó bằng cách bơm snapshot mới với walls CÙNG reference nhưng furniture KHÁC reference.
 *
 * Dựng engine giả tối thiểu qua EngineContext.Provider thật (không mock module) —
 * `api.events` là 1 EngineEvents() thật (xem src/engine/events/EngineEvents.ts),
 * nên `.on("snapshot", cb)` / `.emit("snapshot", data)` hoạt động y hệt runtime thật.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useFloorPlanSnapshot } from "src/app/store/useFloorPlanSnapshot";
import { EngineContext } from "src/app/engineBinding/EngineContext";
import { EngineEvents, type ECSSnapshot } from "src/engine/events/EngineEvents";
import type { EngineInstance } from "src/engine/engineTypes";

function makeEngine(): { engine: EngineInstance; events: EngineEvents } {
    const events = new EngineEvents();
    const engine = { api: { events } } as unknown as EngineInstance;
    return { engine, events };
}

function emptySnapshot(overrides: Partial<ECSSnapshot> = {}): ECSSnapshot {
    return {
        nodes: [],
        walls: [],
        caps: [],
        rooms: [],
        dimensions: [],
        angleDimensions: [],
        furniture: [],
        ...overrides,
    };
}

describe("useFloorPlanSnapshot", () => {
    it("trả về collection rỗng khi chưa có engine (null) hoặc chưa có snapshot nào", () => {
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(EngineContext.Provider, { value: null }, children);

        const { result } = renderHook(() => useFloorPlanSnapshot(800, 600), { wrapper });

        expect(result.current.nodes).toEqual([]);
        expect(result.current.walls).toEqual([]);
        expect(result.current.rooms).toEqual([]);
    });

    it("chuyển đổi world→pixel đúng: node, wall.polygon, room centroid (PX_PER_WORLD=100, ox=vpW/2, oy=vpH/2)", () => {
        const { engine, events } = makeEngine();
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(EngineContext.Provider, { value: engine }, children);

        const { result } = renderHook(() => useFloorPlanSnapshot(800, 600), { wrapper });

        act(() => {
            events.emit("snapshot", emptySnapshot({
                nodes: [{ id: "n1", x: 1, z: 2 }],
                walls: [{
                    wallId: "w1", startNodeId: "n1", endNodeId: "n2",
                    thickness: 0.2, height: 2.4, cx: 0, cz: 0,
                    polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }],
                }],
                rooms: [{
                    id: "r1", key: "r1key", area: 12,
                    polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
                }],
            }));
        });

        // ox=400, oy=300 (vpW/2, vpH/2). nodeToPx: x*100+ox, z*100+oy (KHÔNG flip trục).
        expect(result.current.nodes).toEqual([{ id: "n1", x: 500, y: 500 }]);

        expect(result.current.walls).toHaveLength(1);
        expect(result.current.walls[0].polygon).toEqual([
            { x: 400, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 400 }, { x: 400, y: 400 },
        ]);

        expect(result.current.rooms).toHaveLength(1);
        const room = result.current.rooms[0];
        // Hình chữ nhật đối xứng → centroid = trung điểm 4 góc px (400,300)-(800,600).
        expect(room.centroidX).toBeCloseTo(600);
        expect(room.centroidY).toBeCloseTo(450);
        expect(room.label).toBe("12 m²"); // area >= 10 → làm tròn, không thập phân
    });

    it("INVARIANT: bơm snapshot mới với walls CÙNG reference → hook trả CÙNG reference (memo hit)", () => {
        const { engine, events } = makeEngine();
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(EngineContext.Provider, { value: engine }, children);

        const { result } = renderHook(() => useFloorPlanSnapshot(800, 600), { wrapper });

        const sharedWalls = [{
            wallId: "w1", startNodeId: "n1", endNodeId: "n2",
            thickness: 0.2, height: 2.4, cx: 0, cz: 0,
        }];
        const furnitureA = [{ entityId: "f1", modelId: "chair", x: 0, z: 0, rotY: 0, width: 0.5, depth: 0.5, topDownUrl: undefined }];

        act(() => {
            events.emit("snapshot", emptySnapshot({ walls: sharedWalls, furniture: furnitureA }));
        });
        const wallsRef1 = result.current.walls;
        const furnitureRef1 = result.current.furniture;

        const furnitureB = [{ entityId: "f2", modelId: "table", x: 1, z: 1, rotY: 0, width: 0.8, depth: 0.8, topDownUrl: undefined }];

        act(() => {
            // walls: CÙNG reference sharedWalls. furniture: reference MỚI (furnitureB).
            events.emit("snapshot", emptySnapshot({ walls: sharedWalls, furniture: furnitureB }));
        });
        const wallsRef2 = result.current.walls;
        const furnitureRef2 = result.current.furniture;

        // walls không đổi reference ở input → useMemo([snap?.walls, ox, oy]) memo HIT → cùng output reference.
        expect(wallsRef2).toBe(wallsRef1);
        // furniture đổi reference ở input → memo MISS → output reference MỚI.
        expect(furnitureRef2).not.toBe(furnitureRef1);
        expect(furnitureRef2[0].entityId).toBe("f2");
    });

    it("INVARIANT (đối chứng): bơm walls MỚI reference dù nội dung giống hệt → memo MISS (output reference mới)", () => {
        const { engine, events } = makeEngine();
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(EngineContext.Provider, { value: engine }, children);

        const { result } = renderHook(() => useFloorPlanSnapshot(800, 600), { wrapper });

        const wallShape = {
            wallId: "w1", startNodeId: "n1", endNodeId: "n2",
            thickness: 0.2, height: 2.4, cx: 0, cz: 0,
        };

        act(() => { events.emit("snapshot", emptySnapshot({ walls: [wallShape] })); });
        const wallsRef1 = result.current.walls;

        act(() => { events.emit("snapshot", emptySnapshot({ walls: [{ ...wallShape }] })); }); // nội dung giống, reference mới
        const wallsRef2 = result.current.walls;

        expect(wallsRef2).not.toBe(wallsRef1); // đúng như thiết kế: identity, không deep-equal
        expect(wallsRef2).toEqual(wallsRef1);  // nhưng nội dung vẫn khớp
    });
});
