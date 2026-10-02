# Nhạc nền cho Reels

Bỏ file nhạc (`.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg`) vào thư mục này rồi commit. Mỗi video Reels chọn ngẫu nhiên 1 bài,
lấy ~13 giây đầu, mờ dần ở cuối. Bài to hay nhỏ không sao: mỗi bài được đo độ to rồi tự chỉnh về cùng một mức
(`REELS_MUSIC_LUFS`, mặc định -16), nên các video nghe đều nhau. Thư mục không có nhạc thì video không nhạc.

## Chỉ dùng nhạc được phép

- YouTube Audio Library (chọn bài **không yêu cầu ghi công**), Pixabay Music…
- Không dùng nhạc ca sĩ / nhạc trend TikTok: Facebook có thể tắt tiếng hoặc chặn Reel.
- Repo nên để **riêng tư**: nhiều giấy phép cho dùng nhạc trong video nhưng không cho chia sẻ lại file nhạc gốc công khai.

## Giữ repo nhẹ

Mỗi bài chỉ cần ~20 giây đầu. Cắt và nén trước khi commit (mỗi file còn ~300 KB):

```bash
ffmpeg -i bai-goc.mp3 -t 20 -ac 2 -ar 48000 -b:a 128k src/assets/music/ten-bai.mp3
```

Nên có 3–10 bài để video không bị lặp nhạc.
