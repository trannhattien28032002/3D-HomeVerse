# Sample scenes (.homeverseplan)

Bộ dữ liệu scene mẫu để test, mỗi file một phong cách kiến trúc, nhiều phòng và đã bày nội thất.

| File | Phong cách | Bố cục |
|------|-----------|--------|
| `01-hien-dai.homeverseplan` | Hiện đại | Phòng khách lớn thông tầng + bếp/ăn/ngủ/tắm (5 phòng) |
| `02-co-dien.homeverseplan` | Cổ điển | Sảnh trung tâm đối xứng, salon, thư viện, ăn, bếp; tường dày 0.25m, cao 3.6m |
| `03-toi-gian.homeverseplan` | Tối giản | Living-kitchen mở, bê tông + gỗ sáng, đồ thưa (3 phòng) |
| `04-tan-co-dien.homeverseplan` | Tân cổ điển | Foyer, grand living, dining, bếp, master suite; đá cẩm thạch/onyx, cao 3.8m |
| `05-nhat-ban.homeverseplan` | Nhật Bản | Genkan, phòng chiếu/tatami, ngủ, bếp, ofuro; gỗ mộc, đồ thấp (6 phòng) |

## Cách dùng

Mở editor → **Ctrl+O** (hoặc nút Save/Load) → chọn file `.homeverseplan`.

## Sinh lại / chỉnh sửa

Bố cục được mô tả bằng toạ độ mét trong `houses.cjs`; `generate.cjs` tự:
- chia tường tại mọi giao điểm (để `RoomSystem` dò ra phòng),
- tính `floors[roomKey]` (roomKey = các nodeId chu vi, sort + join `,`) khớp engine,
- resolve cửa/cửa sổ/đồ-treo về `hostWallId`,
- validate mọi `modelId`/`materialId` theo `objects.json` & `materials.json`.

```bash
node sample-scenes/generate.cjs
```

> Lưu ý: hướng quay (`deg`) và `side` của đồ treo đặt theo quy ước "song song với tường";
> tuỳ pivot/front-face của model mà mặt quay có thể lệch — không ảnh hưởng việc nạp file.
