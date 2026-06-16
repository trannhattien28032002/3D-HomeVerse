/**
 * CachedClientRect — cache getBoundingClientRect() để tránh forced-reflow trên
 * hot pointer path (LW-03).
 *
 * getBoundingClientRect() có thể buộc trình duyệt layout-reflow nếu DOM vừa bị
 * invalidate; gọi nó mỗi `mousemove` (OrbitControlSystem) hoặc mỗi frame rotate
 * (GizmoSystem) là điểm nóng tiềm tàng. Ở đây cache giá trị và chỉ invalidate khi
 * cửa sổ `resize` hoặc `scroll` — đúng những sự kiện có thể dời vị trí/kích thước
 * canvas. Lần đọc kế tiếp sau khi invalidate sẽ tính lại lazy.
 *
 * Canvas 3D phủ toàn cửa sổ và các panel là overlay absolute (không đẩy layout
 * canvas), nên resize + scroll là đủ để bắt mọi thay đổi rect.
 */
export class CachedClientRect {
    private readonly el: HTMLElement;
    private rect: DOMRect | null = null;
    private readonly invalidate = () => { this.rect = null; };

    constructor(el: HTMLElement) {
        this.el = el;
        window.addEventListener("resize", this.invalidate);
        // capture=true để bắt cả scroll của container cha, không chỉ window.
        window.addEventListener("scroll", this.invalidate, true);
    }

    get(): DOMRect {
        if (!this.rect) this.rect = this.el.getBoundingClientRect();
        return this.rect;
    }

    dispose(): void {
        window.removeEventListener("resize", this.invalidate);
        window.removeEventListener("scroll", this.invalidate, true);
    }
}
