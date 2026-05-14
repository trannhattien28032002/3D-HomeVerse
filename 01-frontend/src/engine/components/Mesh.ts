import * as THREE from "three";
import { Component } from "src/engine/ecs/Component";

export class Mesh extends Component {
    mesh: THREE.Mesh;

    constructor(mesh: THREE.Mesh) {
        super();
        this.mesh = mesh;
    }
}