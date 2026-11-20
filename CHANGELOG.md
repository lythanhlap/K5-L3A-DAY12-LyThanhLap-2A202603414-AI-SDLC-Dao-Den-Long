# Changelog

## [phase-3] Contract v1.2: Ticket-03 "Đèn cạn dầu"

### Breaking changes
- `contract_version` thành `"1.2"`. `tuning` thêm `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`. `night1/2/3_duration_s` thành 240/270/300.
- **Luật thắng**: thắp đủ đèn không còn kết thúc Đêm. Thắng chỉ ở bình minh khi số đèn đang sáng ≥ `ceil(0.6 × n)`. `game_over.reason` `all_lit` bị bỏ, thêm `dawn_survived`.
- **Điểm**: +5 mỗi đom đóm nạp (trước đây +10); +100 thắp lần đầu, +40 thắp lại; Tỏa Sáng +5 (+15 nếu bóng đang `drain`); thưởng bình minh +50 + floor(fuel) mỗi đèn sáng và +50 mỗi lửa; bỏ thưởng thời gian.
- **Đèn có thể tắt**: sự kiện mới `lantern_out`; `deposited` về 0 khi tắt. Đèn đang sáng giờ nhận được đom đóm (châm dầu, sự kiện `refuel`).
- **Vùng an toàn** chỉ tồn tại khi `fuel ≥ 30`.
- **Bóng Mực**: thêm trạng thái `drain`. Hết choáng luôn về `wander`.
- **Sức chứa** không cố định 10 nữa: `10 + 2 × successful_lights`, tối đa 20.
- Snapshot: đèn thêm `fuel`, `ever_lit`, `relit_count`; `player.capacity`. `lantern_lit.data` thêm `relight`.
- Scenario: đèn nhận `fuel`, `ever_lit`; `player.successful_lights`; `shades[].target_lantern_id`. Sự kiện `fuel_drain`.

### Không đổi
- Bản đồ, tick model, Gió Lạc, Bùa Gió, lướt, rơi khỏi đảo, tạm dừng, định dạng input.

## [phase-2] Contract v1.1: Ticket-02 "Ba hòn đảo"
- 3 đêm, bản đồ chuẩn, số chuẩn, lướt/rơi/Gió Lạc/Bùa Gió/gió mạnh/tạm dừng, menu và HUD đầy đủ (xem `docs/notes/phase-2.md`).

## [phase-1] Contract v1.0: PRD-0
- Đêm 1, headless theo contract v1.0 (xem `docs/notes/phase-1.md`).
