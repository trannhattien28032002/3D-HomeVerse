/**
 * Kiểu dữ liệu project phía FE — khớp `02-backend/domains/projects/projects.types.ts`.
 *
 * Lưu ý: backend dùng `Date` cho các field thời gian, nhưng khi serialize qua
 * HTTP (JSON) thì luôn ra ISO string — nên ở đây type là `string`, không phải `Date`.
 */
export interface ProjectMeta {
    id: string;
    ownerId: string;
    name: string;
    thumbnailUrl: string | null;
    floorCount: number;
    isTemplate: boolean;
    isPublic: boolean;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
