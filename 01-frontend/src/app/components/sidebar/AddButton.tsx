// import { addObject } from "@/bridge/commands/addObject";
// import { dispatch } from "@/bridge/events"
// type Props = {
//   selectedObjectId: number | null;
// };

// export default function AddButton({ object }: Props) {
//   const handleAdd = () => {
//     dispatch({
//       type: "ADD_OBJECT",
//       payload: {
//         objectId: object.id
//       }
//     })
//   }
  
//   return (
//     <div className="p-3 border-t border-gray-700">
//       <button 
//         disabled={object === null}
//         className={`w-full py-2 rounded transition-colors ${
//           object === null 
//             ? "bg-gray-600 text-gray-400 cursor-not-allowed" 
//             : "bg-green-500 hover:bg-green-600 text-white"
//         }`}
//       >
//         + Add Object
//       </button>
//     </div>
//   );
// }