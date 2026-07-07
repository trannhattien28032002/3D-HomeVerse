/**
 * roundtrip.test.ts — round-trip test cho serialize.ts + deserialize.ts (B1 trong
 * BAO-CAO-REVIEW-DA-CHIEU.md). Trước phiên này, `engine/serialization` (~27KB, code
 * chạm tính toàn vẹn dữ liệu lưu/tải scene) không có unit test FE nào.
 *
 * Chiến lược: thay vì hand-craft một `SceneDocument` JSON rồi so sánh chuỗi ("giống
 * hệt" rất dễ vỡ vì serializeScene luôn chuẩn hoá field optional — vd `furniture: []`
 * thay vì `undefined`), ta dựng scene TRÊN engine 1 qua dispatch (đường đi thật của
 * app), lấy `docA = serializeScene(engine1)`, nạp `docA` vào engine 2 SẠCH qua
 * `deserializeScene`, rồi lấy `docB = serializeScene(engine2)`. `docA` đã ở dạng
 * chuẩn hoá (output thật của serializeScene) nên `docA` chính là "document gốc" hợp
 * lệ để so — `expect(docB).toEqual(docA)` xác nhận deserialize→serialize là fixed
 * point (không mất/méo dữ liệu qua một vòng lưu/tải).
 */
import { describe, it, expect } from "vitest";

import { serializeScene } from "src/engine/serialization/serialize";
import { deserializeScene } from "src/engine/serialization/deserialize";
import { buildTestEngine, controllableGltfLoader } from "./testEngine";

