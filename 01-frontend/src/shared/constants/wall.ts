/**
 * Wall geometry constants — SINGLE SOURCE OF TRUTH cho default tường.
 *
 * Trước đây giá trị 3.2 (chiều cao) và 1.6 (tâm = nửa chiều cao) hardcode rải rác ở
 * wallHandlers, wallTopology và deserialize → dễ phân kỳ khi đổi. Mọi nơi tạo/so
 * sánh tường mặc định phải import từ đây.
 *
 * Layer: shared/constants — pure data, không phụ thuộc engine/React/Konva.
 */

/** Chiều cao mặc định của tường khi tạo mới (mét). */
export const DEFAULT_WALL_HEIGHT = 3.2;

/** Tâm Y của mesh tường mặc định = nửa chiều cao (box origin ở giữa). */
export const DEFAULT_WALL_CENTER_Y = DEFAULT_WALL_HEIGHT / 2;
