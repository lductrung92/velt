# Release 2026-10-18

Đưa 8 bài viết và sản phẩm Cofyn từ máy local lên server, kèm hai cột mới của
`product_media`.

Toàn bộ nội dung sinh **từ database local** (`velt_deploy`), không phải từ file
markdown gốc — thứ lên server đúng bằng thứ đã duyệt ở local, kể cả các sửa làm
trong console sau khi import.

## Thứ tự chạy

| Bước | File | Việc |
| --- | --- | --- |
| 1 | `01-schema.sql` | thêm `product_media.device` và `product_media.is_hero` |
| 2 | `02-articles.sql` | 1 danh mục, 8 bài viết, 8 bản dịch EN, 8 dòng `files`, 16 `published_docs` |
| 3 | `03-products.sql` | sản phẩm Cofyn, 15 ảnh gallery, 1 thành viên, 18 dòng `files`, 2 `published_docs` |
| 4 | ảnh | 26 file ảnh, xem phần dưới |

```sh
psql -d <db> -v ON_ERROR_STOP=1 -f 01-schema.sql
psql -d <db> -v ON_ERROR_STOP=1 -f 02-articles.sql
psql -d <db> -v ON_ERROR_STOP=1 -f 03-products.sql
```

**Bước 1 chỉ cần khi không dùng `api migrate`.** Bình thường cmd/api tự chạy
migration 0052 và 0053 lúc khởi động, và đó là đường chính thức; `01-schema.sql`
dành cho trường hợp muốn đổi lược đồ trước, tách khỏi lần restart — nên nó ghi
luôn hai dòng goose 52/53, nếu không lần khởi động sau goose sẽ chạy lại và chết
vì cột đã tồn tại.

Ba file đều **chạy lại được**: mỗi bản ghi khoá theo id của chính nó với
`ON CONFLICT DO UPDATE`, chạy lần hai là cập nhật tại chỗ chứ không nhân đôi.

## Hai nguyên tắc của phần dữ liệu

1. **Khoá ngoại nối bằng khoá tự nhiên**, không bằng uuid local: tác giả tra
   theo `email`, danh mục theo `slug`, thành viên theo `slug`. Trên server chúng
   mang id khác; bê id local sang thì hoặc gãy khoá ngoại, hoặc tệ hơn là gắn nội
   dung vào đúng người đang giữ id đó.
2. **Bản ghi giữ nguyên id của chính nó.** Các dòng `files` trỏ vào id đó và
   đường dẫn ảnh trên đĩa cũng chứa id đó, nên id phải đi theo.

Mỗi file mở đầu bằng một khối `DO $guard$` dừng ngay khi thiếu phụ thuộc
(tài khoản `trungld@zakutek.com`, thành viên `nhat`, cột `is_hero`) — báo lỗi đọc
được, thay vì để INSERT chết với thông báo khoá ngoại chỉ nêu tên cột.

Có sẵn `published_docs` nên trang công khai hiện nội dung ngay, không phải vào
console bấm xuất bản lại.

## Ảnh

26 file, 4,0 MB, nằm dưới thư mục storage của server
(`STORAGE_LOCAL_ROOT`, theo `bao-mat/deploy.md` là `/var/lib/zukatek/storage/`,
**chủ sở hữu phải là `zukatek`**). Đường dẫn con phải giữ nguyên: cột
`files.storage_key` và `cms_articles.featured_path` trỏ thẳng vào chúng.

```
cms/articles/<id bài viết>/featured-<id file>.webp     8 file
products/<id sản phẩm>/cover-<id file>.webp             3 file
products/<id sản phẩm>/gallery-<id file>.webp         15 file
```

Đóng gói ở local:

```sh
cd src/backend/storage
awk '{print $2}' ../../../deploy/sql/release-2026-10-18/04-anh.sha256 > /tmp/anh.txt
tar -czf anh-release-2026-10-18.tar.gz -T /tmp/anh.txt
```

Giải nén trên server rồi kiểm tra:

```sh
tar -xzf anh-release-2026-10-18.tar.gz -C /var/lib/zukatek/storage
chown -R zukatek:zukatek /var/lib/zukatek/storage
cd /var/lib/zukatek/storage && sha256sum -c 04-anh.sha256
```

`04-anh.sha256` liệt kê đủ 26 file; sha256 trong đó lấy từ cột `files.sha256`
của database, nên nó kiểm tra cùng lúc hai điều: file lên đủ, và nội dung file
đúng bằng thứ database mô tả.

## Đã kiểm tra những gì

Dựng database trắng từ `deploy/sql/ddl.sql` + `master_data.sql`, bỏ hai cột mới
để giả lập lược đồ server, rồi chạy cả ba file:

- 3 file chạy sạch với `ON_ERROR_STOP=1`;
- so khớp md5 của 7 nhóm bảng (bài viết, bản dịch, files, published_docs, sản
  phẩm, product_media, product_members) giữa database vừa dựng và `velt_deploy`
  — **giống hệt**;
- chạy lại lần hai: md5 không đổi;
- số lượng: 8 bài viết, 16 published_docs bài viết, 8 files bài viết, 15 ảnh
  gallery chia đều 5 phone / 5 tablet / 5 desktop, 3 ảnh hero, 18 files sản
  phẩm, goose có 52 và 53;
- 26 file ảnh trên đĩa khớp sha256 với bảng `files`, và gói tar giải nén ra
  khớp lại đúng 26/26.
