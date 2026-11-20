# Nhật ký dùng AI

Công cụ: Claude Code (desktop app, model Claude Opus 5.5). Harness: xem README mục "Harness AI".

## Phase 1

| Bước | Prompt chính / việc giao | Kết quả | Ghi chú |
|---|---|---|---|
| Chuẩn bị | "đọc các file readme và cấu hình… để sẵn sàng làm con game" | Agent đọc 6 tài liệu lab + PRD-0. File PDF chỉ chứa hình vẽ vector nên đọc thẳng từ lab board | Bị chặn khi cố cài PyMuPDF để đọc PDF; chuyển sang đọc artifact |
| Chọn stack | Chọn Three.js + Node | Logic JS thuần → headless không cần dependency | Quyết định: tách `src/sim` khỏi `src/web` ngay từ đầu |
| Build | Sim + CLI + validation | Chạy được ngay lần đầu; malformed → exit 2 | |
| Test | 9 scenario + unit test | 43/43 xanh. Giá trị kỳ vọng được tính tay từ tuning trước khi chạy (vd: 7.942 = 4 − 3.5/60 + 4; 549 = 100 + 299 + 150) | Lần đầu `node --test tests/` lỗi trên Node 22 (không nhận thư mục) → đổi sang glob `tests/*.test.js` |
| Renderer | Three.js + HUD + overlay | Kiểm chứng trong trình duyệt: W → +Z, D → −X (bên phải màn hình), thua → overlay → R chơi lại, thắp đèn bằng phím E, thắng `all_lit` 636 điểm | Màn chơi đầu quá tối → tăng ánh sáng môi trường |
| Harness | AGENTS.md, 2 hook, skill, subagent reviewer, CI | Đã thử hook: test đỏ → exit 2; có cờ chống lặp; chặn sửa `docs/proof` | Lần thử đầu hook guard có vẻ "không chặn", nhưng nguyên nhân là `echo` của bash làm hỏng JSON đầu vào chứ không phải lỗi hook |

**Token / chi phí:** _(điền số thật từ trang usage của claude.ai hoặc lệnh `/cost`)_. Cách tiết kiệm: đọc toàn văn lab board một lần rồi ghi lại giả định; không chạy agent vòng lặp; kiểm chứng bằng script (`npm test`, `npm run proof`) thay vì để agent tự mô tả.

### Chỗ AI sai / cần để ý
- Trong lúc kiểm chứng, ảnh thắng/thua được dựng bằng cách sửa state qua `window.__game` (dịch chuyển nhân vật, đặt sẵn đèn đã thắp). Hành động nạp đèn và chơi lại là phím thật. Ghi rõ để không nhầm với một ván chơi trọn vẹn.

### Đổi nhân vật (Phase 1, sáng tạo)
- Prompt: "thay nhân vật giống nhân vật trong game_charactor/" (4 ảnh gấu trúc mặc giáp).
- Agent dựng lại bằng khối hình cơ bản trong `src/web/character.js` và thêm trang `character.html` để xem mẫu. **Cố ý giữ nón lá + đèn nhỏ** vì PRD-0 bắt buộc. Kiếm để trong vỏ cho hợp yêu cầu "không bạo lực".
- Lần đầu vòng lặp game có vẻ "đứng" (tick = 0) khi kiểm tra bằng JS. Nguyên nhân: trang bị tạm dừng requestAnimationFrame khi pane không được vẽ, không phải lỗi code. Chụp màn hình thì vòng lặp chạy lại.
- Lần đầu phần bụng màu kem bị thân che, phát hiện nhờ ảnh trên trang xem mẫu, đã sửa vị trí.
- Chỉ đổi `src/web/`, nên output headless không đổi (43/43 test xanh).
- Sau đó chủ dự án quyết định **bỏ nón lá**. Agent đã nhắc rằng việc này lệch PRD-0, rồi làm theo: giữ đèn nhỏ, chuyển đèn xuống đai, ghi thành giả định 16 và chụp lại ảnh.

## Phase 2

| Bước | Việc | Kết quả / ghi chú |
|---|---|---|
| Đọc ticket | Board tải phase từ database; `Artifact read` và `ArtifactData` không đọc được (artifact của tổ chức khác) | Mở board trong trình duyệt tích hợp và đọc bằng ảnh chụp từng đoạn. Lần đầu cuộn quá xa nên sót nội dung; đọc lại với bước cuộn nhỏ hơn |
| Tag phase-1 | Hỏi người dùng trước, sau đó commit nhỏ, tag, push | phase-1 → `4b9f73b` |
| Sim v1.1 | Viết lại `game.js` theo thứ tự 12 bước, `maps.js` cho 3 đêm | Smoke test 3 đêm × 21 600 tick đều chạy được ngay |
| Scenario | 22 scenario, kỳ vọng tính tay | 19/22 đạt lần đầu. 1 lỗi code thật (biên vùng an toàn), 2 lỗi tính tay (ghi ở phase-2.md) |
| Renderer | 3 đêm, menu, tạm dừng, cài đặt, âm thanh, HUD, bảng màu | Phát hiện lỗi tạm dừng không tiếp tục được, nhờ kiểm tra `sim_tick` trong trình duyệt |
| Harness | AGENTS.md: v1.1, quy ước biên, bẫy bộ đếm. Skill: kiểu kiểm `between`/`dist` và các bẫy đã gặp | |

**Token / chi phí Phase 2:** _(điền số thật từ trang usage hoặc `/cost`)_. Phần tốn nhiều nhất là đọc ticket bằng ảnh chụp, khoảng 20 ảnh. Cách tiết kiệm: ghi ticket thành `phase-2.md` một lần rồi chỉ đọc file đó; kiểm chứng bằng `npm test` thay vì để agent tự đọc output.
- **Review độc lập (Phase 2)**: chạy subagent `contract-reviewer` (khoảng 56k token). Nó tìm ra 3 lỗi thật (recoil lệch 1, gió 299 tick, Tỏa Sáng xóa trạng thái đẩy-khỏi-vùng) mà 80 test cũ không bắt được, vì kỳ vọng của mình được tính theo đúng mô hình sai đó. Bài học: người viết code tự tính kỳ vọng dễ lặp lại chính lỗi của mình. Review độc lập nên chạy trước mỗi tag.
