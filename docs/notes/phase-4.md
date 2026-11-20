# Phase 4: Ticket-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)

Nguồn: tab Phase 4 trên lab board (đọc qua trình duyệt ngày 2026-11-20). **Mọi con số dưới đây lấy từ lần chạy thật**, kèm log thô trong [docs/proof/phase-4/](../proof/phase-4/). Kết quả chưa đạt được ghi là "chưa đạt".

## Yêu cầu và cách làm

| # | Yêu cầu | Cách làm |
|---|---|---|
| 1 | Benchmark: cửa sổ 1280×720, vsync tắt; Đêm 1 với 200 Bóng Mực `wander` + 100 đom đóm, L1–L3 sáng (dầu 100); tắt sinh / sát thương / nhặt / hao dầu / kết thúc; camera bay vòng r 30, Y 15, nhìn (0,0,0), 15 s một vòng; khởi động 3 s rồi đo `--duration` s | `scripts/bench.mjs`: dựng server từ `dist/`, mở cửa sổ Chrome thật qua Puppeteer (`--disable-gpu-vsync --disable-frame-rate-limit`), trang `?bench=1` (`createBenchGame` trong sim + `benchFrame` trong renderer) |
| 2 | Soak: 10 Đêm trong cùng một tiến trình, seed 7 + i, input ngẫu nhiên theo seed; `crashes = 0` và `mem_end ≤ 1.2 × mem_start` | `scripts/soak.mjs` (Node, `--expose-gc` để đo RSS sau khi dọn rác) |
| 3 | Bảng xếp hạng cục bộ: top 10, lưu trên đĩa, màn hình từ menu, `--export-leaderboard` | `src/leaderboard.js` (luật chung) + `data/leaderboard.json` qua `scripts/serve.mjs` (= `run_cmd`); bản tĩnh không có server thì lưu trong trình duyệt |
| 4 | Dễ tiếp cận: đổi mọi phím (báo trùng, khôi phục mặc định, được lưu); phụ đề / chỉ báo (Bóng Mực xuất hiện + mũi tên mép màn hình, gió, 10 s cuối, đèn < 30); giảm chuyển động; chữ ≥ 18 px, tùy chọn ×1.25 | Cài đặt trong game, xem ảnh chụp |
| 5 | Đóng gói và tài liệu: tối đa 3 lệnh, README, CHANGELOG 4 phase, CREDITS, LICENSE, Release `v1.0.0` | Xem README |
| 6 | Contract v1.3: `bench_cmd`, `soak_cmd` | `game.contract.json` |

## Giả định

1. **"Đêm thứ i dùng seed 7 + i"**: i tính từ 0 (đêm đầu seed 7, đêm cuối seed 16), đêm thứ i là Đêm `(i mod 3) + 1`.
2. **Input soak**: mỗi tick là mức nút (true/false) bốc ngẫu nhiên theo xác suất 5/3/2/10%; hành động chỉ kích hoạt ở cạnh false→true. Hướng đi là một góc ngẫu nhiên, đổi mỗi 30 tick.
3. **Bench**: Bóng Mực giữ trạng thái `wander` (không chuyển `chase`) vì ticket yêu cầu "di chuyển theo luật wander". Bối cảnh nền (sáng tạo) **tắt** trong bench. Mây vẫn dùng mô hình gấu trúc vì đó là nhân vật chính, không phải thực thể thêm.
4. **`load_ms`** = thời điểm khung hình đầu tiên của cảnh bench được vẽ − thời điểm tiến trình `node scripts/bench.mjs` bắt đầu. Bao gồm cả khởi động Chrome.
5. **`peak_mem_mb`** = tổng RSS (trên Windows là working set) của **toàn bộ cây tiến trình trình duyệt** (browser, GPU, renderer, utility), lấy mẫu mỗi 2 s. Việc lấy mẫu chạy PowerShell nên tốn một ít CPU trong lúc đo.
6. **Tên** trong bảng xếp hạng: 3–12 ký tự `[A-Za-z0-9_]`, chấp nhận thêm chữ tiếng Việt có dấu (điểm cộng).

## Kết quả đo (máy của tôi; máy chấm sẽ khác)

Máy: Windows 11 (10.0.26200) x64, AMD Ryzen 5 5500U + Radeon Graphics tích hợp, 15 GB RAM, Node 22.12.0, Chrome 157 (Puppeteer).

### Benchmark: [bench.json](../proof/phase-4/bench.json) · [bench.log](../proof/phase-4/bench.log) (commit `d4e0cd0`)

| Chỉ số | Kết quả | Ngưỡng | Đạt? |
|---|---|---|---|
| avg_fps | **157.2** | ≥ 60 | Đạt |
| p1_low_fps | **87.1** | ≥ 30 | Đạt |
| frame_ms_p95 | 8.9 | — | |
| frames | 4717 (= 157.2 × 30 s) | — | |
| load_ms | **2840** | ≤ 10000 | Đạt |
| peak_mem_mb | 618.3 (cả cây tiến trình Chrome) | — | |
| vsync_off | true (FPS vượt 144 Hz của màn hình) | — | |

