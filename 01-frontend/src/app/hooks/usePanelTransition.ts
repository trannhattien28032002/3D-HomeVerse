/**
 * usePanelTransition — state-machine cho animation đóng/mở panel có exit animation.
 *
 * Vấn đề: panel chỉ render khi `open` → unmount tức thì, không kịp chạy animation thoát.
 * Hook giữ panel `mounted` thêm trong lúc `closing`, rồi unmount khi animation kết thúc.
 *
 * Cách dùng:
 *   const { mounted, closing, onAnimationEnd } = usePanelTransition(open);
 *   if (!mounted) return null;
 *   <div className={closing ? "...-out" : "...-in"} onAnimationEnd={onAnimationEnd} />
 *
 * (Tổng quát hoá pattern mounted/closing + onAnimationEnd vốn có trong DecorCatalog.)
 */
import { useState, useEffect, useCallback } from "react";
import type { AnimationEvent as ReactAnimationEvent } from "react";

export function usePanelTransition(open: boolean) {
    // mounted: vẫn true trong lúc chạy animation thoát, rồi mới về false
    const [mounted, setMounted] = useState(open);
    // closing=true → dùng class animation *-out
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            setClosing(false);
        } else if (mounted) {
            // open→false trong lúc đang mount → chạy animation thoát
            setClosing(true);
        }
    }, [open, mounted]);

    // Gọi bởi onAnimationEnd: chỉ unmount khi đang closing & event từ chính node (không bọt từ con).
    const onAnimationEnd = useCallback(
        (e: ReactAnimationEvent<HTMLElement>) => {
            if (e.target !== e.currentTarget) return;
            if (closing) {
                setMounted(false);
                setClosing(false);
            }
        },
        [closing]
    );

    return { mounted, closing, onAnimationEnd };
}
