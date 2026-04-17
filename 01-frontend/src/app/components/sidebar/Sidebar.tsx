// import { useState } from "react";
// import { useUIStore } from "@/app/store/useUIStore";

// import SidebarHeader from "@/app/components/sidebar/SidebarHeader";
// import CategoryFilter from "@/app/components/sidebar/CategoryFilter";
// import ObjectList from "@/app/components/sidebar/ObjectList";
// import AddButton from "@/app/components/sidebar/AddButton";

// const categories = ["All", "Bed", "Tree", "Chair", "Table"];

// export default function Sidebar() {
//   const isOpen = useUIStore((s) => s.isSidebarOpen);
//   const close = useUIStore((s) => s.closeSidebar);

//   const [search, setSearch] = useState("");
//   const [category, setCategory] = useState("All");
//   const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);

//   return (
//     <>
//       {/* Overlay */}
//       {isOpen && (
//         <div
//           onClick={close}
//           className="fixed inset-0 bg-black/40 z-40"
//         />
//       )}

//       {/* Sidebar */}
//      <div
//   className={`
//     fixed top-0 left-0 z-50
//     h-full flex
//     transition-transform duration-300
//     ${isOpen ? "translate-x-0" : "-translate-x-full"}
//   `}
// >
//   {/* Category bar */}
//   <CategoryFilter
//     categories={categories}
//     selected={category}
//     onSelect={setCategory}
//   />

//   {/* Main panel */}
//   <div className="w-72 bg-[#1e1e1e] text-white flex flex-col border-r border-gray-700">
//     <SidebarHeader search={search} setSearch={setSearch} />

//     <div className="flex-1 overflow-y-auto">
//       <ObjectList 
//         search={search} 
//         category={category} 
//         selectedObjectId={selectedObjectId}
//         onSelectObject={setSelectedObjectId}
//       />
//     </div>

//     <AddButton selectedObjectId={selectedObjectId} />
//   </div>
// </div>
//     </>
//   );
// }