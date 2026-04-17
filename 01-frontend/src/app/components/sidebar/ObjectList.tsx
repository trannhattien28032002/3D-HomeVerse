// import ObjectCard from "./ObjectCard";

// const mockData = [
//   { id: 1, name: "Bed Modern", category: "Bed" },
//   { id: 2, name: "Oak Tree", category: "Tree" },
//   { id: 3, name: "Office Chair", category: "Chair" },
//   { id: 4, name: "Dining Table", category: "Table" },
// ];

// type Props = {
//   search: string;
//   category: string;
//   selectedObjectId: number | null;
//   onSelectObject: (id: number) => void;
// };

// export default function ObjectList({ search, category, selectedObjectId, onSelectObject }: Props) {
//   const filtered = mockData.filter((obj) => {
//     const matchSearch = obj.name
//       .toLowerCase()
//       .includes(search.toLowerCase());

//     const matchCategory =
//       category === "All" || obj.category === category;

//     return matchSearch && matchCategory;
//   });

//   return (
//     <div className="grid grid-cols-2 gap-3 p-3">
//       {filtered.map((obj) => (
//         <ObjectCard 
//           key={obj.id} 
//           object={obj} 
//           isSelected={obj.id === selectedObjectId}
//           onClick={() => onSelectObject(obj.id)}
//         />
//       ))}
//     </div>
//   );
// }