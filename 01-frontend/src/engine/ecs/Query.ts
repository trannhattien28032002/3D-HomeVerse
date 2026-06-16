import { World } from "src/engine/ecs/World";
import { Component } from "src/engine/ecs/Component";

export type ComponentClass<T extends Component> = abstract new (...args: never[]) => T;

/**
 * Công cụ truy vấn (Query) của hệ thống ECS.
 * Dùng để tìm kiếm và lọc ra các Entity thỏa mãn điều kiện sở hữu một nhóm Components cụ thể.
 */
export class Query {
    /**
     * Trả về mọi entity ID mang ĐỦ tất cả component type được liệt kê.
     *
     * Chỉ duyệt các entity thuộc component map "kén" nhất (nhỏ nhất), rồi lọc theo
     * các type còn lại. Độ phức tạp O(tậpNhỏNhất × số_type) thay vì
     * O(toànBộEntity × số_type) — quan trọng khi world có nhiều entity.
     */
    static entitiesWith(
        world: World,
        ...componentClasses: ComponentClass<Component>[]
    ): string[] {
        if (componentClasses.length === 0) return [];

        // Chọn component type có ít entity đăng ký nhất làm pivot.
        let pivotType = componentClasses[0];
        let pivotCount = world.getComponentCount(pivotType);
        for (let i = 1; i < componentClasses.length; i++) {
            const count = world.getComponentCount(componentClasses[i]);
            if (count < pivotCount) {
                pivotCount = count;
                pivotType = componentClasses[i];
            }
        }

        const result: string[] = [];
        // Duyệt tập pivot nhỏ nhất, giữ lại entity có đủ mọi component còn lại.
        for (const entity of world.getEntitiesWithComponent(pivotType)) {
            if (componentClasses.every(type => world.hasComponent(entity, type))) {
                result.push(entity);
            }
        }
        return result;
    }
}
