# ADR-0001: Đèn có nhiên liệu, thắng lúc bình minh

- Trạng thái: Đã chấp nhận (Phase 3, Ticket-03)
- Thay thế: luật Phase 1–2 "đèn sáng là sáng mãi", "thắng ngay khi đủ đèn", "Bóng Mực không bao giờ vào vùng an toàn"

## Bối cảnh

Playtest cho thấy người chơi giỏi thắp hết đèn trong 2 phút, game kết thúc mà cuối Đêm thiếu căng thẳng. Mục tiêu đổi từ "thắp hết" sang "giữ đảo sáng tới bình minh".

## Quyết định

1. **Mô hình trạng thái đèn** đổi từ hai trạng thái (`unlit → lit`, một chiều) sang một vòng:
   `unlit(ever_lit=false) --10 đom đóm--> lit(fuel=100) --fuel≤0--> unlit(ever_lit=true) --5 đom đóm--> lit(fuel=100)`.
   - `lit` được chia thêm theo ngưỡng: `fuel ≥ 30` thì có vùng an toàn; `fuel < 30` thì "yếu": mất vùng an toàn và là mục tiêu của Bóng Mực.
   - Đèn giữ `deposited`, `ever_lit`, `relit_count` và `fuelU`.
2. **Dầu lưu bằng số nguyên** (`fuelU`, đơn vị 1/60): hao 1, mỗi bóng hút 5 đơn vị mỗi tick, châm +600 mỗi đom đóm. Không có sai số số thực. Chỉ làm tròn khi xuất (`fuel = fuelU/60`, 1 chữ số thập phân).
3. **Thắng/thua chỉ xét ở bước 11, theo thứ tự:** hết lửa → thua `no_flames`; hết giờ → so số đèn đang sáng với `ceil(0.6 × n)` → `dawn_survived` hoặc `dawn`. Thắp đủ đèn không còn là điều kiện kết thúc. Bước 2 trừ dầu và tắt đèn trước khi đếm.
4. **Bóng Mực thêm trạng thái `drain`** trong cùng máy trạng thái: `wander → (tới đèn yếu ≤ 2 m) → drain → chase | stunned | wander`. Hết choáng thì luôn về `wander` (trước đây chọn `chase`/`wander` theo khoảng cách). Lượng hút được trừ ở bước 2 cùng với hao, theo đúng thứ tự tick của ticket.
5. **Sức chứa** thành giá trị suy ra `min(20, 10 + 2 × successful_lights)`, không lưu riêng, nên không lệch được.
6. **Vùng an toàn** là hàm của `(lit, fuel)`. Hàm `inSafeZone()` vẫn là chỗ kiểm tra duy nhất, chỉ thêm điều kiện `fuelU ≥ 1800`. Châm dầu vượt ngưỡng 30 dùng lại cơ chế đẩy-ra-trong-30-tick có sẵn của Phase 2.

## Hệ quả

- Test và scenario dựa trên `all_lit` hoặc công thức điểm cũ phải viết lại. Danh sách và lý do: [phase-3.md](../notes/phase-3.md#thay-đổi-test-cũ-không-skip-âm-thầm).
- Mỗi Đêm luôn chạy tới hết giờ, trừ khi hết lửa. Một đêm đầy đủ dài 14 400–18 000 tick, vẫn dưới giới hạn 21 600.
- Renderer phải hiển thị dầu (thanh + nhấp nháy < 30) và phân biệt đèn tắt/sáng không cần màu (chế độ mù màu).
