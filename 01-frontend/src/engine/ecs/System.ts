import { World } from "src/engine/ecs/World";

/**
 * Lớp cơ sở (Base Class) cho tất cả các System trong hệ thống ECS.
 * System chứa toàn bộ Data Logic. Nó lặp qua các Entity có Component phù hợp để xử lý.
 */
export abstract class System {
    /**
     * Hàm vòng lặp, được World gọi tự động mỗi khung hình (Frame).
     * @param world Tham chiếu lại môi trường ECS
     * @param deltaTime Thời gian trôi qua giữa 2 frame (tính bằng giây)
     */
    update(world: World, deltaTime: number): void {
        void world;
        void deltaTime;
    }
}
