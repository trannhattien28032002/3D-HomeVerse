/**
 * useCatalogBootstrap — nạp catalog metadata (objects + materials) cho editor.
 *
 * Catalog phải sẵn sàng TRƯỚC khi deserialize scene (spawn furniture gọi
 * FurnitureCatalog.getAssetPath đồng bộ) và trước khi render DecorCatalog/MaterialSidebar.
 *
 * Chiến lược "cache-first, revalidate":
 *   1. Mở editor: nếu có cache localStorage → hydrate NGAY (catalogReady=true tức thì,
 *      không chờ network) ⇒ loader không bị kéo dài vì catalog.
 *   2. Luôn fetch backend ngầm để cập nhật (DB là nguồn sự thật); thành công thì re-hydrate.
 *   3. Lần đầu (chưa cache): chờ network; lỗi → trả `error` để EditorPage báo toast.
 *      Nếu ĐÃ có cache mà revalidate lỗi → chỉ log, vẫn dùng cache (không chặn editor).
 *
 * Editor sau RequireAuth nên apiFetch luôn có Bearer token (RLS 2 bảng cần authenticated).
 */
import { useEffect, useState } from "react";
import { hydrateCatalogFromApi, hydrateCatalogFromCache } from "src/data/catalog/catalogApi";
import { isCatalogHydrated } from "src/shared/catalog/catalogStore";

export function useCatalogBootstrap(): { catalogReady: boolean; error: Error | null } {
    // Hydrate đồng bộ từ store cũ (điều hướng giữa project) hoặc cache localStorage.
    const [catalogReady, setCatalogReady] = useState(
        () => isCatalogHydrated() || hydrateCatalogFromCache(),
    );
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // KHÔNG dùng "đã-chạy" ref: ở StrictMode (dev) mount-1 bị cleanup hủy, cần mount-2
        // tự gắn lại .then để set state. hydrateCatalogFromApi tự dedupe nên không gọi mạng dư.
        let cancelled = false;
        hydrateCatalogFromApi()
            .then(() => {
                if (cancelled) return;
                setCatalogReady(true);
                setError(null);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                // Có dữ liệu (cache) → vẫn dùng được, chỉ revalidate hỏng → log.
                if (isCatalogHydrated()) {
                    console.warn("[catalog] revalidate thất bại, dùng cache:", e);
                    return;
                }
                // Không cache → chặn + báo lỗi.
                setError(e instanceof Error ? e : new Error(String(e)));
            });
        return () => { cancelled = true; };
    }, []);

    return { catalogReady, error };
}
