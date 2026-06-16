import { v4 as uuidv4 } from "uuid"
import { Component } from "src/engine/ecs/Component";
import { System } from "src/engine/ecs/System";

// Monotonic counter source — module-level to survive World re-instantiation in tests.
// Using a plain integer is cheaper than crypto.randomUUID() (~52 bytes + entropy call)
// at ~O(1) per mutation. The counter never resets within a session, so stale
// SnapshotSystem comparisons across World instances cannot false-positive.
let _revisionCounter = 0;

/**
 * Lõi ECS — quản lý Entity, Component, và System của toàn bộ engine HomeVerse.
 *
 * Cấu trúc lưu trữ (sparse matrix):
 *   entities:   Set<entityId>                             — danh sách ID đang sống
 *   components: Map<ComponentClass → Map<entityId, data>> — tra cứu O(1)
 *   systems:    System[]                                   — chạy tuần tự mỗi frame
 *
 * Một "Wall" trong HomeVerse = entity có các component:
 *   WallTag + WallNodes + WallSize + Transform + Mesh + ColliderAABB
 *
 * Không có kế thừa giữa entity — tất cả hành vi đến từ composition of components.
 */

type ComponentClass<T extends Component> = abstract new (...args: never[]) => T;

export class World {
    private entities = new Set<string>();
    private components = new Map<ComponentClass<Component>, Map<string, Component>>();
    private systems: System[] = [];

    /**
     * Monotonic integer counter — tăng 1 mỗi khi cấu trúc thay đổi
     * (createEntity, destroyEntity, addComponent, removeComponent, markDirty).
     * SnapshotSystem so sánh `revision` để bỏ qua rebuild khi không có gì đổi.
     *
     * R9: đổi từ crypto.randomUUID() → integer counter. UUID sinh ~3µs + 16 byte entropy
     * mỗi structural change (hàng chục lần/frame khi drag). Integer counter = 1 addition.
     * Cả hai đều là change-token đơn giản; integer đủ cho mục đích so sánh thay đổi.
     */
    public revision: number = ++_revisionCounter;

    /** Tạo entity mới — chỉ trả về ID, chưa có component nào. */
    createEntity(): string {
        const id = uuidv4();
        this.entities.add(id);
        this.revision = ++_revisionCounter;
        return id;
    }

    /** Xóa entity và tất cả component của nó khỏi mọi ComponentMap. */
    destroyEntity(entity: string): void {
        this.entities.delete(entity);
        this.revision = ++_revisionCounter;

        for (const componentMap of this.components.values()) {
            componentMap.delete(entity);
        }
    }

    /** Gắn component vào entity. Tự động khởi tạo ComponentMap nếu chưa có. */
    addComponent<T extends Component>(entity: string, component: T): void {
        const type = component.constructor as ComponentClass<T>;

        if (!this.components.has(type)) {
            this.components.set(type, new Map());
        }

        this.components.get(type)?.set(entity, component);
        this.revision = ++_revisionCounter;
    }

    /** Gỡ component khỏi entity (ví dụ: xóa WallPolygon để trigger rebuild). */
    removeComponent<T extends Component>(entity: string, componentType: ComponentClass<T>): void {
        this.components.get(componentType)?.delete(entity);
        this.revision = ++_revisionCounter;
    }

    /** Lấy component theo type — trả về undefined nếu entity không có component đó. */
    getComponent<T extends Component>(entity: string, componentType: ComponentClass<T>): T | undefined {
        return this.components.get(componentType)?.get(entity) as T | undefined;
    }

    /** Kiểm tra entity có component cụ thể không — dùng để lọc trong Query. */
    hasComponent<T extends Component>(entity: string, componentType: ComponentClass<T>): boolean {
        return this.components.get(componentType)?.has(entity) ?? false;
    }

    /**
     * Tăng revision mà KHÔNG có thay đổi cấu trúc ECS.
     * Gọi khi dữ liệu mutable nằm ngoài component store bị đổi
     * (ví dụ NodeRegistry.move sửa toạ độ node tại chỗ).
     */
    markDirty(): void {
        this.revision = ++_revisionCounter;
    }

    /**
     * Trả về iterator các entity có component type cho trước.
     * Query dùng để chỉ duyệt tập ứng viên nhỏ nhất thay vì toàn bộ entity.
     */
    getEntitiesWithComponent<T extends Component>(componentType: ComponentClass<T>): IterableIterator<string> {
        const map = this.components.get(componentType);
        return map ? map.keys() : [][Symbol.iterator]();
    }

    /**
     * Trả về số entity đang mang component type cho trước.
     * Query dùng để chọn bộ lọc "kén" nhất (tập nhỏ nhất).
     */
    getComponentCount<T extends Component>(componentType: ComponentClass<T>): number {
        return this.components.get(componentType)?.size ?? 0;
    }

    /** Lấy iterator tất cả entity ID đang tồn tại — Query dùng để filter. */
    getEntityIds(): IterableIterator<string> {
        return this.entities.values();
    }

    /** Đăng ký system — được gọi theo thứ tự đăng ký trong mỗi frame. */
    addSystem(system: System): void {
        this.systems.push(system);
    }

    /**
     * Vòng lặp chính — gọi system.update() theo thứ tự mỗi frame.
     * Thứ tự system rất quan trọng:
     *   WallGeometrySystem → DimensionSystem → SnapshotSystem → RenderSystem
     */
    update(deltaTime: number): void {
        for (const system of this.systems) {
            system.update(this, deltaTime);
        }
    }
}
