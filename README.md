# Đảo Đèn Lồng

> **Video demo:** _(sẽ thêm ở Phase 4)_ · Đề bài và tài liệu lab: [LAB.md](LAB.md)
> Ly Thanh Lap · 2A202603414 · Day 12 AI SDLC

Game 3D góc nhìn thứ ba (Three.js). Mây, người giữ đèn nhỏ tuổi (một chiến binh gấu trúc mang đèn lồng nhỏ), đi qua **3 đêm**: Đảo Bến, Đảo Cau, Đảo Chuông. Mây gom đom đóm để thắp lại các Đèn Lồng Lớn, né Bóng Mực và Gió Lạc. Logic game là một mô phỏng tất định (`src/sim/`), dùng chung cho bản chơi trên trình duyệt và chế độ headless theo **Test Contract v1.2**.

## Cài đặt và chạy (macOS / Linux / Windows, cần Node ≥ 22)

```bash
npm ci
npm start          # mở http://localhost:5173  (thêm ?seed=42 để cố định thế giới)
npm test           # unit test + scenario headless + kiểm tra tất định
```

Headless (theo contract):

```bash
node src/headless.js --seed 1 --night 1 --ticks 600 --out out/run.jsonl \
  [--scenario scenarios/win.scenario.json] [--inputs scenarios/win.inputs.json] [--snapshot-every 10]
```

## Điều khiển

| Phím | Hành động |
|---|---|
| `W A S D` / mũi tên ↑↓ | Di chuyển (theo hướng camera) |
| `Space` | Nhảy |
| `Shift` | Lướt (14 m/s trong 0,2 s, hồi 1,5 s) |
| `E` | Nạp ánh sáng vào đèn tắt, hoặc **châm dầu** cho đèn đang sáng (≤ 2 m) |
| `F` / click chuột trái | Tỏa Sáng: tốn 3 đom đóm, làm choáng và đẩy Bóng Mực trong 5 m |
| Kéo chuột / `←` `→` | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Cài đặt | Âm lượng, độ nhạy chuột, **gamma** 0.6–2.2 (mặc định 1.0 = đúng bảng màu chuẩn; tăng lên nếu màn hình tối). Lưu giữa các lần mở game. Có tùy chọn **Bảng màu dễ phân biệt** (mù màu) |
| `Esc` / `P` | Tạm dừng (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu) |
| `Enter` | Chọn nút đầu tiên trên màn hình menu |

## Luật và cách tính điểm (Ticket-03, xem [ADR-0001](docs/adr/0001-lantern-fuel-and-dawn-win.md))

- **Mục tiêu:** giữ đảo sáng tới bình minh. Đêm dài 4:00 / 4:30 / 5:00. Thắng khi còn sống lúc hết giờ **và** số đèn đang sáng ≥ 3/5, 4/6, 5/7. Thắp đủ đèn không kết thúc Đêm. Hết lửa thì thua ngay.
- **Đèn có dầu** 0–100. Vừa thắp thì đầy, hao 1/giây.
  - Bấm `E` ở đèn đang sáng để châm: mỗi đom đóm +10 dầu.
  - Hết dầu thì đèn tắt. Thắp lại chỉ cần 5 đom đóm (lần đầu cần 10).
  - Đèn dưới 30 dầu nhấp nháy và mất vùng an toàn 6 m.
- **Bóng Mực** đuổi Mây (phát hiện 12 m), và khi lang thang sẽ tìm đèn yếu để **hút dầu** (5/giây). Tỏa Sáng làm choáng chúng.
- **Sức chứa** tăng theo số lần thắp trong Đêm: `10 + 2 × lần thắp`, tối đa 20.
- Vẫn còn từ Phase 2: Gió Lạc cướp đom đóm, Bùa Gió, gió mạnh Đêm 3, lướt, rơi khỏi đảo.
- **Điểm:** +5 mỗi đom đóm nạp/châm, +100 thắp lần đầu, +40 thắp lại, +5 mỗi Bóng Mực trúng Tỏa Sáng (+15 nếu nó đang hút dầu). Khi thắng: +50 + floor(dầu) cho mỗi đèn đang sáng, +50 mỗi lửa. Tổng điểm là tổng các Đêm đã thắng.

Tuning đầy đủ có trong [game.contract.json](game.contract.json). Giả định cho chỗ ticket chưa nói: [phase-3.md](docs/notes/phase-3.md), [phase-2.md](docs/notes/phase-2.md), [phase-1.md](docs/notes/phase-1.md). Thay đổi phá vỡ tương thích: [CHANGELOG.md](CHANGELOG.md).

