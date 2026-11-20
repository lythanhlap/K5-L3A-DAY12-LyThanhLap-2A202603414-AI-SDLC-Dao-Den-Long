# Phase 2: Ticket-02 "Ba hòn đảo" (Contract v1.1)

Nguồn: tab Phase 2 trên lab board (đọc qua trình duyệt ngày 2026-11-20). Dưới đây là tóm tắt chuẩn để làm và kiểm chứng.

## Thay đổi so với Phase 1 (luật cũ bị thay)

| Luật | Phase 1 (của tôi) | Phase 2 (chuẩn) | Ảnh hưởng test cũ |
|---|---|---|---|
| Sức chứa / chi phí đèn | 5 / 5 | 10 / 10 | Sửa kỳ vọng `pickup_light`, `win`, unit test |
| Tương tác / vùng an toàn | 2.5 m / 5 m | 2.0 m / 6 m (đẩy bóng đang ở trong ra trong ≤ 30 tick) | Sửa `safe_zone` |
| Tỏa sáng | 1 đom đóm, 6 m, 1 s, đẩy tức thì | 3 đom đóm, 5 m (3D, tâm = chân + 0.8), 3 s, đẩy 4 m trong 15 tick | Viết lại `pulse_stun` |
| Bóng Mực | 3.5 m/s, luôn đuổi, 3 con lúc đầu | 4.0 m/s (Đêm 3: 4.5), phát hiện 12 / bỏ 18, recoil 2 m / 60 tick sau khi đánh, sinh 2 con ở tick 300 rồi theo lịch | Viết lại |
| Bị đánh | rơi đom đóm mất hẳn | rơi `floor(mang/2)` ra vành 1.5–2.5 m, TTL 480 tick | Sửa `hit_drop` |
| Rơi khỏi đảo | không có (rìa chặn) | có: Y < −10 → −1 lửa, mất hết đom đóm, chờ 60 tick, hồi sinh | Bỏ test "không rời đảo" (luật bị thay) |
| Điểm | +10 khi **nhặt**, stun +20, giây ×1 | +10 mỗi đom đóm **nạp**, stun +5, giây ×2 | Sửa mọi kỳ vọng điểm |
| Thắng/thua | xét trong bước | xét sau mỗi tick: hết lửa → thua; đủ đèn → thắng (kể cả đúng tick hết giờ) | |
| Đảo Đêm 1 | r = 30, đèn r = 18 | r = 40, đèn chuẩn L1 (0,0,25)… | |
| Trạng thái Bóng Mực | chase / stunned | `spawning` / `wander` / `chase` / `recoil` / `stunned` | |

## Giả định mới (chỗ ticket chưa nói)

1. **Góc** theo ticket: đo từ +X, điểm ở góc θ là `(r cosθ, ·, r sinθ)`. Kiểm tra: 20°…160° của tầng 1 Đêm 3 phải nằm ở z > 0.
2. **Xuất phát Đêm 3 = (0, 0, −30)**, quay mặt về +Z. Ticket không ghi, mà (0,0,0) nằm trong tháp chuông. Đêm 2 xuất phát ở (0,0,0) (tâm đảo A).
3. **`spawning` kéo dài 60 tick**: đứng yên, không gây sát thương, vẫn trúng Tỏa Sáng được.
4. **`wander`**: Bóng Mực trôi 1.5 m/s tới một điểm sinh đom đóm ngẫu nhiên (theo seed), tới nơi thì chọn điểm khác.
5. **Tăng tốc tức thì** (0 s ≤ 0.1 s), nên đi 60 tick ra đúng 6.0 m như Phase 1.
6. **Chênh cao khi chạm** = `|shade.y − player.y|` (tâm bóng so với chân Mây). Bóng bay cách mặt đất 1 m, nên đứng cùng tầng thì chênh 1.0.
7. **Bóng Mực** lướt theo mặt đất (`y = mặt đất + độ cao ban đầu`). Bị chặn bởi: khoảng trống (biển mây), tháp chuông, vùng an toàn. Không bị vách tầng chặn. **Gió Lạc** bay ở mặt đất + 1.5 m và không bị gì chặn.
8. **`night_start`** được ghi ngay sau snapshot tick 0, với `tick: 0`. Dựng scenario vẫn không phát sự kiện nào khác.
9. **Gió mạnh (Đêm 3)**: cơn thứ k (k ≥ 1) bắt đầu ở sim_tick 1800k, kéo dài 300 tick. Hướng được rút từ seed lúc báo trước (1800k − 120). Gió cộng thêm 2 m/s vào dịch chuyển ngang của Mây.
10. **Gió Lạc**:
    - `idle` lượn vòng quanh tâm đảo gần nhất với tốc độ 2 m/s.
    - Cướp khi chạm (XZ ≤ 1.2) trong lúc `idle`/`chase` và Mây đang mang > 0.
    - "Biến mất sau 120 tick" (khi bị Tỏa Sáng lúc đang flee) nghĩa là chính Gió Lạc biến mất.
    - Gió Lạc đã `removed` vẫn nằm trong mảng snapshot.
    - Tỏa Sáng trúng Gió Lạc khi khoảng cách 3D ≤ 5 m (cùng tâm như Bóng Mực).
    - "Tối đa 2 con" tính số con đang hoạt động; sinh tại điểm sinh Bóng Mực.
