import { World } from "./World";
import { Component } from "./Component";

type ComponentClass<T extends Component> = new (...args: any[]) => T;

export class Query {
    static entitiesWith(
        world: World,
        ...componentClasses: ComponentClass<Component>[]
    ): number[] {
        return [...world.entities].filter(entity =>
            componentClasses.every(componentClass =>
                world.hasComponent(entity, componentClass)
            )
        );
    }
}