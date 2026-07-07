# AI grounding data (WP-DATA) — DRAFT để duyệt

Data cho tính năng **AI Home Generation** (`01-frontend/AI-HOME-GENERATION-PLAN.md`).
Tất cả file ở đây là **bản nháp**, sinh tự động + chấm tay, **chờ bạn duyệt** trước khi `searchCatalog`/solver/planner đọc.

## Nguồn gốc (provenance)

Hai nguồn khách quan, **không đoán tay**:
1. **Màu ĐO từ icon .webp** — `sample-scenes/extract-material-colors.cjs` decode icon bằng `sharp`,
   trung bình trong **linear-light** (tránh lỗi gamma kéo tối), quy ra `lightness`+`temperature`+`tone`+`hex`.
   → `material-colors.json`. Đây là nguồn `tone` của material (thay bảng chấm tay cũ).
2. **Mine 10 scene mẫu** (`sample-scenes/houses-styles.cjs`) bằng `sample-scenes/mine-ai-data.cjs`
   → tag `style[]` cho object/material + room recipe.

Chạy lại (theo thứ tự): `node sample-scenes/extract-material-colors.cjs` rồi `node sample-scenes/mine-ai-data.cjs`.

Field **`source`** (style): `"mined"` = xuất hiện trong scene → tin cậy cao · `"inferred"` = suy từ tên/category.
Field **`toneSource`** (material): `"measured"` = đo từ icon · `"override"` = sửa tay trong `TONE_OVERRIDE` · `"default"`.

## Các file

| File | Là gì | Bạn cần duyệt |
|---|---|---|
| `material-colors.json` | 63 material → màu đo (`avgHex/domHex/hsl/lightness/temperature/suggestedTone`) | tham khảo (số đo khách quan) |
| `material-tags.json` | 63 material → `tone`+`lightness`+`temperature`+`hex`+`style[]`+`interior` | `tone` giờ ĐO (ít cần sửa); chỉ override khi texture thô ≠ cảm nhận render |
| `object-tags.json` | 107 object → `style[]` + `traits[]` | **`traits`** (chấm tay); `style[]` mined chắc, `[]` = hợp mọi phong cách |
| `style-packs.json` | 10 phong cách → palette + `floorTarget`/`wallTarget`/`avoid` (2 trục) + density + lighting | **target tông, mật độ, nhiệt màu** — phần "gu" |
| `room-recipes.json` | Mined thô: roomType → category → models (count) | tham khảo, không cần sửa |
| `room-recipes-curated.json` | Recipe có chủ đích: roles + required + ý định đặt | **role nào `required`, count, clearance** |
| `defaults.json` | Kích thước/diện tích phòng mặc định | **số m²/phòng, chiều cao trần** |

## Cách duyệt nhanh

1. **material-tags.json** — `tone/lightness/temperature/hex` giờ ĐO khách quan (đối chiếu `material-colors.json`). Nếu thấy texture thô lệch cảm nhận render (vd material dùng làm tường trắng nhưng đo ra xám), thêm vào `TONE_OVERRIDE` trong `mine-ai-data.cjs` rồi chạy lại.
2. **object-tags.json** — `style[]` mined đã ổn; chỉnh `traits` nếu thấy lệch (sửa bảng `TRAITS` trong generator).
3. **style-packs.json** — đọc như một "design brief" mỗi phong cách. `floorTarget/wallTarget` = bộ lọc 2 trục (đã verify mọi material exemplar thoả target của chính nó). Sửa thẳng JSON nếu muốn nới/siết.
4. **room-recipes-curated.json** — chốt phòng "đủ đồ" gồm gì.

## Kết quả khảo sát (đã chạy)

- **Độ phủ style:** mọi phong cách có **20–29 object** mined → **không style nào thiếu đồ**, chưa cần bổ sung GLB gấp.
- **46/107 object** chưa xuất hiện trong scene nào (`style:[]`) — gồm cửa/cửa sổ/đồ điện tử/biến thể/phụ kiện nhỏ → đa số style-neutral, để `[]` là đúng.
- **Phân bố ĐO được (63 material):** lightness — light 12 · medium 37 · dark 14 · | temperature — warm 26 · neutral 34 · cool 3. (Chỉ 3 material lạnh: `Fabric081A`, `Tiles132A`, `Plastic015A` — catalog thiên ấm/trung tính.)
- **Số đo sửa nhiều giả định sai khi đoán tay:** concrete/metal thực ra **neutral** (không "cool"); `Tiles132A` là **tile xanh teal** (không trắng); `Onyx015` đo ra **sáng** (L72, không tối như tên); mọi gỗ **warm** ✓.

## ⚠️ Vấn đề data cần bạn quyết (không tự chấm được)

1. **Tủ quần áo:** catalog **không có category `wardrobes`** → recipe phòng ngủ tạm dùng `drawers`. Có muốn thêm GLB tủ quần áo không?
2. **Bếp = dãy áp tường:** `room-recipes-curated.json > kitchen.counterRun` cần solver xử đặc biệt (xếp nối tiếp), không như đồ rời. Xác nhận hướng này OK cho M1.
3. **Sample-scenes 1 tầng?** Cần xác nhận 10 scene là single-storey (vài cái ghi trần cao 3.6–3.8m nhưng vẫn 1 tầng) để dùng làm reference M1.
4. **`tone` giờ đã ĐO** (không còn chủ quan). Nếu vẫn muốn kiểm, đối chiếu `hex` trong material-tags với icon `public/materials/.../*.webp`. Lưu ý: số đo là của **texture thô**; khi render dưới đèn material có thể sáng hơn — chỉ override nếu lệch rõ.

## Sau khi duyệt

Tag sẽ được merge vào `objects.json`/`materials.json` (hoặc giữ sidecar và cho `searchCatalog` đọc thêm —
chốt khi làm WP2-mở-rộng). StylePack/recipe/defaults được StyleResolver + HousePlanner (WP5/WP6) đọc trực tiếp.
