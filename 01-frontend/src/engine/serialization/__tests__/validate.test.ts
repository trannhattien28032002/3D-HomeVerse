/**
 * validate.test.ts — test cho `validateSceneDocument` (B1 trong
 * BAO-CAO-REVIEW-DA-CHIEU.md). Kiểm tra hàm reject đúng các document lỗi
 * (thiếu field bắt buộc, id trùng, tham chiếu node/wall không tồn tại, ...) và
 * accept document hợp lệ ở dạng tối thiểu lẫn đầy đủ.
 *
 * modelId dùng trong test lấy từ fixture catalog test (`src/test/fixtures/objects.fixture.json`,
 * hydrate qua `src/test/setupCatalog.ts`) — "bed-single-01" (furniture sàn) và
 * "wall-shelf-b" (wall item) đều tồn tại thật trong fixture.
 */
import { describe, it, expect } from "vitest";
import { validateSceneDocument, validationFailed } from "src/engine/serialization/validate";

function baseDoc() {
    return {
        version: 1,
        nodes: [
            { id: "n1", x: 0, z: 0 },
            { id: "n2", x: 4, z: 0 },
        ],
        walls: [
            { wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2, height: 2.7 },
        ],
    };
}

describe("validateSceneDocument — accepts valid documents", () => {
    it("accepts the minimal valid document (no nodes/walls)", () => {
        const result = validateSceneDocument({ version: 1, nodes: [], walls: [] });
        expect(result.ok).toBe(true);
    });

    it("accepts a document with nodes + walls", () => {
        const result = validateSceneDocument(baseDoc());
        expect(result.ok).toBe(true);
    });

    it("accepts optional furniture/wallItems/floors/roomTypes when well-formed", () => {
        const doc = {
            ...baseDoc(),
            furniture: [{ modelId: "bed-single-01", x: 1, z: 1, rotY: 0 }],
            wallItems: [{ modelId: "wall-shelf-b", hostWallId: "w1", t: 0.5, side: 1 }],
            floors: { "n1|n2": "Asphalt031" },
            roomTypes: { "n1|n2": "bedroom" },
        };
        const result = validateSceneDocument(doc);
        expect(result.ok).toBe(true);
    });

    it("accepts furniture with optional y and materials", () => {
        const doc = {
            ...baseDoc(),
            furniture: [
                { modelId: "bed-single-01", x: 1, y: 0.8, z: 1, rotY: 0, materials: { bedstead: "oak-01" } },
            ],
        };
        expect(validateSceneDocument(doc).ok).toBe(true);
    });

    it("accepts legacy single `material` field on a wall (back-compat)", () => {
        const doc = {
            version: 1,
            nodes: [{ id: "n1", x: 0, z: 0 }, { id: "n2", x: 4, z: 0 }],
            walls: [{ wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.2, height: 2.7, material: "Bricks058" }],
        };
        expect(validateSceneDocument(doc).ok).toBe(true);
    });
});

describe("validateSceneDocument — rejects malformed root", () => {
    it("rejects non-object root", () => {
        expect(validateSceneDocument(null).ok).toBe(false);
        expect(validateSceneDocument("hello").ok).toBe(false);
        expect(validateSceneDocument(42).ok).toBe(false);
        expect(validateSceneDocument([1, 2, 3]).ok).toBe(false);
    });

    it("rejects missing/wrong version", () => {
        const r1 = validateSceneDocument({ nodes: [], walls: [] });
        expect(r1.ok).toBe(false);
        const r2 = validateSceneDocument({ version: 2, nodes: [], walls: [] });
        expect(r2.ok).toBe(false);
        if (validationFailed(r2)) {
            expect(r2.error).toMatch(/version/i);
        }
    });
});

describe("validateSceneDocument — rejects malformed nodes", () => {
    it("rejects nodes that is not an array", () => {
        const result = validateSceneDocument({ version: 1, nodes: "not-array", walls: [] });
        expect(result.ok).toBe(false);
    });

    it("rejects a node missing id/x/z", () => {
        expect(validateSceneDocument({ version: 1, nodes: [{ x: 0, z: 0 }], walls: [] }).ok).toBe(false);
        expect(validateSceneDocument({ version: 1, nodes: [{ id: "n1", z: 0 }], walls: [] }).ok).toBe(false);
        expect(validateSceneDocument({ version: 1, nodes: [{ id: "n1", x: 0 }], walls: [] }).ok).toBe(false);
    });

    it("rejects a node with non-finite x/z", () => {
        expect(validateSceneDocument({ version: 1, nodes: [{ id: "n1", x: NaN, z: 0 }], walls: [] }).ok).toBe(false);
        expect(validateSceneDocument({ version: 1, nodes: [{ id: "n1", x: Infinity, z: 0 }], walls: [] }).ok).toBe(false);
    });

    it("rejects duplicate node id", () => {
        const doc = {
            version: 1,
            nodes: [{ id: "n1", x: 0, z: 0 }, { id: "n1", x: 1, z: 1 }],
            walls: [],
        };
        const result = validateSceneDocument(doc);
        expect(result.ok).toBe(false);
        if (validationFailed(result)) expect(result.error).toMatch(/Duplicate node id/);
    });
});

