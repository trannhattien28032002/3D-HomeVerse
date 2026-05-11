# CAD-Grade Topology Normalization Architecture

To achieve a professional, Tiny Glade-like or CAD-lite topology system, you must shift from ad-hoc mutation repairs to a **deterministic normalization pipeline**. 

The core philosophy of robust topological graph systems is the **Fragment -> Deduplicate -> Heal** pattern. Instead of trying to cleverly avoid creating overlapping or intersecting geometry during a user interaction, the system allows the graph to temporarily become "messy" during the interaction, and then immediately runs a brute-force normalization pass that standardizes the graph.

---

## 1. Architectural Overview

### ECS & Command-Driven Workflow
Your React/Konva frontend should remain strictly a "dumb client". It issues semantic commands (`ADD_WALL`, `MOVE_NODE`, etc.). 

The backend (ECS 3D Engine) processes these commands in three distinct phases:
1. **Raw Mutation:** Apply the user's intent naively (e.g., insert the new edge, move the node). This might create overlaps or intersections.
2. **Topology Normalization:** Run `TopologySystem.normalize()` to enforce graph invariants.
3. **Downstream Systems:** Run `RoomSystem.update()` and `GeometrySystem.update()` strictly on the *normalized* graph.

### The Pipeline Order
Whenever a topological mutation command is processed, the system executes the pipeline in this exact order:

```text
User Action (Draw, Drag) 
  → dispatch(Command)
    → Engine applies Raw Mutation
      → TopologySystem.normalize()
        → RoomSystem.detectRooms()
          → GeometrySystem.rebuildMeshes()
```

---

## 2. Strict Topology Invariants

A "clean" graph must guarantee the following invariants before room detection or geometry generation can safely run:

1. **No Intersections:** Two edges (walls) cannot cross without a shared node at the intersection point.
2. **No Point-on-Line:** No node can lie exactly on an edge without splitting that edge.
3. **No Overlaps:** Edges cannot be collinear and overlapping.
4. **No Duplicates:** Between any two nodes $A$ and $B$, there is at most one edge.
5. **No Zero-Length Edges:** Distance between an edge's start and end nodes must be $> \epsilon$.
6. **No Redundant Nodes (Collinear):** A node of degree 2 where the two connecting edges are collinear (and share the same properties) is removed, and the edges are merged.

---

## 3. Processing Flow per Mutation

You do not need different normalization logic for different commands. You run the **exact same pipeline** after any mutation.

After `ADD_WALL`, `MOVE_NODE`, `SPLIT_WALL`, or `MERGE_NODE`:
1. Run `normalize()` pipeline.
2. Fire a `TopologyChanged` event internally in ECS.
3. Trigger Room/Geometry updates.

---

## 4. Algorithms: The Normalization Pipeline

The `TopologySystem.normalize()` method executes the **Fragment -> Deduplicate -> Heal** algorithm sequence:

### Step 1: Fragment (Intersection & Overlap Resolution)
Instead of complex boolean logic for overlapping polygons, we fragment the 1D graph.
1. **Node-on-Edge Splitting:** For every node and every edge, if the node lies geometrically on the edge (within $\epsilon$), split the edge into two at that node. *(This implicitly resolves collinear overlaps because the endpoints of the overlapping segment will split the larger segment!)*
2. **Edge-Edge Intersection:** For every pair of edges, if they intersect, create a new Node at the intersection point, and split both edges.

*Result: A highly fragmented graph where no lines cross or overlap without shared nodes. It is mathematically safe but messy.*

### Step 2: Clean & Deduplicate
1. **Zero-Length Removal:** Delete any edge where $length < \epsilon$.
2. **Duplicate Removal:** Enforce a canonical edge direction (e.g., `startNodeId < endNodeId`). Store edges in a Hash Set/Map keyed by `${min}-${max}`. If a duplicate is found, delete it.

*Result: Overlapping walls that were fragmented in Step 1 have produced identical duplicate sub-segments. Step 2 deletes the duplicates seamlessly!*

### Step 3: Heal (Collinear Merge & Cleanup)
1. **Collinear Merge:** Iterate over all nodes. If a node has exactly degree 2 (connects to exactly two walls), and the angle between the walls is $180^\circ$ (dot product $\approx -1$) and their thicknesses match: Delete the node and replace the two edges with a single long edge.
2. **Dangling Node Cleanup:** Delete any node with degree 0 (no connected walls).

*Result: A perfectly canonical, minimalist graph ready for procedural geometry.*

---

## 5. Recommended Data Structures

To support ECS and fast graph traversal:
* **NodeRegistry:** Map of `NodeId -> { x, z }`
* **EdgeRegistry:** Map of `WallId -> { startNodeId, endNodeId, thickness }`
* **Adjacency Index:** A dynamically rebuilt mapping of `NodeId -> Array<WallId>`. Rebuild this at the start of `normalize()` and `RoomSystem`.
* **Spatial Hash (Optional):** If wall counts exceed ~500, a simple 2D Grid spatial hash to quickly find candidate intersections instead of $O(N^2)$ checks.

---

## 6. TypeScript Pseudo-Code Implementation

