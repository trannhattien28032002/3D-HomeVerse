/**
 * Đại diện cho một Đối tượng (Entity) trong hệ thống ECS.
 * Entity thực chất chỉ là một ID (con số) đặc trưng, nó được gán các Component để tạo thành vật thể.
 */
export class Entity {
    id: number;

    constructor(id: number) {
        this.id = id;
    }
}