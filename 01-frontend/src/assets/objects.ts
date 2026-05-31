/** Catalog of placeable decor objects. */
export type DecorCategory = "Sleeping" | "Kitchen" | "Storage" | "Lighting" | "Outdoors" | "Seating" | "Dining" | "Misc";

export type DecorObject = {
  id: string;
  name: string;
  /** Material Symbols Outlined icon name */
  icon: string;
  category: DecorCategory;
  assetPath: string;
  type: string;
};

export const OBJECTS: DecorObject[] = [
  {
    id: "single_bed_01",
    name: "Single Bed",
    icon: "single_bed",
    category: "Sleeping",
    assetPath: "/models/single_bed.glb",
    type: "furniture",
  },
  {
    id: "bunk_bed_01",
    name: "Bunk Bed",
    icon: "bed",
    category: "Sleeping",
    assetPath: "/models/bunk_bed.glb",
    type: "furniture",
  },
  {
    id: "fridge_01",
    name: "Retro Fridge",
    icon: "kitchen",
    category: "Kitchen",
    assetPath: "/models/fridge.glb",
    type: "appliance",
  },
  {
    id: "wardrobe_01",
    name: "Wardrobe",
    icon: "door_sliding",
    category: "Storage",
    assetPath: "/models/wardrobe.glb",
    type: "furniture",
  },
  {
    id: "armchair_01",
    name: "Armchair",
    icon: "chair",
    category: "Seating",
    assetPath: "/models/armchair.glb",
    type: "furniture",
  },
  {
    id: "dining_table_01",
    name: "Dining Table",
    icon: "table_restaurant",
    category: "Dining",
    assetPath: "/models/dining_table.glb",
    type: "furniture",
  },
  {
    id: "floor_lamp_01",
    name: "Floor Lamp",
    icon: "light",
    category: "Lighting",
    assetPath: "/models/floor_lamp.glb",
    type: "lighting",
  },
  {
    id: "plant_01",
    name: "House Plant",
    icon: "potted_plant",
    category: "Misc",
    assetPath: "/models/plant.glb",
    type: "decor",
  },
  {
    id: "mixer_01",
    name: "Mixer",
    icon: "blender",
    category: "Kitchen",
    assetPath: "/models/mixer.glb",
    type: "appliance",
  },
  {
    id: "fireplace_01",
    name: "Fireplace",
    icon: "fireplace",
    category: "Misc",
    assetPath: "/models/fireplace.glb",
    type: "decor",
  },
  {
    id: "patio_set_01",
    name: "Patio Set",
    icon: "deck",
    category: "Outdoors",
    assetPath: "/models/patio_set.glb",
    type: "furniture",
  },
  {
    id: "rug_01",
    name: "Woven Rug",
    icon: "rug_v",
    category: "Misc",
    assetPath: "/models/rug.glb",
    type: "decor",
  },
];
