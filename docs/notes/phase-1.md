# Phase 1: PRD-0, giả định và tiêu chí nghiệm thu

Nguồn: tab Phase 1 trên lab board (PRD-0 + Test Contract v1.0).

## Tuning (khai trong `game.contract.json`, nguồn duy nhất: `src/sim/tuning.js`)

| Khóa | Giá trị | Ý nghĩa trong game |
|---|---|---|
| player_speed | 6 m/s | Tốc độ chạy trên mặt phẳng XZ |
| carry_capacity | 5 | Số đom đóm mang tối đa |
| lantern_cost | 5 | Số đom đóm cần nạp để thắp 1 đèn |
| lantern_count_night1 | 5 | L1..L5 |
| pickup_radius | 1.0 m | Tự nhặt khi khoảng cách ≤ 1.0 và chưa đầy |
| interact_radius | 2.5 m | Nạp đèn khi nhấn interact và khoảng cách ≤ 2.5 |
| pulse_cost | 1 | Tỏa sáng tốn 1 đom đóm đang mang |
| pulse_radius | 6 m | Bóng Mực trong bán kính bị choáng |
| night1_duration_s | 300 | Hết giờ = bình minh = thua (`dawn`) |
| flames | 3 | Máu của Mây |
| invuln_s | 1.5 | Bất tử sau khi bị chạm (90 tick) |
| hit_drop_ratio | 0.5 | Rơi `floor(carried × 0.5)` đom đóm, số rơi mất hẳn |
| pulse_stun_s | 2 | Choáng 120 tick |
| pulse_push_m | 4 | Đẩy ra xa Mây 4 m theo XZ |
| pulse_cooldown_s | 1 | 60 tick giữa hai lần tỏa sáng |
| safe_radius | 5 m | Bóng Mực không vào được vùng quanh đèn **đã thắp** |
| shade_speed | 3.5 m/s | Đuổi thẳng tới Mây |
| shade_hit_radius | 1.0 m | Chạm khi khoảng cách ≤ 1.0 |
| fall_enabled | false | Đảo có rìa chặn (bán kính 30 m), không rơi được |
| score | mote 10, lantern 100, stun 20, giây còn lại 1, flame còn lại 50 | |

## Giả định (chỗ PRD-0 mơ hồ)

1. **Ánh sáng = đom đóm đang mang.** Tỏa sáng tốn `pulse_cost` đom đóm. Không đủ, hoặc đang hồi chiêu, thì không có gì xảy ra và không phát sự kiện.
2. **Nạp đèn:** khi nhấn interact (cạnh false→true), chọn đèn **chưa thắp** gần nhất trong `interact_radius` (bằng nhau thì lấy id nhỏ hơn). Nạp `min(carried, lantern_cost − deposited)`. Đang mang 0 thì không có sự kiện.
3. **Nhặt** là tự động mỗi tick, xét đom đóm theo thứ tự id; đầy thì không nhặt.
4. **Vùng an toàn** chỉ có ở đèn đã thắp (đèn thắp lên thì Bóng Mực sợ). Bóng Mực bị đẩy ra tới `safe_radius + 0.001`.
5. **Bị chạm:** mỗi tick tối đa 1 lần. Bóng Mực đang choáng không gây sát thương. Hết flames thì thua `no_flames`.
6. **Điểm:** +10 mỗi đom đóm nhặt, +100 mỗi đèn thắp, +20 mỗi Bóng Mực bị choáng (mỗi con, mỗi lần pulse). **Chỉ khi thắng** mới cộng thêm `floor(time_left_s)×1 + flames×50`.
7. **Bình minh:** `time_left_s ≤ 0` mà chưa thắp hết đèn thì thua `dawn`.
8. **Bộ đếm** (bất tử, hồi chiêu, choáng) giảm ở đầu mỗi bước; hành động bị chặn khi bộ đếm > 0.
9. **Thứ tự trong một bước:** đếm giờ → di chuyển/nhảy → nhặt → nạp đèn (kiểm tra thắng) → Bóng Mực di chuyển → tỏa sáng → kiểm tra bị chạm → sinh thêm thực thể → kiểm tra bình minh.
10. **Sinh ngẫu nhiên** (khi `random_*` true): 30 đom đóm trong đĩa bán kính 28 m; giữ tối thiểu 20 con (mỗi 5 giây thêm 1). 3 Bóng Mực ở vành 22–29 m; mỗi 30 giây thêm 1 (tối đa 6, có sự kiện `shade_spawned`).
11. **Đèn mặc định:** vòng bán kính 18 m, L1 ở +Z, các đèn cách nhau 72°.
12. **Nhảy** chỉ để hiển thị/vượt địa hình (vận tốc 7 m/s, trọng lực 20 m/s²). Khoảng cách tính theo XZ nên nhảy không né được Bóng Mực.
13. **`dash`** chưa có trong Phase 1, input bị bỏ qua.
14. **Input `move`** có thành phần ngoài [−1, 1] thì kẹp lại (không coi là lỗi). Sai kiểu dữ liệu/JSON thì thoát mã 2.
15. **Bóng Mực trong scenario** không có id thì được gán S1, S2… theo thứ tự, bỏ qua id đã dùng.
16. **Bỏ nón lá (quyết định của chủ dự án, lệch PRD-0).** PRD-0 ghi "Mây đội nón lá có treo một chiếc đèn lồng nhỏ". Chủ dự án chọn thiết kế gấu trúc chiến binh không đội nón (theo `game_charactor/`). Vẫn giữ **đèn lồng nhỏ**, treo ở đai. Chỉ ảnh hưởng hiển thị, không ảnh hưởng headless. Rủi ro: có thể bị trừ ở mục F "đúng yêu cầu".

