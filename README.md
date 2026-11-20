# Đảo Đèn Lồng

> **Video demo:** _(sẽ thêm ở Phase 4)_ · Đề bài và tài liệu lab: [LAB.md](LAB.md)
> Ly Thanh Lap · 2A202603414 · Day 12 AI SDLC

Game 3D góc nhìn thứ ba (Three.js). Mây, người giữ đèn nhỏ tuổi (một chiến binh gấu trúc mang đèn lồng nhỏ), gom đom đóm để thắp lại 5 Đèn Lồng Lớn của Đảo Bến và né Bóng Mực trong sương đen. Logic game là một mô phỏng tất định (`src/sim/`), dùng chung cho bản chơi trên trình duyệt và chế độ headless theo **Test Contract v1.0**.

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
| `E` | Nạp ánh sáng vào đèn gần nhất (≤ 2.5 m) |
| `F` hoặc click chuột trái | Tỏa sáng: tốn 1 đom đóm, làm choáng và đẩy Bóng Mực trong 6 m |
| Kéo chuột / `←` `→` | Xoay camera |
| `R` / `Enter` | Chơi lại sau khi thắng/thua |

## Luật và cách tính điểm

- Đi vào đom đóm (≤ 1 m) thì tự nhặt, mang tối đa **5**. Mỗi đèn cần **5** đom đóm để thắp.
- Bóng Mực đuổi theo Mây (3.5 m/s, Mây chạy 6 m/s). Bị chạm (≤ 1 m) thì mất 1 lửa, rơi mất một nửa số đom đóm đang mang, rồi bất tử 1.5 s. Mây có **3** lửa.
- Đèn đã thắp tạo vùng an toàn bán kính **5 m**: Bóng Mực không vào được.
- **Thắng:** thắp đủ 5 đèn. **Thua:** hết lửa (`no_flames`) hoặc hết 300 s, tức bình minh (`dawn`).
- **Điểm:** +10 mỗi đom đóm nhặt, +100 mỗi đèn thắp, +20 mỗi Bóng Mực bị choáng. Khi thắng cộng thêm `floor(giây còn lại) × 1 + lửa còn lại × 50`.

Tuning đầy đủ có trong [game.contract.json](game.contract.json). Mọi khái niệm của contract đều có trong game. `fall_enabled: false` vì đảo có rìa chặn (bán kính 30 m) nên không thể rơi. Giả định cho các chỗ mơ hồ: [docs/notes/phase-1.md](docs/notes/phase-1.md).

## Kiểm chứng

- `npm test`: 43 test (unit test cho luật, 9 scenario headless chạy qua CLI thật, mỗi scenario chạy 2 lần để so từng byte, kiểm tra định dạng, mã thoát 2 khi file sai).
- `npm run proof -- phase-1`: sinh [docs/proof/phase-1/RESULTS.md](docs/proof/phase-1/RESULTS.md) và output `.jsonl` thật.
- CI (GitHub Actions) chạy test, proof và build trên Ubuntu và macOS mỗi lần push.
- Ảnh chơi thật: [docs/proof/phase-1/screens/](docs/proof/phase-1/screens/).

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

- **Mây là một chiến binh gấu trúc** ([src/web/character.js](src/web/character.js)): áo choàng xanh ngọc với vạt đỏ, giáp vai đồng, đai đỏ, dây chéo và huy hiệu trước ngực, kiếm trong vỏ đeo sau lưng (chỉ để trang trí, không bao giờ rút ra). Mô hình dựng theo ảnh tham chiếu trong `game_charactor/`. **Không đội nón lá**, đèn lồng nhỏ treo ở đai (lệch so với PRD-0, xem giả định 16 trong docs/notes/phase-1.md). Có vòng đi bộ đơn giản (vung tay chân). Xem mẫu ở `http://localhost:5173/character.html` (thêm `?angle=180` để cố định góc). Ảnh: [front](docs/proof/phase-1/screens/04-character-front.png), [back](docs/proof/phase-1/screens/05-character-back.png), [side](docs/proof/phase-1/screens/06-character-side.png).
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
