import { Component } from "src/engine/ecs/Component";
import { System } from "src/engine/ecs/System";

type ComponentClass<T extends Component> = abstract new (...args: never[]) => T;

export class World {
    private nextEntityId = 0;
    private entities = new Set<number>();
    private components = new Map<ComponentClass<Component>, Map<number, Component>>();
    private systems: System[] = [];

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

        this.components.get(type)?.set(entity, component);
    }

    removeComponent<T extends Component>(entity: number, componentType: ComponentClass<T>): void {
        this.components.get(componentType)?.delete(entity);
    }

    getComponent<T extends Component>(entity: number, componentType: ComponentClass<T>): T | undefined {
        return this.components.get(componentType)?.get(entity) as T | undefined;
    }

    hasComponent<T extends Component>(entity: number, componentType: ComponentClass<T>): boolean {
        return this.components.get(componentType)?.has(entity) ?? false;
    }

    getEntityIds(): IterableIterator<number> {
        return this.entities.values();
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
