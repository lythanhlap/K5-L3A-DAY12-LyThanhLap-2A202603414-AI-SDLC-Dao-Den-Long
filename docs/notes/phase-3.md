# Phase 3: Ticket-03 "Đèn cạn dầu" (Change Request, Contract v1.2)

Nguồn: tab Phase 3 trên lab board (đọc qua trình duyệt ngày 2026-11-20). Quyết định thiết kế: [ADR-0001](../adr/0001-lantern-fuel-and-dawn-win.md). Thay đổi phá vỡ tương thích: [CHANGELOG.md](../../CHANGELOG.md).

## Tóm tắt luật mới

1. **Nhiên liệu đèn** ([THAY THẾ] "đèn đã sáng không nhận thêm đom đóm"):
   - Dầu tối đa 100, vừa thắp (lần đầu hoặc thắp lại) thì dầu = 100. Hao 1,0/giây (1/60 mỗi tick).
   - **Châm dầu**: bấm Tương tác ở đèn đang sáng → `used = min(mang, ceil((100 − fuel)/10))`, `fuel = min(100, fuel + 10·used)`. Đèn đầy (`used = 0`) không được chọn.
   - **Chọn đèn**: chỉ xét đèn "nhận được" (chưa sáng, hoặc sáng nhưng chưa đầy); gần nhất, bằng nhau thì id nhỏ hơn.
   - **Hết dầu** (fuel ≤ 0) → tắt, `deposited = 0`, sự kiện `lantern_out`, `ever_lit = true`. Thắp lại đèn đã từng sáng chỉ cần **5** đom đóm.
   - **Hiển thị**: có thanh dầu; khi fuel < 30 thì đèn và thanh nhấp nháy 1 Hz.
2. **Bóng Mực hút dầu** ([THAY THẾ] "không bao giờ vào vùng an toàn"):
   - Đèn có fuel < 30 mất vùng an toàn (đúng 30 vẫn còn).
   - Chỉ bóng đang `wander` mới đi tới đèn sáng có fuel < 30 gần nhất (bằng nhau thì id nhỏ hơn). Không có thì đi về đèn tắt gần nhất. Bóng đang chase không đổi mục tiêu.
   - Khi cách đèn ≤ 2 m (XZ) → trạng thái `drain`: đứng yên, hút 5 fuel/giây (cộng dồn nhiều con, đèn vẫn tự hao).
   - Từ `drain`: sang `chase` nếu Mây trong 6 m; sang `stunned` nếu trúng Tỏa Sáng; sang `wander` nếu đèn tắt, dầu ≥ 30, hoặc cách > 2 m.
   - Hết choáng thì về `wander`.
   - Châm dầu lên ≥ 30 khi có bóng trong 6 m → đẩy ra mép trong ≤ 30 tick, không gây sát thương.
3. **Luật thắng mới** ([THAY THẾ] "thắng ngay khi tất cả đèn sáng"):
   - Thời gian 240 / 270 / 300 s.
   - Thắng khi Mây còn sống lúc hết giờ **và** số đèn đang sáng ở tick cuối ≥ `ceil(0.6 × tổng)`: 3/5, 4/6, 5/7. Thắp đủ đèn **không** kết thúc Đêm.
   - Thua: hết lửa (ngay lập tức, kể cả tick cuối) hoặc hết giờ mà dưới ngưỡng. Lý do: `dawn_survived` / `dawn` / `no_flames`.
   - Bước 2 trừ dầu (hao + hút), ngay sau đó đèn fuel ≤ 0 tắt. Xét thắng/thua cuối tick; `no_flames` được xét trước.
4. **Sức chứa** = `10 + 2 × successful_lights`, tối đa 20. Tính cả thắp lại, không tính đèn đặt sẵn bằng scenario; đặt lại mỗi Đêm. HUD hiện `mang / sức chứa`.
5. **Điểm** ([THAY THẾ] toàn bộ):
   - +5 mỗi đom đóm nạp (thắp mới, thắp lại, châm dầu); +100 thắp lần đầu; +40 thắp lại.
   - +5 mỗi Bóng Mực trúng Tỏa Sáng, **tổng +15** nếu ngay trước đó nó đang `drain`.
   - Chỉ khi thắng: +50 + floor(fuel) cho mỗi đèn đang sáng; +50 mỗi Ngọn Lửa. Bỏ thưởng thời gian.
