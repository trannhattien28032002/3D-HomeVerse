import { World } from "./World";

export abstract class System {
    update(world: World, deltaTime: number): void {}
}