describe("validateSceneDocument — rejects malformed walls", () => {
    it("rejects walls that is not an array", () => {
        expect(validateSceneDocument({ version: 1, nodes: [], walls: "nope" }).ok).toBe(false);
    });

    it("rejects a wall missing wallId/startNodeId/endNodeId", () => {
        const nodes = [{ id: "n1", x: 0, z: 0 }, { id: "n2", x: 1, z: 0 }];
        expect(
            validateSceneDocument({ version: 1, nodes, walls: [{ startNodeId: "n1", endNodeId: "n2", thickness: 0.1, height: 2 }] }).ok
        ).toBe(false);
        expect(
            validateSceneDocument({ version: 1, nodes, walls: [{ wallId: "w1", endNodeId: "n2", thickness: 0.1, height: 2 }] }).ok
        ).toBe(false);
        expect(
            validateSceneDocument({ version: 1, nodes, walls: [{ wallId: "w1", startNodeId: "n1", thickness: 0.1, height: 2 }] }).ok
        ).toBe(false);
    });

    it("rejects non-positive thickness or height", () => {
        const nodes = [{ id: "n1", x: 0, z: 0 }, { id: "n2", x: 1, z: 0 }];
        expect(
            validateSceneDocument({ version: 1, nodes, walls: [{ wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0, height: 2 }] }).ok
        ).toBe(false);
        expect(
            validateSceneDocument({ version: 1, nodes, walls: [{ wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.1, height: -1 }] }).ok
        ).toBe(false);
    });

    it("rejects a wall referencing an unknown startNodeId/endNodeId (referential integrity)", () => {
        const nodes = [{ id: "n1", x: 0, z: 0 }, { id: "n2", x: 1, z: 0 }];
        const r1 = validateSceneDocument({
            version: 1, nodes,
            walls: [{ wallId: "w1", startNodeId: "ghost", endNodeId: "n2", thickness: 0.1, height: 2 }],
        });
        expect(r1.ok).toBe(false);
        if (validationFailed(r1)) expect(r1.error).toMatch(/unknown startNodeId/);

        const r2 = validateSceneDocument({
            version: 1, nodes,
            walls: [{ wallId: "w1", startNodeId: "n1", endNodeId: "ghost", thickness: 0.1, height: 2 }],
        });
        expect(r2.ok).toBe(false);
        if (validationFailed(r2)) expect(r2.error).toMatch(/unknown endNodeId/);
    });

    it("rejects a self-loop wall (startNodeId === endNodeId)", () => {
        const nodes = [{ id: "n1", x: 0, z: 0 }];
        const result = validateSceneDocument({
            version: 1, nodes,
            walls: [{ wallId: "w1", startNodeId: "n1", endNodeId: "n1", thickness: 0.1, height: 2 }],
        });
        expect(result.ok).toBe(false);
        if (validationFailed(result)) expect(result.error).toMatch(/self-loop/);
    });

    it("rejects duplicate wallId", () => {
        const nodes = [{ id: "n1", x: 0, z: 0 }, { id: "n2", x: 1, z: 0 }, { id: "n3", x: 1, z: 1 }];
        const result = validateSceneDocument({
            version: 1, nodes,
            walls: [
                { wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.1, height: 2 },
                { wallId: "w1", startNodeId: "n2", endNodeId: "n3", thickness: 0.1, height: 2 },
            ],
        });
        expect(result.ok).toBe(false);
        if (validationFailed(result)) expect(result.error).toMatch(/Duplicate wallId/);
    });

    it("rejects malformed materialFaces", () => {
        const nodes = [{ id: "n1", x: 0, z: 0 }, { id: "n2", x: 1, z: 0 }];
        expect(
            validateSceneDocument({
                version: 1, nodes,
                walls: [{ wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.1, height: 2, materialFaces: "nope" }],
            }).ok
        ).toBe(false);
        expect(
            validateSceneDocument({
                version: 1, nodes,
                walls: [{ wallId: "w1", startNodeId: "n1", endNodeId: "n2", thickness: 0.1, height: 2, materialFaces: { left: "" } }],
            }).ok
        ).toBe(false);
    });
});