6. **Chế độ mù màu** (được lưu):
   - Viền/mắt Bóng Mực `#7A3CFF` → `#00B3FF`; cảnh báo UI `#FF5A5F` → `#FFFFFF` kèm ⚠.
   - Đèn tắt/sáng phân biệt được không cần màu: đèn tắt xẹp 20% và giấy có vết rách; đèn sắp hết dầu nhấp nháy.
7. **Contract v1.2**:
   - `tuning` thêm `fuel_max 100`, `fuel_decay_per_s 1.0`, `fuel_per_mote 10`, `relight_cost 5`, `win_ratio 0.6`, `drain_per_s 5`, `low_fuel_threshold 30`, `capacity_max 20`; thời lượng 240/270/300.
   - Snapshot: đèn thêm `fuel` (1 chữ số thập phân), `ever_lit`, `relit_count`; player thêm `capacity`; Bóng Mực có trạng thái `drain`.
   - Scenario: đèn đặt được `lit`, `fuel`, `ever_lit` (`lit: true` mà không có fuel thì fuel = 100); player thêm `successful_lights`; `shades[]` thêm `target_lantern_id`.
   - Sự kiện mới: `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`, `fuel_drain {lantern_id, shade_id, fuel}` (mỗi 60 tick khi đang hút). `lantern_lit` thêm `relight`. `game_over.reason` thêm `dawn_survived`; `all_lit` không còn dùng.

## Giả định (chỗ ticket chưa nói)

1. Dầu lưu dưới dạng **số nguyên đơn vị 1/60** (6000 = 100.0), đúng gợi ý của ticket. Hao 1 đơn vị mỗi tick, mỗi bóng hút 5 đơn vị mỗi tick. Output làm tròn 1 chữ số thập phân.
2. Bóng `wander` có đèn mục tiêu thì đi tới đèn đó với `shade_speed` (4 m/s; Đêm 3: 4.5). Không có đèn mục tiêu (mọi đèn sáng và khỏe) thì vẫn trôi 1,5 m/s như Phase 2.
3. Bóng tới cạnh đèn **tắt** (không còn đèn yếu) thì đứng chờ ở đó, không chuyển `drain`.
4. `fuel_drain` được ghi khi một bóng đã hút đủ 60, 120, … tick liên tục (đếm theo từng bóng), kèm dầu còn lại sau lần trừ đó.
5. Lượng hút trong bước 2 chỉ tính các bóng đang ở `drain` từ tick trước (bóng chuyển sang `drain` ở bước 8 bắt đầu hút từ tick sau).
6. Đèn đặt sẵn `lit: true` trong scenario thì `ever_lit = true`. `deposited ≥ chi phí` (10, hoặc 5 nếu `ever_lit`) cũng tính là sáng. Scenario đặt `fuel` mà không đặt `lit` thì đèn sáng khi `fuel > 0`.
7. Sức chứa giảm không bao giờ làm mất đom đóm đang mang (sức chứa chỉ tăng trong một Đêm).
8. Đèn tắt trong lúc châm dầu dở thì `deposited` về 0.

## Thay đổi test cũ (không skip âm thầm)

| Test / scenario | Xử lý | Lý do |
|---|---|---|
| `win` (thắng khi thắp đủ, `all_lit`, 858 điểm) | **Viết lại** thành `dawn_win` | Luật thắng bị thay; `all_lit` không còn dùng |
| unit "all lanterns lit on the exact dawn tick" | **Xóa**, thay bằng "thắp đủ không kết thúc Đêm" + "thắng ở bình minh khi ≥ ngưỡng" | Như trên |
| `pickup_light` (điểm 110) | Sửa thành 105 | +5 mỗi đom đóm nạp thay cho +10 |
| unit deposit "+10 per mote" | Sửa thành +5; thêm test đèn đầy không được chọn | Điểm mới, luật chọn đèn mới |
| `walk` `time_left_s` 299 | Sửa thành 239 | Đêm 1 còn 240 s |
| unit "standard numbers" / v1.1 | Sửa thành v1.2 + các khóa mới | Contract v1.2 |
| `safe_zone` / `safe_evict` | Giữ (đèn mới thắp có dầu 100 ≥ 30) | Không đổi |
| lịch sinh Bóng Mực | Giữ (vẫn trong thời lượng đêm mới) | Không đổi |

