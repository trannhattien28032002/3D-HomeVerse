/**
 * RenderScheduler — cờ "cần vẽ lại" cho on-demand rendering (CR-03).
 *
 * RenderSystem chỉ chạy `composer.render()` khi có thay đổi NHÌN THẤY ĐƯỢC:
 *   - ECS revision đổi / camera đổi / environment map nạp xong → RenderSystem TỰ phát hiện.
 *   - Thay đổi "preview" KHÔNG bump revision (ghost đặt đồ bám con trỏ, hover/attach/detach
 *     gizmo, đổi viền chọn tường/sàn) → nguồn phát gọi `requestRender()` để báo cần 1 frame.
 *
 * Mục tiêu: cảnh đứng yên (không tương tác, camera đã dừng) → GPU KHÔNG vẽ lại
 * (không còn RenderPass + OutlinePass + OutputPass chạy mãi ở refresh rate). Drawing
 * buffer của canvas giữ nguyên frame cuối nên không cần `preserveDrawingBuffer`.
 */
export class RenderScheduler {
    /** Khởi tạo true để frame đầu luôn vẽ (paint cảnh ban đầu). */
    private dirty = true;

    /** Yêu cầu vẽ lại ở frame kế. Idempotent trong cùng frame. */
    requestRender(): void {
        this.dirty = true;
    }

    /** RenderSystem đọc + reset mỗi frame. true = cần vẽ frame này. */
    consume(): boolean {
        const d = this.dirty;
        this.dirty = false;
        return d;
    }
}