11. **Trần đom đóm 30** tính cả đom đóm rơi. Đom đóm rơi không chiếm điểm sinh. Đom đóm rơi ra ngoài đảo vẫn được đặt ở độ cao mặt đất của Mây.
12. **Đẩy lùi khi Tỏa Sáng** dừng khi vị trí kế tiếp là khoảng trống, tháp, hoặc nằm trong vùng an toàn.
13. **Nhảy bục**: vận tốc ngang khóa tới khi chạm đất. Lướt tạm thay vận tốc ngang (độ cao giữ nguyên trong lúc lướt), sau đó vận tốc phóng tiếp tục.
14. **`player.invuln`** trong snapshot là **boolean** (các trường khác có hậu tố `_s` là số giây còn lại).
15. **Điểm sinh Bóng Mực hợp lệ**: cách Mây ≥ 15 m (XZ) và không nằm trong vùng an toàn của đèn đã sáng. "Tối đa" tính số con đang có.
16. **Bậc thang** ≤ 0.3 m được bước lên (đi lên dốc); cao hơn là vách và chặn chuyển động ngang.

## Tiêu chí nghiệm thu (Phần 3 + Contract v1.1)

| # | Tiêu chí | Kiểm chứng |
|---|---|---|
| P2-1 | Contract v1.1: `--night 1/2/3`, tuning khớp số chuẩn + 5 khóa mới | test contract, unit test |
| P2-2 | Snapshot có `night`, `wind`, `player.vel/grounded/invuln/dash_cd_s/pulse_cd_s/charm_s`, các mảng `motes/drifters/charms` | test định dạng |
| P2-3 | Lướt: 14 m/s × 12 tick = 2.8 m, hồi chiêu 90 tick tính từ lúc bắt đầu, đứng yên thì lướt theo hướng mặt | scenario `dash` |
| P2-4 | Rơi khỏi đảo: `player_hit {by:"fall", lost}`, chờ 60 tick, hồi sinh ở điểm xuất phát, bất tử 90 tick | scenario `fall` |
| P2-5 | Bị đánh rơi `floor(n/2)` đom đóm `kind:"dropped"` ở vành 1.5–2.5 m, nhặt lại được; bóng chuyển `recoil` | scenario `hit_drop` |
| P2-6 | Tỏa Sáng 3/5 m/3 s, đẩy 4 m trong 15 tick, +5 điểm | scenario `pulse_stun` |
| P2-7 | Gió Lạc: idle → chase (≥ 5 đom đóm, ≤ 15 m) → cướp min(3, n) → flee → removed; Tỏa Sáng làm nó thả đồ | scenario `drifter_steal`, `drifter_pulse` |
| P2-8 | Bùa Gió: nhặt → 600 tick, chạy 7.2 m/s, lướt không hồi chiêu; xuất hiện lại sau 2700 tick | scenario `charm` |
| P2-9 | Tạm dừng: tick tăng, sim_tick và thời gian đứng yên, `state:"paused"`, có `paused`/`resumed` | scenario `pause` |
| P2-10 | Bục nhảy Đêm 2 đưa Mây sang đảo kia; bục Đêm 3 đưa lên tầng 2 | scenario `jumppad_n2`, `jumppad_n3` |
| P2-11 | Đêm 3: vách tầng chặn, đi lên dốc được, gió đẩy 2 m/s | scenario `n3_ramp`, `wind` |
| P2-12 | Thắng/thua xét sau mỗi tick; điểm chuẩn hóa | scenario `win`, `dawn`, `no_flames` |
| P2-13 | Tất định; trọn một đêm 21 600 tick ≤ 30 s | test tất định + đo thời gian |
| P2-14 | Bản chơi: chuỗi 3 đêm, menu, tạm dừng, cài đặt (lưu), âm thanh, HUD đầy đủ, bảng màu, ≥ 30 FPS @1280×720 | ảnh chụp + số đo FPS |

## Đánh giá Phase 2

