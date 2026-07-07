# Traffic flow
> Lối đi: chính ≥ 0.7m, phụ ≥ 0.6m; không chắn cửa; đường thẳng giữa các cửa.

## Nguyên tắc
- **Lối đi chính** (giữa cửa với cửa, quanh giường/sofa): ≥ 0.7m. Dùng `clearance` ≥ 0.7 cho món neo.
- **Lối phụ** (chen giữa đồ phụ): ≥ 0.6m.
- **Không chắn cửa**: chừa vùng trống ~0.9m trước mỗi cửa (truyền vào solver qua `existing[]` opening-clearance).
- **Đường đi thẳng**: tránh bắt người vòng qua đồ; sắp đồ để lối nối các cửa gần thẳng.

## Kiểm
- Eval `checkWalkway(minWalkway)` + `checkDoorClear` (Tầng A) verify được.
- Nếu lối < ngưỡng → tăng `clearance` hoặc bớt món (xem `small-space-optimization`).