```typescript
const EPSILON = 1e-5; // World units

class TopologySystem {
    
    public normalize(nodes: Map<number, Node>, walls: Map<number, Wall>) {
        // Step 1: Fragment
        this.resolveIntersectionsAndOverlaps(nodes, walls);
        
        // Step 2: Clean
        this.removeZeroLengthWalls(walls);
        this.removeDuplicateWalls(walls);
        
        // Step 3: Heal
        this.mergeCollinearWalls(nodes, walls);
        this.cleanupDanglingNodes(nodes, walls);
    }

    private resolveIntersectionsAndOverlaps(nodes: Map<number, Node>, walls: Map<number, Wall>) {
        let hasChanges = true;
        
        // Loop until no new intersections are found (as new splits create new segments)
        while(hasChanges) {
            hasChanges = false;
            
            // 1. Node-on-Edge Splitting
            for (const [nodeId, node] of nodes.entries()) {
                for (const [wallId, wall] of walls.entries()) {
                    if (wall.startNodeId === nodeId || wall.endNodeId === nodeId) continue;
                    
                    if (this.isPointOnSegment(node, wall.startNodeId, wall.endNodeId, nodes)) {
                        this.splitWallAtNode(wallId, nodeId, walls);
                        hasChanges = true;
                        break; 
                    }
                }
                if (hasChanges) break;
            }
            if (hasChanges) continue;

            // 2. Edge-Edge Intersection
            const wallArray = Array.from(walls.values());
            for (let i = 0; i < wallArray.length; i++) {
                for (let j = i + 1; j < wallArray.length; j++) {
                    const w1 = wallArray[i];
                    const w2 = wallArray[j];
                    
                    // Skip if they share a node
                    if (this.shareNode(w1, w2)) continue;

                    const intersection = this.getSegmentIntersection(w1, w2, nodes);
                    if (intersection) {
                        const newNodeId = generateId();
                        nodes.set(newNodeId, intersection);
                        
                        this.splitWallAtNode(w1.id, newNodeId, walls);
                        this.splitWallAtNode(w2.id, newNodeId, walls);
                        
                        hasChanges = true;
                        break;
                    }
                }
                if (hasChanges) break;
            }
        }
    }

    private removeDuplicateWalls(walls: Map<number, Wall>) {
        const seen = new Set<string>();
        for (const [id, wall] of walls.entries()) {
            const min = Math.min(wall.startNodeId, wall.endNodeId);
            const max = Math.max(wall.startNodeId, wall.endNodeId);
            const hash = `${min}-${max}`;
            
            if (seen.has(hash)) {
                walls.delete(id);
            } else {
                seen.add(hash);
            }
        }
    }

    private mergeCollinearWalls(nodes: Map<number, Node>, walls: Map<number, Wall>) {
        const adjacency = this.buildAdjacency(walls);
        
        for (const [nodeId, connectedWallIds] of adjacency.entries()) {
            if (connectedWallIds.length === 2) {
                const w1 = walls.get(connectedWallIds[0])!;
                const w2 = walls.get(connectedWallIds[1])!;
                
                // Ensure same thickness/properties before merging
                if (w1.thickness !== w2.thickness) continue;

                if (this.areCollinear(w1, w2, nodes)) {
                    // Find the far endpoints
                    const farNode1 = w1.startNodeId === nodeId ? w1.endNodeId : w1.startNodeId;
                    const farNode2 = w2.startNodeId === nodeId ? w2.endNodeId : w2.startNodeId;
                    
                    // Replace w1 with merged wall, delete w2 and the node
                    w1.startNodeId = farNode1;
                    w1.endNodeId = farNode2;
                    
                    walls.delete(w2.id);
                    nodes.delete(nodeId);
                    
                    // Note: In ECS, defer deletions or handle adjacency updates if iterating
                }
            }
        }
    }

    private cleanupDanglingNodes(nodes: Map<number, Node>, walls: Map<number, Wall>) {
        const activeNodes = new Set<number>();
        for (const wall of walls.values()) {
            activeNodes.add(wall.startNodeId);
            activeNodes.add(wall.endNodeId);
        }
        for (const nodeId of nodes.keys()) {
            if (!activeNodes.has(nodeId)) {
                nodes.delete(nodeId);
            }
        }
    }
}
```

---

## 7. Edge Cases & Editor UX Behavior

*   **Floating Point Errors:** Always use a strict `EPSILON` for distance checks, point-on-line checks, and dot products. `1e-5` is standard for world space operations.
*   **Editor UX:** When a user drags a wall in React, the `onDragMove` should issue continuous `MOVE_NODE` commands for both start and end nodes. You can throttle the normalization during the active drag (to save CPU) and run full `NORMALIZE_TOPOLOGY` strictly on `onDragEnd`.
*   **Procedural Geometry:** Once topology is normalized, procedural geometry (3D wall meshes) becomes trivial. Every `Node` is a guaranteed corner/junction, and every `Wall` is a guaranteed solid segment with no intersecting faces. Miter joins and Bevels will generate cleanly because the graph is canonical.
*   **Room Detection:** Normalization guarantees planar graph integrity. A simple Right-Hand-Wall follow algorithm will perfectly extract cycles for rooms.