| AC | Trạng thái | Bằng chứng |
|---|---|---|
| P2-1 … P2-13 | Đạt | `npm test` 80/80; [RESULTS.md](../proof/phase-2/RESULTS.md) có 22 scenario chạy 2 lần cho cùng sha256. Trọn một đêm 21 600 tick mất 0,3–0,5 s (đêm 3 ≈ 0,48 s) |
| P2-14 | Đạt (kiểm thủ công) | [screens/](../proof/phase-2/screens/): menu, giới thiệu đêm, HUD Đêm 1 (**144 FPS @1280×720**), menu tạm dừng, Đêm 2 (cầu, bục, Gió Lạc), Đêm 3 (tầng, tháp), Bình Minh (tổng 3 đêm). Cài đặt lưu qua `localStorage` (đã kiểm tra bằng tải lại trang). Âm thanh tổng hợp bằng WebAudio, chưa có ảnh/clip làm bằng chứng nghe được |

- **Hồi quy Phase 1**: mọi scenario Phase 1 vẫn chạy. Kỳ vọng được **cập nhật theo số chuẩn**, có lý do trong bảng "Thay đổi so với Phase 1". Bỏ unit test "không rời được đảo" vì ticket thay luật này bằng luật rơi khỏi đảo.
- **Lỗi tìm ra nhờ test:**
  - Vùng an toàn dùng `<` thay vì `≤`. Bóng có thể đứng đúng 6,000 m mà output vẫn ghi 6.000. Đã sửa: biên tính là "trong", thêm khoảng đệm 0.001.
  - Tạm dừng trong bản chơi không tiếp tục được, vì sim không thấy cạnh false→true của nút `pause`. Đã sửa: gửi lần thả nút trước khi tiếp tục.
- **Kỳ vọng tính tay sai (đã sửa kèm lý do, không phải sửa cho khớp output):**
  - `dash_cd_s` là 71 tick chứ không phải 70: bộ đếm được đặt ở bước 0 rồi giảm 19 lần trước snapshot 20.
  - `safe_evict`: bóng ra tới mép ở tick 30 rồi đuổi tiếp một bước ngay trong tick đó.
- **Ảnh dựng nhanh:** ảnh Đêm 2, Đêm 3 và Bình Minh được dựng bằng cách đánh dấu đèn đã sáng qua `window.__game` để chuyển đêm nhanh. Chưa ai chơi trọn 3 đêm bằng tay.
- **Rủi ro với test ẩn:** các giả định 2 (xuất phát Đêm 3), 3–4 (spawning/wander), 6 (chênh cao), 8 (tick của `night_start`), 14 (`invuln` boolean).

## Review độc lập trước khi tag (subagent `contract-reviewer`, không phải bên viết code)

Agent nhận toàn văn yêu cầu Ticket-02, tự chạy `npm test` và `npm run proof`, và không được sửa code. Kết quả: không vi phạm contract nào cứng. Các phát hiện (đã kiểm lại trên code trước khi sửa):

| # | Phát hiện | Xử lý |
|---|---|---|
| 1 | **Lỗi lệch 1:** recoil chỉ di chuyển 59 bước (1,967 m), vì bộ đếm giảm ở bước 2 trước khi lùi | Sửa: recoil đếm ngược ở bước 8 sau khi di chuyển, nên lùi đúng 60 × 2/60 = 2,000 m. Thêm unit test + kỳ vọng `hit_drop` tick 70 = 1.833 (tính tay) |
| 2 | **Gió** chỉ đẩy 299 tick (9,967 m) | Sửa: cơn gió đếm ngược sau khi đẩy (gió không nằm trong danh sách bộ đếm của bước 2). Thêm test 10 m và kiểm `wind.active` ở tick 2090/2100 |
| 3 | Tỏa Sáng đặt `evict = 0` cho bóng đang bị đẩy ra khỏi vùng đèn mới thắp, nên sau khi hết choáng bóng có thể gây sát thương trong vùng an toàn | Sửa: giữ `evict`. Thêm test |
| 4 | Thiếu unit test độc lập cho lịch sinh Bóng Mực, Gió Lạc, bùa, rơi đảo, vành đom đóm rơi, tạm dừng | Thêm 7 test (tính tay). Ba test của mục 1–3 **đỏ trên code cũ, xanh sau khi sửa** (đã kiểm bằng `git stash`) |
| 5 | Nhiều kỳ vọng vị trí (6.667, 7.333, 2.4) trông như chép từ output | Đây là giá trị tính tay: 4 + 10 × 4/15 = 6.667; 8 − 10 × 4/60 = 7.333; 0.4333 + 59/30 = 2.4. Giữ lại |
| 6 | Rủi ro giả định: xuất phát Đêm 3, `invuln` boolean, chênh cao khi chạm, bỏ điểm sinh trong vùng an toàn, Gió Lạc sinh ở điểm sinh Bóng Mực | Giữ, đã ghi trong giả định. Nên hỏi trợ giảng nếu còn thời gian |

Sau khi sửa: `npm test` 90/90; proof sinh lại.
