// type Props = {
//   object: {
//     id: number;
//     name: string;
//     category: string;
//   };
//   isSelected: boolean;
//   onClick: () => void;
// };

// export default function ObjectCard({ object, isSelected, onClick }: Props) {
//   return (
//     <div 
//       onClick={onClick}
//       className={`p-3 rounded cursor-pointer transition ${
//         isSelected ? "bg-[#3a3a3a] ring-2 ring-green-500" : "bg-[#2a2a2a] hover:bg-[#3a3a3a]"
//       }`}
//     >
//       <div className="h-20 bg-gray-600 rounded mb-2" />
//       <p className="text-sm">{object.name}</p>
//     </div>
//   );
// }