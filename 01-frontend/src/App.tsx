import { useEffect } from "react";
import Router from "src/app/routes/Routes";
import { useAuthStore } from "src/app/store/useAuthStore";
import { Toaster } from "src/app/components/common/Toast";

/**
 * Root component — bootstrap session Supabase (A2) rồi mount Router.
 * Router chỉ render khi status !== "loading" để tránh flash redirect sai
 * (vd RequireAuth điều hướng về /login trước khi biết thực sự có session hay không).
 * useEffect cleanup gọi unsubscribe trả về từ initAuth() — tránh leak listener
 * khi React StrictMode mount/unmount/mount lại ở dev.
 */
function App() {
    const status = useAuthStore((s) => s.status);
    const initAuth = useAuthStore((s) => s.initAuth);

    useEffect(() => {
        const unsubscribe = initAuth();
        return unsubscribe;
    }, [initAuth]);

    if (status === "loading") return null;

    return <>
        <Router></Router>
        <Toaster />
    </>;
}

export default App;
