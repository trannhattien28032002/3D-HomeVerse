import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Kế thừa toàn bộ cấu hình Vite (alias `src`, plugin…) và bổ sung phần test.
// setupCatalog hydrate catalogStore bằng fixture trước mỗi test file — vì catalog
// runtime nay nạp từ backend (async), test cần seed đồng bộ để getter có dữ liệu.
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            setupFiles: ["src/test/setupCatalog.ts"],
        },
    }),
);
