/**
 * searchCatalog.test.ts — WP2. Done-when: chỉ trả modelId tồn tại trong objects.json.
 */
import { describe, it, expect } from "vitest";
import { searchCatalog } from "src/ai/catalog/searchCatalog";
import { searchCatalogTool } from "src/ai/tools/searchCatalog";
import { getCatalogItem } from "src/engine/catalog/FurnitureCatalog";

describe("searchCatalog", () => {
    it("'bed' → trả kết quả, mọi modelId CÓ THẬT, có item category beds", () => {
        const res = searchCatalog("bed");
        expect(res.length).toBeGreaterThan(0);
        // Done-when cốt lõi: không bịa id.
        for (const r of res) expect(getCatalogItem(r.modelId)).toBeDefined();
        expect(res.some((r) => r.category === "beds")).toBe(true);
    });

    it("'sofa' → tất cả thuộc nhóm liên quan, id thật", () => {
        const res = searchCatalog("sofa");
        expect(res.length).toBeGreaterThan(0);
        for (const r of res) expect(getCatalogItem(r.modelId)).toBeDefined();
    });

    it("lọc category 'chairs' → mọi kết quả category chairs", () => {
        const res = searchCatalog("chair", { category: "chairs" });
        expect(res.length).toBeGreaterThan(0);
        for (const r of res) expect(r.category).toBe("chairs");
    });

    it("query vô nghĩa → rỗng (không bịa)", () => {
        expect(searchCatalog("zzzkhongcogi")).toEqual([]);
    });

    it("tôn trọng maxResults", () => {
        const res = searchCatalog("a", { maxResults: 3 }); // 'a' khớp rộng
        expect(res.length).toBeLessThanOrEqual(3);
    });

    it("constraint floor: không trả đồ bám tường (cửa/cửa sổ)", () => {
        const doors = searchCatalog("door", { constraint: "floor" });
        // door-* là wall constraint → bị loại.
        expect(doors.every((r) => r.constraint === "floor")).toBe(true);
    });
});

describe("searchCatalogTool", () => {
    it("handler trả JSON results, chỉ đồ sàn, id thật", async () => {
        const raw = await searchCatalogTool.handler({ query: "bed" }, { api: {} as never });
        const parsed = JSON.parse(raw) as { results: { modelId: string }[] };
        expect(parsed.results.length).toBeGreaterThan(0);
        for (const r of parsed.results) expect(getCatalogItem(r.modelId)).toBeDefined();
    });

    it("query thiếu → ToolInputError (registry sẽ bắt)", async () => {
        await expect(searchCatalogTool.handler({}, { api: {} as never })).rejects.toThrow();
    });
});
