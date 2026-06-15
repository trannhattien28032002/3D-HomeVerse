/**
 * searchCatalog tool — cho agent tra modelId CÓ THẬT trước khi placeFurniture (WP2).
 *
 * Lọc sẵn constraint "floor" (placeFurniture chỉ đặt sàn; đồ bám tường để WP3
 * addOpening). Tên catalog tiếng Anh → tool description nhắc model dùng từ khoá Anh.
 */
import type { ToolDef } from "src/ai/agent/agentTypes";
import { ToolInputError } from "src/ai/tools/dispatchBridge";
import { searchCatalog } from "src/ai/catalog/searchCatalog";

type SearchInput = { query: string; category?: string; maxResults?: number; kind?: "floor" | "wall" };

function parse(input: unknown): SearchInput {
    if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
    const o = input as Record<string, unknown>;
    if (typeof o.query !== "string") throw new ToolInputError("query phải là string.");
    if (o.category !== undefined && typeof o.category !== "string") throw new ToolInputError("category phải là string.");
    if (o.maxResults !== undefined && typeof o.maxResults !== "number") throw new ToolInputError("maxResults phải là number.");
    if (o.kind !== undefined && o.kind !== "floor" && o.kind !== "wall") throw new ToolInputError("kind phải là 'floor' hoặc 'wall'.");
    return {
        query: o.query,
        category: o.category as string | undefined,
        maxResults: o.maxResults as number | undefined,
        kind: o.kind as "floor" | "wall" | undefined,
    };
}

export const searchCatalogTool: ToolDef = {
    schema: {
        name: "searchCatalog",
        description:
            "Tìm modelId nội thất CÓ THẬT theo từ khoá. Tên catalog bằng TIẾNG ANH — " +
            "hãy dùng từ khoá tiếng Anh (vd 'bed', 'sofa', 'table', 'door', 'window'). " +
            "kind='floor' (mặc định) cho đồ đặt sàn (dùng với placeFurniture); kind='wall' cho " +
            "cửa/cửa sổ/kệ treo (dùng với addOpening). Trả về { modelId, name, category, footprint }. " +
            "GỌI tool này TRƯỚC placeFurniture/addOpening để lấy modelId đúng — đừng tự bịa modelId.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "từ khoá tiếng Anh, vd 'bed'" },
                category: { type: "string", description: "lọc theo category (optional), vd 'beds', 'sofas'" },
                kind: { type: "string", enum: ["floor", "wall"], description: "loại đặt: 'floor' (mặc định) hoặc 'wall'" },
                maxResults: { type: "number", description: "số kết quả tối đa (mặc định 8)" },
            },
            required: ["query"],
        },
    },
    handler: async (input) => {
        const p = parse(input);
        const results = searchCatalog(p.query, {
            category: p.category,
            maxResults: p.maxResults,
            constraint: p.kind ?? "floor",
        });
        return JSON.stringify({
            results: results.map((r) => ({
                modelId: r.modelId,
                name: r.name,
                category: r.category,
                footprint: r.footprint,
            })),
        });
    },
};