describe("validateSceneDocument — rejects malformed furniture", () => {
    it("rejects furniture that is not an array", () => {
        const doc = { ...baseDoc(), furniture: "nope" };
        expect(validateSceneDocument(doc).ok).toBe(false);
    });

    it("rejects furniture with unknown modelId (not in catalog)", () => {
        const doc = { ...baseDoc(), furniture: [{ modelId: "does-not-exist", x: 0, z: 0, rotY: 0 }] };
        const result = validateSceneDocument(doc);
        expect(result.ok).toBe(false);
        if (validationFailed(result)) expect(result.error).toMatch(/not a known catalog item/);
    });

    it("rejects furniture with non-finite x/z/rotY", () => {
        expect(validateSceneDocument({ ...baseDoc(), furniture: [{ modelId: "bed-single-01", x: NaN, z: 0, rotY: 0 }] }).ok).toBe(false);
        expect(validateSceneDocument({ ...baseDoc(), furniture: [{ modelId: "bed-single-01", x: 0, z: Infinity, rotY: 0 }] }).ok).toBe(false);
        expect(validateSceneDocument({ ...baseDoc(), furniture: [{ modelId: "bed-single-01", x: 0, z: 0, rotY: NaN }] }).ok).toBe(false);
    });

    it("rejects furniture with non-finite optional y when present", () => {
        const doc = { ...baseDoc(), furniture: [{ modelId: "bed-single-01", x: 0, y: NaN, z: 0, rotY: 0 }] };
        expect(validateSceneDocument(doc).ok).toBe(false);
    });

    it("rejects malformed materials record on furniture", () => {
        const doc = { ...baseDoc(), furniture: [{ modelId: "bed-single-01", x: 0, z: 0, rotY: 0, materials: { slot: 42 } }] };
        expect(validateSceneDocument(doc).ok).toBe(false);
    });
});

describe("validateSceneDocument — rejects malformed wallItems", () => {
    it("rejects wallItems that is not an array", () => {
        const doc = { ...baseDoc(), wallItems: "nope" };
        expect(validateSceneDocument(doc).ok).toBe(false);
    });

    it("rejects wallItems with unknown modelId", () => {
        const doc = { ...baseDoc(), wallItems: [{ modelId: "does-not-exist", hostWallId: "w1", t: 0.5, side: 1 }] };
        expect(validateSceneDocument(doc).ok).toBe(false);
    });

    it("rejects wallItems referencing an unknown hostWallId", () => {
        const doc = { ...baseDoc(), wallItems: [{ modelId: "wall-shelf-b", hostWallId: "ghost-wall", t: 0.5, side: 1 }] };
        const result = validateSceneDocument(doc);
        expect(result.ok).toBe(false);
        if (validationFailed(result)) expect(result.error).toMatch(/unknown hostWallId/);
    });

    it("rejects wallItems with t outside [0,1]", () => {
        expect(validateSceneDocument({ ...baseDoc(), wallItems: [{ modelId: "wall-shelf-b", hostWallId: "w1", t: -0.1, side: 1 }] }).ok).toBe(false);
        expect(validateSceneDocument({ ...baseDoc(), wallItems: [{ modelId: "wall-shelf-b", hostWallId: "w1", t: 1.1, side: 1 }] }).ok).toBe(false);
    });

    it("rejects wallItems with side other than +1/-1", () => {
        expect(validateSceneDocument({ ...baseDoc(), wallItems: [{ modelId: "wall-shelf-b", hostWallId: "w1", t: 0.5, side: 0 }] }).ok).toBe(false);
        expect(validateSceneDocument({ ...baseDoc(), wallItems: [{ modelId: "wall-shelf-b", hostWallId: "w1", t: 0.5, side: 2 }] }).ok).toBe(false);
    });
});

describe("validateSceneDocument — rejects malformed floors/roomTypes", () => {
    it("rejects floors that is not an object", () => {
        expect(validateSceneDocument({ ...baseDoc(), floors: ["a", "b"] }).ok).toBe(false);
        expect(validateSceneDocument({ ...baseDoc(), floors: "nope" }).ok).toBe(false);
    });

    it("rejects floors with non-string / empty-string values", () => {
        expect(validateSceneDocument({ ...baseDoc(), floors: { "n1|n2": 42 } }).ok).toBe(false);
        expect(validateSceneDocument({ ...baseDoc(), floors: { "n1|n2": "" } }).ok).toBe(false);
    });

    it("rejects roomTypes that is not an object", () => {
        expect(validateSceneDocument({ ...baseDoc(), roomTypes: ["a"] }).ok).toBe(false);
    });

    it("rejects roomTypes with non-string / empty-string values", () => {
        expect(validateSceneDocument({ ...baseDoc(), roomTypes: { "n1|n2": 1 } }).ok).toBe(false);
        expect(validateSceneDocument({ ...baseDoc(), roomTypes: { "n1|n2": "" } }).ok).toBe(false);
    });
});
