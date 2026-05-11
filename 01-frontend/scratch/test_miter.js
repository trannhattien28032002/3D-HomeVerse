function normalizeAngle(a) {
    while (a < -Math.PI) a += 2 * Math.PI;
    while (a > Math.PI) a -= 2 * Math.PI;
    return a;
}

function intersectLines(p1, d1, p2, d2) {
    const det = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(det) < 1e-6) return null;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const u = (dx * d2.z - dz * d2.x) / det;
    return { x: p1.x + u * d1.x, z: p1.z + u * d1.z };
}

function computeNodeMiters(nodePos, connectedWalls) {
    // nodePos = {x, z}
    // connectedWalls = [ { id, dir: {x, z}, thickness: number, isStart: boolean } ]
    
    if (connectedWalls.length === 0) return {};

    // 1. Calculate angles and sort counter-clockwise
    const walls = connectedWalls.map(w => {
        const len = Math.hypot(w.dir.x, w.dir.z);
        const nx = w.dir.x / len;
        const nz = w.dir.z / len;
        return {
            ...w,
            nx, nz,
            angle: Math.atan2(nz, nx),
            // Left normal vector
            leftNx: -nz, leftNz: nx,
            // Right normal vector
            rightNx: nz, rightNz: -nx
        };
    });

    walls.sort((a, b) => a.angle - b.angle);

    const miterPoints = {}; // wallId -> { leftPoint, rightPoint }
    
    if (walls.length === 1) {
        const w = walls[0];
        const halfT = w.thickness / 2;
        miterPoints[w.id] = {
            leftPoint: { x: nodePos.x + w.leftNx * halfT, z: nodePos.z + w.leftNz * halfT },
            rightPoint: { x: nodePos.x + w.rightNx * halfT, z: nodePos.z + w.rightNz * halfT }
        };
        return miterPoints;
    }

    const MITER_LIMIT = 5; // max multiple of thickness

    for (let i = 0; i < walls.length; i++) {
        const w1 = walls[i];
        const w2 = walls[(i + 1) % walls.length]; // next wall counter-clockwise

        // Intersect Left of w1 with Right of w2
        const halfT1 = w1.thickness / 2;
        const p1 = { x: nodePos.x + w1.leftNx * halfT1, z: nodePos.z + w1.leftNz * halfT1 };
        const d1 = { x: w1.nx, z: w1.nz };

        const halfT2 = w2.thickness / 2;
        const p2 = { x: nodePos.x + w2.rightNx * halfT2, z: nodePos.z + w2.rightNz * halfT2 };
        const d2 = { x: w2.nx, z: w2.nz };

        let inter = intersectLines(p1, d1, p2, d2);
        
        // Miter limit check
        if (inter) {
            const distSq = (inter.x - nodePos.x)**2 + (inter.z - nodePos.z)**2;
            const maxDist = Math.max(w1.thickness, w2.thickness) * MITER_LIMIT;
            if (distSq > maxDist * maxDist) {
                inter = null;
            }
        }

        if (!inter) {
            // Fallback: just use square ends
            // But wait, if they are parallel, they form a straight line, intersection is exactly the offset!
            // Let's check if they form a straight line (angle diff ~ PI)
            let angleDiff = normalizeAngle(w2.angle - w1.angle);
            if (Math.abs(Math.abs(angleDiff) - Math.PI) < 1e-4) {
                // Straight line: use p1 (which equals p2)
                inter = p1;
            } else {
                // Acute spike fallback
                inter = { x: (p1.x + p2.x)/2, z: (p1.z + p2.z)/2 }; // basic average
            }
        }

        // Save the intersection point
        if (!miterPoints[w1.id]) miterPoints[w1.id] = {};
        if (!miterPoints[w2.id]) miterPoints[w2.id] = {};

        miterPoints[w1.id].leftPoint = inter;
        miterPoints[w2.id].rightPoint = inter;
    }

    return miterPoints;
}

const nodePos = {x: 0, z: 0};
const walls = [
    { id: 'w1', dir: {x: 1, z: 0}, thickness: 1, isStart: true }, // right
    { id: 'w2', dir: {x: 0, z: -1}, thickness: 1, isStart: true } // up (z is negative)
];

console.log(computeNodeMiters(nodePos, walls));
