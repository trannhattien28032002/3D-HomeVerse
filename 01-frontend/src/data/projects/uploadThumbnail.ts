/**
 * Upload ảnh thumbnail project thẳng từ FE lên Supabase Storage (bucket public
 * `project-thumbnails`, xem migration 015_storage_project_thumbnails.sql).
 *
 * Đường dẫn quy ước: `{userId}/{projectId}` — folder đầu = userId để khớp RLS
 * policy (`(storage.foldername(name))[1] = auth.uid()::text`).
 */
import { supabase } from "src/data/auth/supabaseClient";

const BUCKET = "project-thumbnails";

/** Upload file thumbnail, trả public URL. Ném lỗi nếu upload thất bại. */
export async function uploadThumbnail(file: File, projectId: string, userId: string): Promise<string> {
    const path = `${userId}/${projectId}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) {
        throw error;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
}
