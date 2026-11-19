# Soundboard Studio cho Windows

Soundboard Studio là ứng dụng phát hiệu ứng âm thanh cho Windows của **Qu4nh**. Bạn có thể gán phím tắt toàn hệ thống, phát nhiều âm cùng lúc, trộn hiệu ứng với giọng nói qua mic ảo, hoặc ghi và chỉnh sửa âm thanh ngay trong ứng dụng.

Khi gọi thoại hoặc livestream, app đưa giọng nói và clip bạn bấm vào cùng một đầu vào mic, để người nghe nhận được cả hai. Đường nghe riêng giúp bạn thử clip trên loa hoặc tai nghe trước khi phát cho người khác. Khi kết thúc phiên tự chuyển mic, app trả Windows về thiết bị thu mặc định đã lưu.

## Chạy ứng dụng

Dùng bản portable x64 trong mục **Releases** khi đã phát hành. Để chạy từ mã nguồn, cài Node.js 24 và Git rồi chạy trong thư mục repo.

```powershell
npm ci
npm run build
npm start
```

Giao diện mặc định là tiếng Anh. Đổi ngôn ngữ trong **Settings → General → Language**. Để dùng offline, nhập tệp âm thanh của bạn hoặc phát clip cộng đồng đã lưu.

## Dùng mic ảo

1. Mở **Cài đặt → Âm thanh → Mic ảo**. Nếu thiếu VB-CABLE, dùng nút cài trong app. App tải gói từ nhà cung cấp, xác minh chữ ký và mở trình cài. Duyệt hộp thoại UAC, bấm **Install Driver**, khởi động lại Windows rồi mở lại app.
2. Bật **Tự chuyển** để app chuyển mic mặc định Windows sang **CABLE Output** sau khi chuẩn bị đường âm. Bạn cũng có thể chọn trực tiếp **CABLE Output** khi cần chỉ định đầu vào.
3. Mở **Chi tiết → Kiểm tra mic ảo**. Nói hoặc phát một pad qua phím tắt. Quan sát thanh tín hiệu rồi bấm **Nghe lại** để kiểm tra âm trên loa hoặc tai nghe vật lý.

Khi thoát hẳn, app trả từng vai trò mic của Windows về thiết bị đã lưu. Nếu bật chế độ chạy trong khay hệ thống, đóng cửa sổ giữ phiên mic ảo hoạt động cho đến khi bạn chọn **Thoát ứng dụng**. Nếu thiết bị trước đó đã rút, app giữ nhật ký để còn dữ liệu khôi phục.

Nếu vừa nghe qua loa ngoài vừa mở mic, bật **Cài đặt nâng cao → Khử vọng loa ngoài** để giảm tiếng loa lọt vào mic.

## Chỉnh và lưu âm

- Nhấp phải vào pad và chọn **Soundlab** để cắt đoạn, chỉnh fade, pitch, tốc độ và loudness. Chọn **Save** để thay bản đang dùng hoặc **Save a copy** để giữ hai clip.
- **Recorder** hỗ trợ mic, âm hệ thống và bản trộn. **Instant Replay** giữ tối đa 45 giây trong RAM khi được bật.
- **Library** hỗ trợ tìm kiếm, lọc và tự cập nhật. Nghe thử Library dùng loa hoặc tai nghe vật lý. Âm đã lưu được giữ trong thư viện cục bộ.

## Hiệu năng

- **Khi để yên.** RAM riêng đang dùng khoảng **130–133 MiB** qua ba lần mở app, với mic và Instant Replay tắt. CPU trung bình **0,05%** trên toàn máy.
- **Phát âm.** CPU trung bình **1,35%** khi phát đồng thời ba clip stereo 45 giây.
- **Soundlab.** Lưu bản chỉnh stereo 45 giây có đổi pitch mất **1,94 giây**, tính đến lúc pad mới xuất hiện.
- **Instant Replay.** Mã hóa đồng thời ba bản WAV 45 giây cho mic, âm hệ thống và bản trộn mất **168 ms** theo trung vị.
- **Phát khi thu nhỏ.** Với 240 pad và ba âm đang phát, tiến trình giao diện dùng **0,31 ms mỗi giây** để xử lý tác vụ. App tiếp tục phát âm và xử lý phím tắt toàn hệ thống.

Các phép đo dùng âm thanh tổng hợp trên máy Windows x64 với Intel Core i7-10700K.

## Giấy phép

Bạn có thể dùng, sửa và chia sẻ mã dự án cho mục đích phi thương mại. Khi chia sẻ bản gốc hoặc bản đã sửa, hãy giữ dòng ghi công Qu4nh và đính kèm giấy phép hoặc liên kết đến giấy phép. Nếu muốn dùng cho mục đích thương mại, hãy xin phép Qu4nh. [PolyForm Noncommercial 1.0.0](../LICENSE)

[README tiếng Anh](../README.md) · [Kiến trúc](architecture.md) · [Phương pháp đo và cách chạy lại](benchmarks.md)