## Kiểm chứng

- `npm test`: 117 test. Gồm unit test cho luật và bản đồ, 31 scenario headless chạy qua CLI thật (mỗi scenario 2 lần để so từng byte), kiểm tra định dạng v1.2, mã thoát 2, và hiệu năng (trọn một đêm 21 600 tick ≤ 30 s; thực tế < 0,5 s).
- `npm run proof -- phase-3`: sinh [docs/proof/phase-3/RESULTS.md](docs/proof/phase-3/RESULTS.md) và output `.jsonl`. Bằng chứng các phase trước nằm ở `docs/proof/phase-1/` và `phase-2/` (khớp tag tương ứng).
- CI (GitHub Actions) chạy test, proof và build trên Ubuntu và macOS mỗi lần push.
- Ảnh chơi thật và FPS (144 FPS @1280×720, `?fps` để bật bộ đếm): [docs/proof/phase-2/screens/](docs/proof/phase-2/screens/).

## Harness AI

| Thành phần | Dùng khi |
|---|---|
| [AGENTS.md](AGENTS.md) (+ [CLAUDE.md](CLAUDE.md) trỏ tới) | Lệnh, cấu trúc, quy ước tất định và trung thực bằng chứng |
| Hook `Stop` → [scripts/hooks/stop-gate.mjs](scripts/hooks/stop-gate.mjs) | Không cho agent kết thúc khi `npm test` đỏ |
| Hook `PreToolUse` → [scripts/hooks/guard-proof.mjs](scripts/hooks/guard-proof.mjs) | Chặn agent sửa tay file trong `docs/proof/` |
| Skill [headless-proof](.claude/skills/headless-proof/SKILL.md) | Thêm scenario cho một yêu cầu và sinh lại bằng chứng |
| Subagent [contract-reviewer](.claude/agents/contract-reviewer.md) | Review độc lập so với ticket và contract trước khi gắn tag |

Nhật ký dùng AI: [docs/notes/ai-log.md](docs/notes/ai-log.md).

## Sáng tạo của tôi

- **Mây là một chiến binh gấu trúc** (từ Phase 2 áo theo màu chuẩn `#E8E2D0`, khăn `#C8102E`) ([src/web/character.js](src/web/character.js)): áo choàng xanh ngọc với vạt đỏ, giáp vai đồng, đai đỏ, dây chéo và huy hiệu trước ngực, kiếm trong vỏ đeo sau lưng (chỉ để trang trí, không bao giờ rút ra). Mô hình dựng theo ảnh tham chiếu trong `game_charactor/`. **Không đội nón lá**, đèn lồng nhỏ treo ở đai (lệch so với PRD-0, xem giả định 16 trong docs/notes/phase-1.md). Có vòng đi bộ đơn giản (vung tay chân). Xem mẫu ở `http://localhost:5173/character.html` (thêm `?angle=180` để cố định góc). Ảnh: [front](docs/proof/phase-1/screens/04-character-front.png), [back](docs/proof/phase-1/screens/05-character-back.png), [side](docs/proof/phase-1/screens/06-character-side.png).
- **Bối cảnh đêm**: vòm trời chuyển màu, sao nhấp nháy, trăng có quầng, biển mây trôi và các đảo nổi xa có đèn lồng ([src/web/backdrop.js](src/web/backdrop.js)).
- **Chuyển động mượt**: nội suy hình ảnh giữa các tick 60 Hz trên màn hình tần số cao (đo: 0 khung giật ở 144 Hz).
- Đèn nhỏ treo ở đai của Mây sáng mạnh dần theo số đom đóm đang mang (chỉ là hiển thị).
- Bầu trời và sương chuyển từ tím đen sang tím hồng nhạt theo số đèn đã thắp. Đèn đã thắp có vòng sáng vàng đánh dấu vùng an toàn.

Cả hai chỉ nằm trong `src/web/`, không đổi luật, nên output headless không thay đổi (`npm test` vẫn xanh).

## Cấu trúc

```
src/sim/       logic thuần, tất định (game.js, tuning.js)
src/headless.js  CLI theo Test Contract
src/web/       renderer Three.js + HUD
scenarios/     scenario/inputs + index.json (kỳ vọng)
tests/         node:test
docs/notes/    giả định, nhật ký AI, retro
docs/proof/    bằng chứng sinh tự động
```
