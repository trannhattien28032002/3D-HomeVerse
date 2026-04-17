// export type EngineEventMap = {
//     selectionChanged: { entityId: number | null };
//     draggingChanged: { entityId: number | null; dragging: boolean };
//     transformChanged: { entityId: number; x: number; y: number; z: number; rotY?: number };
// };

// type Handler<T> = (payload: T) => void;

// export class EngineEvents {
//     // Keep internal storage untyped to avoid TS indexed-access Set incompatibilities,
//     // while preserving type-safety at the public API boundary.
//     private handlers = new Map<keyof EngineEventMap, Set<(payload: any) => void>>();

//     on<K extends keyof EngineEventMap>(type: K, handler: Handler<EngineEventMap[K]>): () => void {
//         let set = this.handlers.get(type);
//         if (!set) {
//             set = new Set();
//             this.handlers.set(type, set);
//         }
//         set.add(handler as any);
//         return () => {
//             set!.delete(handler as any);
//         };
//     }

//     emit<K extends keyof EngineEventMap>(type: K, payload: EngineEventMap[K]) {
//         const set = this.handlers.get(type);
//         if (!set || set.size === 0) return;
//         for (const handler of set) handler(payload);
//     }
// }

