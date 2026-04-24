import { World } from "./World";
import { Component } from "./Component";

export type ComponentClass<T extends Component> = abstract new (...args: never[]) => T;

/**
 * Công cụ truy vấn (Query) của hệ thống ECS.
 * Dùng để tìm kiếm và lọc ra các Entity thỏa mãn điều kiện sở hữu một nhóm Components cụ thể.
 */
export class Query {
    /**
     * Tìm kiếm và trả về danh sách ID của các đối tượng mang tất cả các lớp Component được yêu cầu.
     * @param world Môi trường ECS hiện tại
     * @param componentClasses Dãy các tham chiếu Class Component (VD: Transform, Mesh, ...)
     * @returns Mảng chứa Entity ID
     */
    static entitiesWith(
        world: World,
        ...componentClasses: ComponentClass<Component>[]
    ): number[] {
        return [...world.getEntityIds()].filter(entity =>
            componentClasses.every(componentClass =>
                world.hasComponent(entity, componentClass)
            )
        );
    }
}