describe("serialize/deserialize round-trip", () => {
    it("empty scene round-trips to itself", async () => {
        const t1 = buildTestEngine();
        const docA = serializeScene(t1.engine);
        expect(docA).toEqual({ version: 1, nodes: [], walls: [], furniture: [], wallItems: [] });

        const t2 = buildTestEngine();
        await deserializeScene(docA, t2.engine);
        const docB = serializeScene(t2.engine);

        expect(docB).toEqual(docA);
    });

    it("nodes + walls (thickness/height + per-face material) round-trip", async () => {
        const t1 = buildTestEngine();
        const { dispatch } = t1.engine.api;

        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n3", x: 4, z: 3 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "w2", startNodeId: "n2", endNodeId: "n3", thickness: 0.15 });
        dispatch({ type: "UPDATE_WALL", wallId: "w1", height: 2.7 });
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "Asphalt031", face: "left" });
        dispatch({ type: "SET_WALL_MATERIAL", wallId: "w1", materialId: "Bricks058", face: "right" });

        const docA = serializeScene(t1.engine);
        expect(docA.nodes).toHaveLength(3);
        expect(docA.walls).toHaveLength(2);
        const w1 = docA.walls.find((w) => w.wallId === "w1")!;
        expect(w1.thickness).toBeCloseTo(0.2);
        expect(w1.height).toBeCloseTo(2.7);
        expect(w1.materialFaces).toEqual({ left: "Asphalt031", right: "Bricks058" });

        const t2 = buildTestEngine();
        await deserializeScene(docA, t2.engine);
        const docB = serializeScene(t2.engine);

        expect(docB).toEqual(docA);
    });

    it("floor furniture round-trips (position/rotation/optional y)", async () => {
        const t1 = buildTestEngine();
        const { dispatch, dispatchAsync } = t1.engine.api;

        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });

        await dispatchAsync({ type: "PLACE_FURNITURE", modelId: "bed-single-01", x: 1, z: 2, rotY: Math.PI / 4 });

        const docA = serializeScene(t1.engine);
        expect(docA.furniture).toHaveLength(1);
        // rotY đi qua Transform (getter/setter quanh quaternion — xem Transform.ts) nên có
        // sai số 1-ULP so với Math.PI/4 gốc; dùng toBeCloseTo thay vì so bit-for-bit. Vòng
        // round-trip docB===docA bên dưới mới là phép so khớp CHÍNH XÁC (cùng công thức cả
        // 2 lượt nên tất định, không lệch thêm).
        expect(docA.furniture![0]).toMatchObject({ modelId: "bed-single-01", x: 1, z: 2 });
        expect(docA.furniture![0].rotY).toBeCloseTo(Math.PI / 4, 10);
        // wall-mounted item vẫn được exclude khỏi furniture[] (đi vào wallItems[]).
        expect(docA.wallItems).toHaveLength(0);

        const t2 = buildTestEngine();
        await deserializeScene(docA, t2.engine);
        const docB = serializeScene(t2.engine);

        expect(docB).toEqual(docA);
    });

    it("wall-mounted item (shelf) round-trips (hostWallId/t/side)", async () => {
        const t1 = buildTestEngine();
        const { dispatch, dispatchAsync } = t1.engine.api;

        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });

        await dispatchAsync({
            type: "PLACE_WALL_ITEM",
            modelId: "wall-shelf-b",
            hostWallId: "w1",
            t: 0.5,
            side: 1,
        });

        const docA = serializeScene(t1.engine);
        expect(docA.furniture).toHaveLength(0);
        expect(docA.wallItems).toHaveLength(1);
        expect(docA.wallItems![0]).toMatchObject({ modelId: "wall-shelf-b", hostWallId: "w1", t: 0.5, side: 1 });

        const t2 = buildTestEngine();
        await deserializeScene(docA, t2.engine);
        const docB = serializeScene(t2.engine);

        expect(docB).toEqual(docA);
    });

    it("wall opening (door) round-trips", async () => {
        const t1 = buildTestEngine();
        const { dispatch, dispatchAsync } = t1.engine.api;

        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });

        await dispatchAsync({
            type: "PLACE_WALL_ITEM",
            modelId: "door-a",
            hostWallId: "w1",
            t: 0.3,
            side: -1,
        });

        const docA = serializeScene(t1.engine);
        expect(docA.wallItems).toHaveLength(1);
        expect(docA.wallItems![0]).toMatchObject({ modelId: "door-a", hostWallId: "w1", t: 0.3, side: -1 });

        const t2 = buildTestEngine();
        await deserializeScene(docA, t2.engine);
        const docB = serializeScene(t2.engine);

        expect(docB).toEqual(docA);
    });

    it("floors + roomTypes registries round-trip", async () => {
        const t1 = buildTestEngine();
        const { dispatch } = t1.engine.api;

        dispatch({ type: "SET_FLOOR_MATERIAL", roomKey: "n1|n2|n3", materialId: "Asphalt031" });
        dispatch({ type: "SET_ROOM_TYPE", roomKey: "n1|n2|n3", roomType: "bedroom" });

        const docA = serializeScene(t1.engine);
        expect(docA.floors).toEqual({ "n1|n2|n3": "Asphalt031" });
        expect(docA.roomTypes).toEqual({ "n1|n2|n3": "bedroom" });

        const t2 = buildTestEngine();
        await deserializeScene(docA, t2.engine);
        const docB = serializeScene(t2.engine);

        expect(docB).toEqual(docA);
    });

    it("full scene (walls + furniture + wall-item + floors) round-trips in one shot", async () => {
        const t1 = buildTestEngine();
        const { dispatch, dispatchAsync } = t1.engine.api;

        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n3", x: 4, z: 3 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n4", x: 0, z: 3 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "w2", startNodeId: "n2", endNodeId: "n3", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "w3", startNodeId: "n3", endNodeId: "n4", thickness: 0.2 });
        dispatch({ type: "ADD_WALL", wallId: "w4", startNodeId: "n4", endNodeId: "n1", thickness: 0.2 });
        dispatch({ type: "SET_FLOOR_MATERIAL", roomKey: "n1|n2|n3|n4", materialId: "Bricks058" });
        dispatch({ type: "SET_ROOM_TYPE", roomKey: "n1|n2|n3|n4", roomType: "living" });

        await dispatchAsync({ type: "PLACE_FURNITURE", modelId: "bed-single-01", x: 1, z: 1, rotY: 0 });
        await dispatchAsync({ type: "PLACE_WALL_ITEM", modelId: "wall-shelf-b", hostWallId: "w1", t: 0.5, side: 1 });
        await dispatchAsync({ type: "PLACE_WALL_ITEM", modelId: "door-a", hostWallId: "w2", t: 0.5, side: 1 });

        const docA = serializeScene(t1.engine);
        expect(docA.nodes).toHaveLength(4);
        expect(docA.walls).toHaveLength(4);
        expect(docA.furniture).toHaveLength(1);
        expect(docA.wallItems).toHaveLength(2);

        const t2 = buildTestEngine();
        await deserializeScene(docA, t2.engine);
        const docB = serializeScene(t2.engine);

        expect(docB).toEqual(docA);
    });
});