## Tiêu chí nghiệm thu

| # | Tiêu chí | Kiểm chứng |
|---|---|---|
| P3-1 | Dầu hao 1/s; hết thì tắt, có `lantern_out`, `deposited = 0` | scenario `fuel_out` |
| P3-2 | Châm dầu đúng công thức, có `refuel`, +5/đom đóm; đèn đầy không được chọn | scenario `refuel`, unit test |
| P3-3 | Thắp lại cần 5, +40, `relight: true`, `relit_count` tăng | scenario `relight` |
| P3-4 | Đèn fuel < 30 mất vùng an toàn; bóng wander tới hút → `drain`, 5/s cộng dồn, `fuel_drain` mỗi 60 tick | scenario `drain` |
| P3-5 | `drain` → chase (Mây ≤ 6 m) / stunned (+15) / wander (châm ≥ 30, có đẩy ra) | scenario `drain_pulse`, `drain_refuel` |
| P3-6 | Thắng `dawn_survived` khi ≥ ngưỡng lúc hết giờ, điểm bình minh mới; dưới ngưỡng thì `dawn` | scenario `dawn_win`, `dawn` |
| P3-7 | Sức chứa 10 + 2 × successful_lights, tối đa 20 | scenario `capacity` |
| P3-8 | Contract v1.2: tuning, trường snapshot, scenario, sự kiện | unit test định dạng |
| P3-9 | Bản chơi: thanh dầu, nhấp nháy < 30, HUD `mang/sức chứa`, chế độ mù màu được lưu | ảnh chụp |

## Đánh giá Phase 3

| AC | Trạng thái | Bằng chứng |
|---|---|---|
| P3-1 … P3-8 | Đạt | `npm test` 117/117; [RESULTS.md](../proof/phase-3/RESULTS.md) có 31 scenario, mỗi cái chạy 2 lần cho cùng sha256. Mọi kỳ vọng tính tay trước khi chạy; 9 scenario mới đạt ngay lần đầu |
| P3-9 | Đạt (kiểm thủ công) | [screens/](../proof/phase-3/screens/): đèn dầu thấp nhấp nháy + thanh dầu, đèn tắt xẹp/nghiêng, HUD `6 / 10` và "cần 3 lúc bình minh", châm dầu bằng phím E (dầu 7,3 → 67,3, +30 điểm), chế độ mù màu (viền/mắt Bóng Mực `#00B3FF`, cảnh báo trắng + ⚠) được lưu. **144 FPS @1280×720** |

- **Hồi quy Phase 1–2:** mọi scenario không bị thay thế vẫn đạt. Các test đổi hoặc xóa đều có lý do trong bảng "Thay đổi test cũ" và trong comment ngay tại test.
- **Lỗi tìm ra trong lúc làm:** bóng đang `drain` mà bị châm dầu đẩy ra vẫn giữ trạng thái `drain` và tiếp tục hút trong lúc bị đẩy. Đã sửa (`startEviction` chuyển nó về `wander`), có scenario `drain_refuel` kiểm (`fuel_drain` = 0).
- **Test viết sai rồi sửa:** test "đèn đầy" lệch 1 tick hao; test vùng an toàn chạy quá ngắn. Cả hai đều do test sai, không phải code sai.
- **Đo FPS:** lần đầu ra 30 FPS. Nguyên nhân là tab trình duyệt không ở phía trước nên bị giảm nhịp vẽ (trang `character.html` nhẹ cũng bị). Đưa tab lên trước thì đo lại được 144 FPS.
- **Rủi ro với test ẩn:** giả định 2 (bóng tới đèn yếu với `shade_speed`), 4 (thời điểm ghi `fuel_drain`), 5 (bóng vừa chuyển `drain` hút từ tick sau). Điểm `per_second_left` khai báo là 0 vì ticket bỏ thưởng thời gian.
