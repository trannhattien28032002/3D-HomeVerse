# Furnish: Bếp
> Bố cục bếp: tủ/thiết bị thành DÃY áp tường liên tục, tam giác bếp hợp lý.

## Nguyên tắc
- **Counter run** (dãy bếp): tủ chậu rửa + bếp/lò + tủ + tủ lạnh xếp NỐI TIẾP dọc CÙNG một tường. Phát các intent cùng `against` một tường, `align` tăng dần (0.1, 0.3, 0.5, …), `clearance: 0` để xếp sát hàng.
- **Tam giác bếp**: chậu rửa – bếp – tủ lạnh tạo tam giác đi lại ngắn; không đặt 3 cái dồn 1 chỗ.
- **Bàn ăn nhỏ** (nếu có): `center`, `clearance` 0.6m để kéo ghế.

## Lưu ý quan trọng
- ⚠️ Solver hiện xếp dãy bằng `align` thủ công — KIỂM tra không tràn khỏi tường. Nếu tường ngắn, giảm số tủ.
- Tủ lạnh nên ở đầu dãy (gần lối vào), không kẹp giữa bếp nóng.
- Chừa ≥ 1.0m trước dãy bếp để thao tác.
- Recipe: `room-recipes-curated.json > kitchen.counterRun`.
