-- Release 2026-10-18 · bước 1/3: đổi lược đồ
--
-- Hai cột mới trên product_media:
--   device   phone | tablet | desktop — ảnh chụp trên thiết bị nào. Trước đây
--            site ĐOÁN từ caption và tỉ lệ ảnh; đổi chữ trong caption là ảnh
--            nhảy sang khung khác.
--   is_hero  ảnh đại diện cho thiết bị đó ở đầu trang sản phẩm.
--
-- CHỈ CHẠY FILE NÀY KHI KHÔNG DÙNG `api migrate`.
-- Bình thường cmd/api tự chạy migration 0052 và 0053 lúc khởi động, và đó là
-- đường chính thức. File này dành cho trường hợp muốn đổi lược đồ trước, tách
-- khỏi lần restart — nên nó ghi luôn hai dòng goose tương ứng, nếu không lần
-- khởi động sau goose sẽ chạy lại và chết vì cột đã tồn tại.
--
-- Chạy lại được: mọi bước đều kiểm tra trước khi làm.
--
--   psql -d <db> -v ON_ERROR_STOP=1 -f 01-schema.sql

BEGIN;

-- 0052 ---------------------------------------------------------------------
ALTER TABLE product_media
    ADD COLUMN IF NOT EXISTS device TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_media_device_check'
  ) THEN
    ALTER TABLE product_media
      ADD CONSTRAINT product_media_device_check
      CHECK (device IS NULL OR device IN ('phone', 'tablet', 'desktop'));
  END IF;
END
$$;

COMMENT ON COLUMN product_media.device IS
    'phone | tablet | desktop (laptop va man hinh PC dung chung); NULL = chua phan loai';

-- 0053 ---------------------------------------------------------------------
ALTER TABLE product_media
    ADD COLUMN IF NOT EXISTS is_hero BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN product_media.is_hero IS
    'anh dai dien cho thiet bi cua no o dau trang san pham';

CREATE INDEX IF NOT EXISTS idx_product_media_hero
    ON product_media (product_id, device)
    WHERE is_hero;

-- Goose phải biết hai bản này đã chạy ------------------------------------
-- Không có hai dòng dưới đây, lần khởi động tiếp theo goose sẽ chạy lại
-- 0052/0053 và dừng vì cột đã có.
INSERT INTO goose_db_version (version_id, is_applied, tstamp)
SELECT v, true, now()
FROM (VALUES (52), (53)) AS t(v)
WHERE NOT EXISTS (
  SELECT 1 FROM goose_db_version g WHERE g.version_id = t.v AND g.is_applied
);

COMMIT;

-- Kiểm tra sau khi chạy:
--   \d product_media                     -- phải thấy device, is_hero
--   SELECT version_id FROM goose_db_version ORDER BY version_id DESC LIMIT 3;
