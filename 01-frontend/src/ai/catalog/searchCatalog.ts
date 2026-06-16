/**
 * searchCatalog — tra catalog chống hallucinate modelId (WP2).
 *
 * Khớp fuzzy theo token trên `name + category` (đều TIẾNG ANH trong objects.json).
 * Người dùng nói tiếng Việt → LLM tự dịch ý định sang từ khoá tiếng Anh rồi gọi
 * tool này (ranh giới "AI quyết ý định, code khớp dữ liệu"). KHÔNG bao giờ trả id
 * ngoài catalog.
 */
import { listCatalog, type CatalogEntry } from "src/ai/catalog/catalogSummary";

export type CatalogSearchResult = CatalogEntry;

export type SearchOptions = {
    /** Lọc theo category (khớp 1 phần, không phân biệt hoa thường). */
    category?: string;
    /** Số kết quả tối đa (mặc định 8). */
    maxResults?: number;
    /** Lọc theo ràng buộc đặt (floor/wall). */
    constraint?: "floor" | "wall";
};

/** Chuẩn hoá: bỏ dấu + lowercase (để chịu được cả input có dấu). */
function norm(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchCatalog(query: string, opts: SearchOptions = {}): CatalogSearchResult[] {
    const max = opts.maxResults && opts.maxResults > 0 ? opts.maxResults : 8;

    let items = listCatalog();
    if (opts.constraint) items = items.filter((i) => i.constraint === opts.constraint);
    if (opts.category) {
        const c = norm(opts.category);
        items = items.filter((i) => norm(i.category).includes(c) || c.includes(norm(i.category)));
    }

    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
        // Query rỗng: chỉ "browse" khi đã lọc category, ngược lại buộc phải có query.
        return opts.category ? items.slice(0, max) : [];
    }

    const scored = items
        .map((i) => {
            const hay = norm(`${i.name} ${i.category}`);
            const cat = norm(i.category);
            let score = 0;
            for (const t of tokens) {
                if (hay.includes(t)) score += 1;
                if (cat.includes(t)) score += 1; // khớp category được ưu tiên
            }
            return { i, score };
        })
        .filter((x) => x.score > 0);

    scored.sort((a, b) => b.score - a.score || a.i.name.localeCompare(b.i.name));
    return scored.slice(0, max).map((x) => x.i);
}
