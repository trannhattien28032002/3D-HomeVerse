/**
 * Vitest setup — hydrate catalogStore bằng fixture trước khi chạy test.
 *
 * Runtime nạp catalog từ backend (xem catalogApi/useCatalogBootstrap), nhưng unit
 * test chạy ở môi trường node không có mạng. Setup này nạp một snapshot tĩnh
 * (src/test/fixtures/*.fixture.json — bản sao catalog tại thời điểm tách DB) vào
 * store, để các getter đồng bộ (FurnitureCatalog, materialCatalog, catalogSummary,
 * setSurfaceMaterial) có dữ liệu y như trước. Đăng ký ở vitest.config.ts > test.setupFiles.
 *
 * Fixture là test-only, KHÔNG phải nguồn runtime — production không import JSON nữa.
 */
import { hydrateCatalog, type RawCatalogObject, type RawMaterialCatalog } from "src/shared/catalog/catalogStore";
import objectsFixture from "src/test/fixtures/objects.fixture.json";
import materialsFixture from "src/test/fixtures/materials.fixture.json";

const objects = ((objectsFixture as { objects?: unknown[] }).objects ?? []).filter(
    (o): o is RawCatalogObject =>
        !!o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string",
);

hydrateCatalog({
    objects,
    materials: materialsFixture as unknown as RawMaterialCatalog,
});
