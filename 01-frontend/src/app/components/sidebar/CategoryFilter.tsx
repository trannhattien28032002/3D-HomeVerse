// import {
//   LayoutGrid,
//   BedDouble,
//   TreePine,
//   Armchair,
//   Table,
// } from "lucide-react";

// type Props = {
//   categories: string[];
//   selected: string;
//   onSelect: (c: string) => void;
// };

// const iconMap: Record<string, any> = {
//   All: LayoutGrid,
//   Bed: BedDouble,
//   Tree: TreePine,
//   Chair: Armchair,
//   Table: Table,
// };

// export default function CategoryFilter({
//   categories,
//   selected,
//   onSelect,
// }: Props) {
//   return (
//     <div className="w-16 bg-[#181818] flex flex-col items-center py-3 gap-3 border-r border-gray-700">
//       {categories.map((c) => {
//         const Icon = iconMap[c];

//         return (
//           <button
//             key={c}
//             onClick={() => onSelect(c)}
//             className={`
//               w-10 h-10
//               flex items-center justify-center
//               rounded-lg
//               transition
//               ${
//                 selected === c
//                   ? "bg-blue-500 text-white"
//                   : "text-gray-400 hover:bg-[#2a2a2a]"
//               }
//             `}
//             title={c}
//           >
//             <Icon size={18} />
//           </button>
//         );
//       })}
//     </div>
//   );
// }