## Tiêu chí nghiệm thu → kiểm chứng

| # | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC1 | Đi 60 tick với move [0,1] → z = 6.0; có xoay theo cam_yaw; vector dài được chuẩn hóa | `tests/sim.test.js`, scenario `walk` |
| AC2 | Đom đóm trong pickup_radius được nhặt, +10, có sự kiện `mote_picked` | `pickup_light` |
| AC3 | Nạp đủ lantern_cost thì đèn thắp, có `deposit` và `lantern_lit`, +100 | `pickup_light` |
| AC4 | Tỏa sáng: tốn 1, choáng và đẩy Bóng Mực trong bán kính, có hồi chiêu | `pulse_stun`, unit test |
| AC5 | Bị chạm: −1 flame, rơi đom đóm, bất tử 1.5 s | `hit_drop` |
| AC6 | Thắp hết 5 đèn thì `won/all_lit` cộng thưởng | `win` |
| AC7 | Hết giờ thì `lost/dawn`; hết máu thì `lost/no_flames` | `dawn`, `no_flames` |
| AC8 | Bóng Mực không vào safe_radius của đèn đã thắp | `safe_zone` |
| AC9 | Cùng seed/scenario/inputs → output giống từng byte | `tests/headless.test.js` |
| AC10 | File sai định dạng → mã thoát 2; dòng cuối là `end` | `tests/headless.test.js` |
| AC11 | Chơi được trên trình duyệt: di chuyển, nhảy, camera, HUD, thắng/thua, chơi lại | Ảnh chụp `docs/proof/phase-1/` |

## Đánh giá Phase 1

| AC | Trạng thái | Bằng chứng |
|---|---|---|
| AC1–AC10 | Đạt | `npm test` 43/43; [docs/proof/phase-1/RESULTS.md](../proof/phase-1/RESULTS.md) 9/9 scenario PASS, chạy 2 lần cho cùng sha256 |
| AC11 | Đạt (kiểm tra thủ công) | [screens/](../proof/phase-1/screens/): HUD lúc bắt đầu, đèn thắp + vòng an toàn, overlay thắng. Thua → overlay → `R` chơi lại đã kiểm tra trong trình duyệt. Một phần state được dựng sẵn qua `window.__game` để rút ngắn (xem ai-log) |

- Hiệu năng: trọn một đêm 300 s (18.000 tick) chạy headless mất khoảng 0,25 s (Windows 11, Node 22.12).
- Chưa làm: `dash`; âm thanh; rơi khỏi đảo (chủ đích, `fall_enabled: false`).
- Rủi ro với test ẩn: các giả định 1, 4, 6, 8 (ánh sáng = đom đóm mang theo; vùng an toàn chỉ ở đèn đã thắp; thưởng chỉ khi thắng; thời điểm bộ đếm). Nếu Phase 2 làm rõ khác đi thì sửa và ghi lý do ở đây.
