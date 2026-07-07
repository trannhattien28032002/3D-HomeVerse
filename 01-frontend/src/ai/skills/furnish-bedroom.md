# Furnish: Phòng ngủ
> Bố cục phòng ngủ: giường áp tường dài, tủ đầu giường hai bên, lối đi ≥0.7m.

## Nguyên tắc
- **Giường** là món neo cứng, đặt TRƯỚC: `against` một tường DÀI, đầu giường áp tường, mặt quay vào phòng (`facing: "into-room"`). Chừa `clearance` ≥ 0.7m phía trước để đi lại.
- **Tủ đầu giường** (drawers nhỏ): hai bên đầu giường, `clearance` thấp (~0.1) để áp sát. Nếu phòng hẹp, bỏ bớt 1 cái.
- **Tủ quần áo / drawers lớn**: `against` tường còn trống, không chắn cửa/cửa sổ.
- **Thảm**: dưới/cạnh giường, `clearance: 0` (đồ trang trí, không tính lối đi).

## Thứ tự ưu tiên đặt
1. bed → 2. nightstands → 3. wardrobe → 4. rug → 5. plant/decor góc.

## Lưu ý
- Không chắn cửa ra vào: để vùng trống ~0.9m trước cửa.
- Phòng nhỏ (< 9m²): chỉ giường + 1 tủ, ưu tiên khoảng trống (xem skill `small-space-optimization`).
- Tham chiếu recipe: `room-recipes-curated.json > bedroom`.
