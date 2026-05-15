import { Component } from "src/engine/ecs/Component";
import { System } from "src/engine/ecs/System";

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
    private nextEntityId = 0;
    private entities = new Set<number>();
    private components = new Map<ComponentClass<Component>, Map<number, Component>>();
    private systems: System[] = [];

    /** Tạo entity mới — chỉ trả về ID, chưa có component nào. */
    createEntity(): number {
        const id = this.nextEntityId++;
        this.entities.add(id);
        return id;
    }

    /** Xóa entity và tất cả component của nó khỏi mọi ComponentMap. */
    destroyEntity(entity: number): void {
        this.entities.delete(entity);

        for (const componentMap of this.components.values()) {
            componentMap.delete(entity);
        }
    }

    /** Gắn component vào entity. Tự động khởi tạo ComponentMap nếu chưa có. */
    addComponent<T extends Component>(entity: number, component: T): void {
        const type = component.constructor as ComponentClass<T>;

        if (!this.components.has(type)) {
            this.components.set(type, new Map());
        }

        this.components.get(type)?.set(entity, component);
    }

    /** Gỡ component khỏi entity (ví dụ: xóa WallPolygon để trigger rebuild). */
    removeComponent<T extends Component>(entity: number, componentType: ComponentClass<T>): void {
        this.components.get(componentType)?.delete(entity);
    }

    /** Lấy component theo type — trả về undefined nếu entity không có component đó. */
    getComponent<T extends Component>(entity: number, componentType: ComponentClass<T>): T | undefined {
        return this.components.get(componentType)?.get(entity) as T | undefined;
    }

    /** Kiểm tra entity có component cụ thể không — dùng để lọc trong Query. */
    hasComponent<T extends Component>(entity: number, componentType: ComponentClass<T>): boolean {
        return this.components.get(componentType)?.has(entity) ?? false;
    }

    /** Lấy iterator tất cả entity ID đang tồn tại — Query dùng để filter. */
    getEntityIds(): IterableIterator<number> {
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