Độ dao động giữa các lần chạy, cùng mã nguồn và cùng máy:

| Lần chạy | avg_fps | p1_low | load_ms | Ghi chú |
|---|---|---|---|---|
| thử 1 | 178.8 | 104.5 | 3315 | chưa lấy mẫu bộ nhớ |
| thử 2 | 173.3 | 98.4 | 2263 | có lấy mẫu bộ nhớ (PowerShell mỗi 2 s) |
| **chính thức** | **157.2** | **87.1** | **2840** | đang chạy song song 2 server dev (Vite và serve.mjs) |

Các lần thử chạy trước khi commit `d4e0cd0` nhưng cùng mã bench. Chỉ số chính thức là lần ghi trong `bench.json`.

### Soak: [soak.json](../proof/phase-4/soak.json) · [soak.log](../proof/phase-4/soak.log) (commit `d4e0cd0`)

| Chỉ số | Kết quả | Ngưỡng | Đạt? |
|---|---|---|---|
| crashes | **0** | = 0 | Đạt |
| mem_start_mb → mem_end_mb | **43.9 → 57.2 (×1.30)** | ≤ ×1.2 (52.7) | **Chưa đạt** |
| results | 10 × "lost" (input ngẫu nhiên chết trong 1 000–4 700 tick mỗi đêm) | — | |
| duration_s | 0.4 | — | |

**Phân tích "chưa đạt" bộ nhớ.** Mình không đổi số và không đổi cấu hình chỉ để qua ngưỡng. Kết quả đo chẩn đoán:

- **JS heap sau GC không tăng:** 4.3 → 4.7 MB qua 40 đêm liên tiếp. Không có rò rỉ trạng thái game.
- **RSS dao động, không tăng đơn điệu:**

  | Số đêm | RSS cuối |
  |---|---|
  | 1 | 49.7 MB |
  | 10 | 57–65 MB |
  | 30 | 52.1 MB |

  3 lần chạy 10 đêm cho `mem_end` lần lượt 58.8 / 65.1 / 60.6 MB.
- **Thu nhỏ semi-space** (`--max-semi-space-size=1`) không đổi kết quả, nên phần tăng không đến từ rác tạm.
- **Tắt JIT** (`--jitless`, chỉ để chẩn đoán): 43.8 → 45.2 MB (×1.03). Phần RSS tăng thêm là mã máy V8 biên dịch JIT sau khi game "nóng" và các trang bộ nhớ V8 giữ lại. `mem_start` đo ngay sau khi tải đêm đầu, trước khi bất kỳ mã nào được tối ưu.
- **Kết luận:** mình không thấy rò rỉ. Nhưng theo đúng định nghĩa của ticket thì **chưa đạt** trên máy này. `soak_cmd` vẫn dùng Node mặc định, cấu hình thật của game.

## Kiểm chứng tính năng (ảnh và kiểm tra trên trình duyệt thật, bản `dist/` qua `serve.mjs`)

| Tính năng | Bằng chứng | Trạng thái |
|---|---|---|
| Đổi phím + báo trùng + khôi phục + lưu | [01](../proof/phase-4/screens/01-key-remap-conflict.jpg): gán Lướt = E thì 2 nút đỏ kèm "⚠ Trùng phím". Đã kiểm `localStorage` lưu `KeyE`; "Khôi phục mặc định" đưa về `ShiftLeft` | Đạt |
| Nhập tên sau khi thua, lưu đĩa | [02](../proof/phase-4/screens/02-save-score-after-loss.jpg): tên tiếng Việt `Mây_thử` hợp lệ, API trả về và `data/leaderboard.json` có mục mới (ISO có múi giờ `+07:00`) | Đạt |
| Màn hình bảng xếp hạng từ menu | [03](../proof/phase-4/screens/03-leaderboard-screen.jpg) | Đạt |
| `--export-leaderboard` | Chạy thật ra `{"entries":[…]}` đúng thứ tự; có test tự động | Đạt |
| Phụ đề + mũi tên Bóng Mực + chữ lớn | [04](../proof/phase-4/screens/04-captions-shade-arrow-large-text.jpg): tick 300 hiện 2 dòng "Bóng Mực xuất hiện!" và mũi tên tím ở mép; chữ lớn đo được 22.5 px | Đạt |
| Gió sắp thổi / 10 s cuối / đèn < 30 | Có code + logic phụ đề; **chưa chụp ảnh riêng** cho 3 trường hợp này | Có code, chưa có ảnh |
| Giảm chuyển động | Tắt rung camera và chớp đỏ khi bị đánh, tắt nhấp nháy nhân vật lúc bất tử. **Chưa có ảnh/clip** | Có code, chưa có bằng chứng hình ảnh |
| Chữ ≥ 18 px @1280×720 | Đo `getComputedStyle` mọi phần tử chữ trong màn Cài đặt: nhỏ nhất **18 px** | Đạt |
| Phiên chơi đầy đủ Đêm 1 → 3 → Bình Minh bằng tay | Chưa có người chơi trọn vẹn. Các màn hình đã được kiểm từng phần | Chưa kiểm trọn vẹn |
| Video demo | **Chưa có.** Cần người chơi thật quay | Chưa đạt |
| Release `v1.0.0` + tag `phase-4` | Đã chuẩn bị file zip; chờ người dùng đồng ý push/tạo release | Chưa làm |

