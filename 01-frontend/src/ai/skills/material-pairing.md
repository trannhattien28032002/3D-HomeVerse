# Material pairing
> Phối vật liệu theo 2 trục đo (lightness + temperature) khớp StylePack target.

## Nguyên tắc
- Mỗi material trong `material-tags.json` có `lightness` (light/medium/dark) + `temperature` (warm/cool/neutral) + `hex` ĐO từ icon.
- **Sàn**: chọn material có `lightness ∈ floorTarget.lightness && temperature ∈ floorTarget.temperature`, loại theo `avoid`.
- **Tường**: tương tự `wallTarget`; tường nên SÁNG hơn sàn (cảm giác rộng, thoáng).
- **Không trộn nghịch nhiệt**: tránh sàn warm + tường cool trong cùng phòng (trừ Modern cố ý).
- **Điểm nhấn**: 1 mảng tương phản (gạch/gỗ sẫm) là đủ; đừng nhiều mảng rối.

## Quy tắc nhanh
- Phòng ướt (bếp/WC): dùng `bathFloor/bathWall/kitchenFloor` (tile chống ẩm) thay sàn gỗ.
- "Tông sáng/airy" → ưu tiên `lightness: light`, `temperature: warm/neutral`.
- Áp qua `SET_FLOOR_MATERIAL` / `SET_WALL_MATERIAL`. Liên quan từng StylePack.
