import { useUIStore } from "../store/useUIStore";

export default function FloatingButton() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);

  return (
    <button
      onClick={toggleSidebar}
      className={`
        fixed bottom-5 left-5 z-50
        w-12 h-12
        rounded-full
        flex items-center justify-center
        text-white text-xl
        shadow-lg
        transition
        ${
          isSidebarOpen
            ? "bg-red-500 rotate-45"
            : "bg-blue-500"
        }
      `}
    >
      +
    </button>
  );
}