describe("deserializeScene — generation token (C1 guard)", () => {
    it("sequential deserialize calls (undo/redo one step at a time) fully replace scene state", async () => {
        // Ca dùng bình thường — KHÔNG chồng lấn (mỗi lần undo/redo await xong mới bấm tiếp).
        // Xác nhận generation token không ảnh hưởng luồng tuần tự thông thường.
        const t = buildTestEngine();
        const { dispatch, dispatchAsync } = t.engine.api;
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });
        await dispatchAsync({ type: "PLACE_FURNITURE", modelId: "bed-single-01", x: 0, z: 0, rotY: 0 });

        const docA = serializeScene(t.engine); // "before" snapshot (1 wall + 1 furniture)
        // docEmpty phải khớp ĐÚNG hình dạng chuẩn hoá của serializeScene (kể cả field mảng
        // rỗng như wallItems) — lấy từ engine rỗng thật thay vì viết tay để tránh lệch shape.
        const docEmpty = serializeScene(buildTestEngine().engine);

        await deserializeScene(docEmpty, t.engine); // simulate undo → empty
        expect(serializeScene(t.engine)).toEqual(docEmpty);

        await deserializeScene(docA, t.engine); // simulate redo → back to docA
        expect(serializeScene(t.engine)).toEqual(docA);
    });

    it("a superseded (older) deserialize call's furniture loop stops at the next iteration once a newer generation has started — bounded to at most one stray spawn already in flight (documented C1 trade-off)", async () => {
        const { loader, releaseNext } = controllableGltfLoader();
        const t = buildTestEngine({ gltfLoader: loader });
        const { dispatch } = t.engine.api;
        dispatch({ type: "ENSURE_NODE", nodeId: "n1", x: 0, z: 0 });
        dispatch({ type: "ENSURE_NODE", nodeId: "n2", x: 4, z: 0 });
        dispatch({ type: "ADD_WALL", wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2 });

        const docOld = {
            version: 1 as const,
            nodes: [{ id: "n1", x: 0, z: 0 }],
            walls: [],
            furniture: [
                { modelId: "bed-single-01", x: 0, z: 0, rotY: 0 },
                { modelId: "bed-single-01", x: 1, z: 1, rotY: 0 },
            ],
        };
        const docNew = { version: 1 as const, nodes: [], walls: [], furniture: [] };

        // oldRun bắt đầu: chạy đồng bộ hết bước xoá/khôi phục node/wall, rồi treo ở
        // `await dispatchAsync(PLACE_FURNITURE #1)` chờ `loader.load()` (chưa release).
        const oldRun = deserializeScene(docOld, t.engine);

        // newRun chen vào TRƯỚC khi oldRun kịp spawn entity nào — bump generation. docNew
        // rỗng nên newRun chạy hết đồng bộ, không đụng loader.
        const newRun = deserializeScene(docNew, t.engine);
        await newRun;

        // Giải phóng load() đang treo của oldRun — spawn entity #1 hoàn tất (đã in-flight
        // trước khi newRun bump generation, guard KHÔNG hồi tố huỷ nó — trade-off tài liệu
        // hoá trong deserialize.ts). Iteration kế (#2) mới bị guard chặn: KHÔNG gọi loader
        // lần 2 nữa.
        releaseNext();
        await oldRun;

        const doc = serializeScene(t.engine);
        // Guard chặn thành công vòng lặp KHÔNG chạy hết cả 2 item của docOld (hành vi cũ,
        // trước C1, sẽ interleave/spawn cả 2) — tối đa 1 entity sót lại từ lượt cũ.
        expect(doc.furniture!.length).toBeLessThanOrEqual(1);
    });
});
