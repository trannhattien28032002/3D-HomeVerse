/**
 * Cloudinary client singleton.
 *
 * Dùng chung cho toàn app để build URL ảnh qua @cloudinary/url-gen, kết hợp
 * <AdvancedImage> của @cloudinary/react khi render.
 *
 * Cloud name lấy từ VITE_CLOUDINARY_CLOUD_NAME (đặt trong .env.local), fallback
 * về 'dote71hlj' cho môi trường dev nếu chưa cấu hình.
 */
import { Cloudinary } from "@cloudinary/url-gen";

const cloudName =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? "dote71hlj";

export const cld = new Cloudinary({ cloud: { cloudName } });
