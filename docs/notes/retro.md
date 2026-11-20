# Retro: Đảo Đèn Lồng (Day 12 AI SDLC)

Viết khi kết thúc Phase 4 (2026-11-20). Công cụ: Claude Code (desktop), model Claude Opus 5.5, một phiên duy nhất + 1 subagent review.

## Số liệu dự án (đếm thật từ repo)

| | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Contract | v1.0 | v1.1 | v1.2 | v1.3 |
| Test (`npm test`) | 43 | 90 | 117 | 123 |
| Scenario headless | 9 | 22 | 31 | 31 |
| Lỗi thật do test/review bắt | 0 | 2 do test/trình duyệt (biên vùng an toàn; tạm dừng không tiếp tục được) + 3 do review (recoil 59 bước, gió 299 tick, Tỏa Sáng xóa trạng thái đẩy) | 1 (`drain` vẫn hút khi bị đẩy) | 1 (soak: bộ nhớ chưa đạt, đã phân tích) |

- Toàn repo có 41 commit nhỏ (`git log --oneline | wc -l`, đếm lúc viết retro).
- Bench thật: 114.1 FPS trung bình, p1 low 47.3, load 3.9 s (trước khi thêm hiệu ứng đèn: 157.2 / 87.1).
- Soak: 0 crash, bộ nhớ ×1.30 (chưa đạt ×1.2).

## Đánh giá từng phase (tóm tắt; chi tiết ở `phase-N.md`)

- **P1:** đạt mọi AC. Quyết định đúng nhất là tách `src/sim` (thuần, tất định) khỏi `src/web` ngay từ đầu, nhờ vậy cả 4 phase thêm luật không phải sửa renderer nhiều.
- **P2:** đạt. Ticket đổi gần hết số liệu; nhờ có bảng "Thay đổi so với Phase 1" nên mọi test cũ được sửa có lý do. Review độc lập bắt được 3 lỗi lệch-một mà 80 test của chính mình bỏ sót.
- **P3:** đạt. Có ADR và CHANGELOG trước khi code. Dầu lưu bằng số nguyên 1/60 nên không có sai số số thực.
- **P4:**
  - Bench và bảng xếp hạng đạt.
  - Soak chưa đạt ngưỡng bộ nhớ (phân tích trong `phase-4.md`).
  - Chưa có video demo, chưa có Release/tag (chờ người dùng).

## Điều hiệu quả khi làm với AI

1. **Kỳ vọng tính tay trước khi chạy:** scenario Phase 3 tính tay đạt 31/31 ngay lần đầu. Khi lệch, phải phân định "code sai hay mình tính sai" và ghi lại.
2. **Hook `Stop` chặn kết thúc khi test đỏ** và **hook chặn sửa tay `docs/proof/`**: bằng chứng luôn sinh từ script.
3. **Review bởi agent khác** (`contract-reviewer`, khoảng 56k token): rẻ so với giá trị, vì tìm ra 3 lỗi thật.
4. **Script vá có `assert` khớp đúng một lần**: sau một lần vá nhầm làm trùng code ở Phase 3, quy tắc này được đưa vào AGENTS.md.

## Những lần AI sai và cách phát hiện

| Lỗi | Phát hiện bằng | Chỉnh harness |
|---|---|---|
| Kỳ vọng tính tay quên 1 lần giảm bộ đếm (dash 70 vs 71 tick) | Scenario đỏ | Ghi "bẫy bộ đếm" vào skill + AGENTS.md |
| Biên vùng an toàn dùng `<` thay vì `≤` | Scenario `safe_zone` | Quy tắc "biên inclusive + đệm 0.001" trong AGENTS.md |
| Recoil/gió lệch 1 tick | Subagent review | Thêm test độc lập cho từng luật thời gian |
| Vá code bằng `index()` lấy nhầm vị trí, chèn trùng một khối lớn | `grep -c` thấy 2 khối chase | Quy tắc "neo + assert khớp một lần" |
| Đo FPS ra 30 (tab chạy nền bị bóp nhịp) | So với trang nhẹ `character.html` | "Đo FPS ở tab phía trước" trong AGENTS.md |
| Tạm dừng không tiếp tục được (renderer không gửi lần thả nút) | Kiểm `sim_tick` trên trình duyệt | Ghi vào AGENTS.md |
| Giật hình: 58% khung đứng yên ở 144 Hz | Đo vị trí từng khung | Nội suy vị trí khi vẽ |

## Dùng token

Số đo thật, từ công cụ usage của Claude Code lúc viết retro:
- **Ngữ cảnh phiên:** 713 248 token (71% của cửa sổ 1M), trong đó 655k là hội thoại.
- **Hạn mức gói Pro:** đã dùng 82% khung 5 giờ, 56% khung tuần.
- **Subagent review:** 55 711 token.
- **Không đo được:** số token tính phí chính xác theo từng phase, và chi phí USD (gói Pro không hiển thị). Mình không ước đoán số này.

Phần tốn nhất là đọc ticket bằng ảnh chụp: board không cho đọc text, khoảng 10–20 ảnh mỗi phase.

Cách đã tiết kiệm:
- Chép ticket thành `phase-N.md` một lần rồi chỉ làm việc từ file đó.
- Kiểm chứng bằng script (`npm test`, `npm run proof`, bench/soak) thay vì để agent đọc output dài.
- Dùng một subagent duy nhất cho review.
- Vá code bằng script thay vì đọc lại cả file.

## Nếu làm lại

1. Hỏi trợ giảng ngay các giả định rủi ro (xuất phát Đêm 3, kiểu `invuln`, thời điểm `fuel_drain`) thay vì chỉ ghi lại.
2. Commit và tag ngay cuối mỗi phase. Ở P2/P3, tag bị trễ vì chờ xác nhận push.
3. Viết test độc lập cho mọi luật có thời gian ngay từ đầu, không chỉ scenario.
4. Viết soak sớm hơn để có thời gian giảm cấp phát trong vòng lặp `step`. Có thể làm `step` không tạo object mới mỗi tick để RSS ổn định hơn khi JIT.
5. Quay video demo trong lúc chơi thử từng phase, không để tới cuối.
