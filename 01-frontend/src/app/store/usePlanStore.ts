import { create } from "zustand";

export type Wall2D = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

const PX_PER_WORLD = 20;
const ENGINE_DEFAULT_WALLS = [
  { id: 1, x: 6, y: 0.5, z: 0, w: 1, h: 1, d: 10, rotY: 0 },
  { id: 2, x: -6, y: 0.5, z: 0, w: 1, h: 1, d: 10, rotY: 0 },
  { id: 3, x: 0, y: 0.5, z: -6, w: 10, h: 1, d: 1, rotY: 0 }
] as const;

const ORIGIN_X = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
const ORIGIN_Y = typeof window !== "undefined" ? window.innerHeight / 2 : 0;

const initialWalls: Wall2D[] = ENGINE_DEFAULT_WALLS.map((wall) => {
  const wPx = wall.w * PX_PER_WORLD;
  const hPx = wall.d * PX_PER_WORLD;

  return {
    id: wall.id,
    x: wall.x * PX_PER_WORLD + ORIGIN_X - wPx / 2,
    y: ORIGIN_Y + wall.z * PX_PER_WORLD - hPx / 2,
    w: wPx,
    h: hPx,
    rotation: (wall.rotY * 180) / Math.PI
  };
});

type PlanState = {
  walls: Wall2D[];
  addWall: (wall: Omit<Wall2D, "id">) => number;
  updateWall: (id: number, next: Partial<Omit<Wall2D, "id">>) => void;
  setWalls: (walls: Wall2D[]) => void;
};

export const usePlanStore = create<PlanState>((set, get) => ({
  walls: initialWalls,

  addWall: (wall) => {
    const nextId = get().walls.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    set((state) => ({
      walls: [...state.walls, { id: nextId, ...wall }]
    }));
    return nextId;
  },

  updateWall: (id, next) => {
    set((state) => ({
      walls: state.walls.map((wall) => (wall.id === id ? { ...wall, ...next } : wall))
    }));
  },

  setWalls: (walls) => set({ walls })
}));
