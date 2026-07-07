import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAssetUrl } from "./assetUrl";

describe("resolveAssetUrl", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("trả nguyên path khi không set base (dev/static)", () => {
        vi.stubEnv("VITE_ASSET_BASE_URL", "");
        expect(resolveAssetUrl("/models/beds/bed-01.glb")).toBe("/models/beds/bed-01.glb");
    });

    it("prefix base CDN vào path root-relative", () => {
        vi.stubEnv("VITE_ASSET_BASE_URL", "https://x.supabase.co/storage/v1/object/public/catalog-assets");
        expect(resolveAssetUrl("/models/beds/bed-01.glb")).toBe(
            "https://x.supabase.co/storage/v1/object/public/catalog-assets/models/beds/bed-01.glb",
        );
    });

    it("bỏ dấu / cuối của base trước khi ghép", () => {
        vi.stubEnv("VITE_ASSET_BASE_URL", "https://cdn.example.com/assets/");
        expect(resolveAssetUrl("/thumbnails/a.webp")).toBe("https://cdn.example.com/assets/thumbnails/a.webp");
    });

    it("thêm / khi path không có slash đầu", () => {
        vi.stubEnv("VITE_ASSET_BASE_URL", "https://cdn.example.com");
        expect(resolveAssetUrl("models/a.glb")).toBe("https://cdn.example.com/models/a.glb");
    });

    it("giữ nguyên URL đã absolute (http/https)", () => {
        vi.stubEnv("VITE_ASSET_BASE_URL", "https://cdn.example.com");
        expect(resolveAssetUrl("https://other.com/x.png")).toBe("https://other.com/x.png");
    });

    it("trả nguyên giá trị falsy (undefined/empty)", () => {
        vi.stubEnv("VITE_ASSET_BASE_URL", "https://cdn.example.com");
        expect(resolveAssetUrl(undefined)).toBeUndefined();
        expect(resolveAssetUrl("")).toBe("");
    });
});
