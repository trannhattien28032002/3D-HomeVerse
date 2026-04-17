import { Component } from "./Component";
import { System } from "./System";

type ComponentClass<T extends Component> = new (...args: any[]) => T;

export class World {
    private nextEntityId: number;
    entities: Set<number>;
    private components: Map<ComponentClass<Component>, Map<number, Component>>;
    private systems: System[];

    constructor() {
        this.nextEntityId = 0;
        this.entities = new Set();
        this.components = new Map();
        this.systems = [];
    }

    createEntity(): number {
        const id = this.nextEntityId++;
        this.entities.add(id);
        return id;
    }

    destroyEntity(entity: number): void {
        this.entities.delete(entity);

        for (const componentMap of this.components.values()) {
            componentMap.delete(entity);
        }
    }

    addComponent<T extends Component>(entity: number, component: T): void {
        const type = component.constructor as ComponentClass<T>;

        if (!this.components.has(type)) {
            this.components.set(type, new Map());
        }

        this.components.get(type)!.set(entity, component);
    }

    removeComponent<T extends Component>(
        entity: number,
        componentType: ComponentClass<T>
    ): void {
        const componentMap = this.components.get(componentType);

        if (componentMap) {
            componentMap.delete(entity);
        }
    }

    getComponent<T extends Component>(
        entity: number,
        componentType: ComponentClass<T>
    ): T | undefined {
        const componentMap = this.components.get(componentType);
        return componentMap ? (componentMap.get(entity) as T) : undefined;
    }

    hasComponent<T extends Component>(
        entity: number,
        componentType: ComponentClass<T>
    ): boolean {
        const componentMap = this.components.get(componentType);
        return componentMap ? componentMap.has(entity) : false;
    }

    addSystem(system: System): void {
        this.systems.push(system);
    }

    update(deltaTime: number): void {
        for (const system of this.systems) {
            system.update(this, deltaTime);
        }
    }
}