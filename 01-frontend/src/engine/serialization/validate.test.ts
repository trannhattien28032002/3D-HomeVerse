/**
 * validate.test — validateSceneDocument: tập trung field material tường mới
 * (`materialFaces`) + back-compat `material` đơn (file cũ).
 */
import { describe, it, expect } from "vitest";
import { validateSceneDocument } from "src/engine/serialization/validate";

/** Doc tối thiểu hợp lệ: 2 node + 1 tường; cho phép ghi đè field tường để test. */
function docWithWall(extra: Record<string, unknown>): unknown {
    return {
        version: 1,
        nodes: [
            { id: "nA", x: 0, z: 0 },
            { id: "nB", x: 3, z: 0 },
        ],
        walls: [
            { wallId: "w1", startNodeId: "nA", endNodeId: "nB", thickness: 0.15, height: 3.2, ...extra },
        ],
    };
}

describe("validateSceneDocument — material tường", () => {
    it("không có material → hợp lệ", () => {
        expect(validateSceneDocument(docWithWall({})).ok).toBe(true);
    });

    it("materialFaces {left,right} hợp lệ", () => {
        expect(validateSceneDocument(docWithWall({ materialFaces: { left: "brick", right: "wood" } })).ok).toBe(true);
    });

    it("materialFaces chỉ 1 mặt hợp lệ", () => {
        expect(validateSceneDocument(docWithWall({ materialFaces: { left: "brick" } })).ok).toBe(true);
    });

    it("back-compat: `material` đơn (file cũ) vẫn hợp lệ", () => {
        expect(validateSceneDocument(docWithWall({ material: "brick" })).ok).toBe(true);
    });

    it("materialFaces không phải object → lỗi", () => {
        const r = validateSceneDocument(docWithWall({ materialFaces: "brick" }));
        expect(r.ok).toBe(false);
    });

    it("materialFaces.left chuỗi rỗng → lỗi", () => {
        const r = validateSceneDocument(docWithWall({ materialFaces: { left: "" } }));
        expect(r.ok).toBe(false);
    });
});