- `npm test`: 123/123. Thêm 6 test Phase 4: bảng xếp hạng, lệnh export, cảnh bench, định dạng soak.
- Hồi quy: mọi scenario Phase 1–3 vẫn đạt (`npm run proof -- phase-4`).

## Kiểm tra cài đặt sạch (thật)

- **Clone sạch** sang thư mục tạm, chạy `npm ci && npm run build` (11 s, đã có cache Chrome của Puppeteer), rồi `node scripts/serve.mjs`: trang trả HTTP 200.
- `npm test` trong bản clone lần đầu **đỏ 2 test**: test Phase 4 tự ghép đường dẫn bằng `URL.pathname`, nên dấu cách trong "PC ACER" thành `%20`. Đã sửa bằng `fileURLToPath`; bản clone giờ 123/123. Lỗi này chỉ lộ ra khi kiểm tra trên một thư mục sạch.
- **File zip release** (`release/dao-den-long-v1.0.0-web.zip`, 164 KB): giải nén ra thư mục tạm, chạy `node scripts/serve.mjs`. Kết quả: trang 200, `POST /api/leaderboard` lưu được, `--export-leaderboard` ra đúng `{"entries":[…]}`.

## Cập nhật sau phát hành: đèn sáng rõ hơn + camera theo hướng đi (yêu cầu của người dùng)

- **Đèn khi thắp:**
  - Thêm quầng sáng (sprite gradient tự tạo trong code) và vầng sáng ấm trên mặt đất.
  - Nguồn sáng mạnh hơn và xa hơn (30 m); vẫn giảm theo mức dầu.
  - Vòng "bùng sáng" khoảng 0,9 s lúc vừa thắp; tắt khi bật "Giảm chuyển động".
  - Ảnh: [05 trước](../proof/phase-4/screens/05-lantern-before-lighting.jpg), [06 lúc thắp](../proof/phase-4/screens/06-lantern-lighting-burst.jpg), [07 ổn định](../proof/phase-4/screens/07-lantern-lit-halo-ground-glow.jpg).
- **Camera theo hướng đi** (Cài đặt, mặc định bật):
  - Khi di chuyển, camera xoay dần về hướng Mây đang đi, với trọng số `cos(góc)`.
  - Tạm ngưng 1,5 s sau khi người chơi tự xoay camera (chuột hoặc ← →).
  - Đo trên trình duyệt (giữ phím, đọc `camYaw`):

    | Giữ phím | camYaw |
    |---|---|
    | chỉ W | 0 → 0 |
    | W+A 1,5 s | 0 → 119.1° |
    | W+D 1,5 s | 119.1 → 0° |
    | S (đi lùi) | không đổi |
    | D (đi ngang) | không đổi |

- **Ảnh hưởng hiệu năng (đo thật, đã tắt server dev):**

  | Lần đo | avg_fps | p1_low_fps | load_ms |
  |---|---|---|---|
  | **Chính thức** (commit `953b7d8`) | **114.1** | **47.3** | 3891 |
  | Đo lại ngay sau đó, cùng mã | 136.9 | 70.3 | 2991 |

  Trước thay đổi là 157.2 / 87.1. Hiệu ứng mới tốn khoảng 15–25% FPS ở cảnh bench (3 đèn sáng, 200 Bóng Mực). Vẫn đạt ngưỡng ≥ 60 / ≥ 30 trên máy này, nhưng biên an toàn của `p1_low_fps` đã nhỏ hơn. `bench.json` là lần chính thức.

## Cập nhật: Mây đội lại nón lá (yêu cầu của người dùng)

- Nón lá gồm thân nón màu rơm, viền vành, 8 gân nón và quai đỏ. Đèn lồng nhỏ treo ở vành nón (trước đây treo ở đai), vẫn sáng dần theo số đom đóm mang theo. Gỡ được lệch PRD-0 ghi ở giả định 16 Phase 1.
- Lỗi tìm thấy khi kiểm bằng ảnh: gân nón đặt sai dấu góc nghiêng nên chĩa ra ngoài; đã sửa. Trang `character.html` bị trắng khi tải lúc khung xem chưa có kích thước; đã thêm xử lý đổi cỡ.
- Chỉ đổi `src/web/character.js` (hiển thị), nên `npm test` không đổi.
