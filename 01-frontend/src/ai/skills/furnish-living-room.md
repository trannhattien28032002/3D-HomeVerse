# Furnish: Phòng khách
> Bố cục phòng khách: sofa áp tường, bàn trà giữa, TV đối diện, chừa lối đi.

## Nguyên tắc
- **Sofa**: món neo, `against` một tường, `facing: "into-room"`, `clearance` ≥ 0.6m.
- **TV** (wall-mounted): tường ĐỐI DIỆN sofa → dùng `addOpening`/wall-mount, KHÔNG qua furnishRoom.
- **Bàn trà**: `against: "center"`, trước sofa, `clearance` ~0.4m (đủ để lách chân).
- **Thảm**: dưới bàn trà, `clearance: 0`.
- **Ghế đơn / armchair**: góc (`corner-*`), quay vào cụm ngồi.
- **Kệ / cây**: tường trống / góc.

## Thứ tự
sofa → coffee table → rug → (TV mount) → armchair → shelf → plant.

## Lưu ý
- Cụm ngồi (sofa–bàn–ghế) nên quây quanh tâm, không rải khắp phòng.
- Khoảng sofa↔bàn trà 0.3–0.45m. Lối đi chính ≥ 0.7m (xem `traffic-flow`).
- Recipe: `room-recipes-curated.json > living`.
