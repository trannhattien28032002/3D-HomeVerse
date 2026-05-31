import { World } from "src/engine/ecs/World";
import { Component } from "src/engine/ecs/Component";

export type ComponentClass<T extends Component> = abstract new (...args: never[]) => T;

/**
 * Công cụ truy vấn (Query) của hệ thống ECS.
 * Dùng để tìm kiếm và lọc ra các Entity thỏa mãn điều kiện sở hữu một nhóm Components cụ thể.
 */
export class Query {
    /**
     * Returns all entity IDs that carry every listed component type.
     *
     * Iterates only the entities that have the most-selective (smallest) component map,
     * then filters by the remaining types. This is O(smallestSet × types) rather than
     * O(allEntities × types), which matters when the world has many entities.
     */
    static entitiesWith(
        world: World,
        ...componentClasses: ComponentClass<Component>[]
    ): number[] {
        if (componentClasses.length === 0) return [];

        // Pick the component type with the fewest registered entities.
        let pivotType = componentClasses[0];
        let pivotCount = world.getComponentCount(pivotType);
        for (let i = 1; i < componentClasses.length; i++) {
            const count = world.getComponentCount(componentClasses[i]);
            if (count < pivotCount) {
                pivotCount = count;
                pivotType = componentClasses[i];
            }
        }

        const result: number[] = [];
        for (const entity of world.getEntitiesWithComponent(pivotType)) {
            if (componentClasses.every(type => world.hasComponent(entity, type))) {
                result.push(entity);
            }
        }
        return result;
    }
}
