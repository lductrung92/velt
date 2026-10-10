package seed

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CMS seed slugs all carry these prefixes so Reset can target exactly the seeded
// rows and re-runs stay idempotent (ON CONFLICT (slug) DO NOTHING).
const (
	seedTagSlugPrefix      = "seed-tag-"
	seedCategorySlugPrefix = "seed-cat-"
	seedArticleSlugPrefix  = "seed-article-"
)

// articleStatuses is cycled across the seeded articles so every workflow state is
// represented (matches the cms_articles status CHECK constraint).
var articleStatuses = []string{"draft", "pending_review", "needs_revision", "scheduled", "published", "archived"}

// seedItem / seedCat are the real CMS taxonomy seed rows (curated from popular
// education/EdTech search topics, scoped to Velt's niche: teachers + early
// childhood/primary, educational games, materials, AI). Slugs are ASCII + carry
// the seed prefix so Reset/idempotency still target them.
type seedItem struct{ Name, Slug string }
type seedCat struct {
	Name, Slug, Desc string
}

// cmsCategories: the 5 top-level content categories (flat).
var cmsCategories = []seedCat{
	{"Giáo dục mầm non", "giao-duc-mam-non", "Nuôi dưỡng & dạy trẻ mầm non: Montessori, STEAM, học qua chơi."},
	{"Phương pháp dạy học", "phuong-phap-day-hoc", "Phương pháp & kỹ thuật dạy học hiệu quả cho giáo viên."},
	{"Trò chơi giáo dục", "tro-choi-giao-duc", "Trò chơi giúp trẻ vừa học vừa chơi, phát triển tư duy."},
	{"Kỹ năng cho trẻ", "ky-nang-cho-tre", "Kỹ năng sống, cảm xúc và tư duy cho trẻ."},
	{"Công nghệ giáo dục", "cong-nghe-giao-duc", "EdTech, AI và công cụ số trong dạy & học."},
}

// cmsTags: ~100 niche keywords for SEO-relevant tagging.
var cmsTags = []seedItem{
	{"Giáo dục mầm non", "giao-duc-mam-non"},
	{"Montessori", "montessori"},
	{"STEAM", "steam"},
	{"Reggio Emilia", "reggio-emilia"},
	{"Học qua chơi", "hoc-qua-choi"},
	{"Vận động tinh", "van-dong-tinh"},
	{"Vận động thô", "van-dong-tho"},
	{"Phát triển ngôn ngữ", "phat-trien-ngon-ngu"},
	{"Làm quen chữ cái", "lam-quen-chu-cai"},
	{"Làm quen với toán", "lam-quen-voi-toan"},
	{"Kể chuyện cho bé", "ke-chuyen-cho-be"},
	{"Âm nhạc cho trẻ", "am-nhac-cho-tre"},
	{"Tô màu", "to-mau"},
	{"Vẽ cho bé", "ve-cho-be"},
	{"Thủ công", "thu-cong"},
	{"Nặn đất sét", "nan-dat-set"},
	{"Trò chơi cảm giác", "tro-choi-cam-giac"},
	{"Hoạt động Montessori", "hoat-dong-montessori"},
	{"Phonics", "phonics"},
	{"Đánh vần", "danh-van"},
	{"Tập đọc", "tap-doc"},
	{"Tập viết", "tap-viet"},
	{"Bảng chữ cái", "bang-chu-cai"},
	{"Đọc hiểu", "doc-hieu"},
	{"Từ vựng", "tu-vung"},
	{"Đọc sách cho bé", "doc-sach-cho-be"},
	{"Thói quen đọc sách", "thoi-quen-doc-sach"},
	{"Số đếm", "so-dem"},
	{"Phép cộng", "phep-cong"},
	{"Phép trừ", "phep-tru"},
	{"Hình học", "hinh-hoc"},
	{"Màu sắc", "mau-sac"},
	{"Hình dạng", "hinh-dang"},
	{"Tư duy logic", "tu-duy-logic"},
	{"Tư duy toán học", "tu-duy-toan-hoc"},
	{"Kỹ năng sống", "ky-nang-song"},
	{"Kỷ luật tích cực", "ky-luat-tich-cuc"},
	{"Trí tuệ cảm xúc", "tri-tue-cam-xuc"},
	{"EQ", "eq"},
	{"Kỹ năng giao tiếp", "ky-nang-giao-tiep"},
	{"Làm việc nhóm", "lam-viec-nhom"},
	{"Hợp tác", "hop-tac"},
	{"Giải quyết vấn đề", "giai-quyet-van-de"},
	{"Tư duy phản biện", "tu-duy-phan-bien"},
	{"Sáng tạo", "sang-tao"},
	{"Trí tưởng tượng", "tri-tuong-tuong"},
	{"Sự tập trung", "su-tap-trung"},
	{"Trí nhớ", "tri-nho"},
	{"Tự lập", "tu-lap"},
	{"Quản lý cảm xúc", "quan-ly-cam-xuc"},
	{"Tự tin", "tu-tin"},
	{"Phát triển trí não", "phat-trien-tri-nao"},
	{"Tư duy không gian", "tu-duy-khong-gian"},
	{"Trò chơi trí tuệ", "tro-choi-tri-tue"},
	{"Ghép hình", "ghep-hinh"},
	{"Xếp hình", "xep-hinh"},
	{"Câu đố", "cau-do"},
	{"Cờ vua cho trẻ", "co-vua-cho-tre"},
	{"Trò chơi giáo dục", "tro-choi-giao-duc"},
	{"Trò chơi học tập", "tro-choi-hoc-tap"},
	{"Trò chơi vận động", "tro-choi-van-dong"},
	{"Trò chơi trí nhớ", "tro-choi-tri-nho"},
	{"Lật thẻ tìm cặp", "lat-the-tim-cap"},
	{"Trò chơi ô chữ", "tro-choi-o-chu"},
	{"Gamification", "gamification"},
	{"Học mà chơi", "hoc-ma-choi"},
	{"Phương pháp dạy học", "phuong-phap-day-hoc"},
	{"Lớp học đảo ngược", "lop-hoc-dao-nguoc"},
	{"Dạy học tích cực", "day-hoc-tich-cuc"},
	{"Dạy học theo dự án", "day-hoc-theo-du-an"},
	{"Quản lý lớp học", "quan-ly-lop-hoc"},
	{"Giáo án", "giao-an"},
	{"Kế hoạch bài dạy", "ke-hoach-bai-day"},
	{"Soạn giáo án", "soan-giao-an"},
	{"Đánh giá học sinh", "danh-gia-hoc-sinh"},
	{"Tạo động lực học tập", "tao-dong-luc-hoc-tap"},
	{"Học sinh hứng thú", "hoc-sinh-hung-thu"},
	{"Phân hóa dạy học", "phan-hoa-day-hoc"},
	{"Công nghệ giáo dục", "cong-nghe-giao-duc"},
	{"AI trong giáo dục", "ai-trong-giao-duc"},
	{"Trí tuệ nhân tạo", "tri-tue-nhan-tao"},
	{"ChatGPT cho giáo viên", "chatgpt-cho-giao-vien"},
	{"Lập trình cho trẻ", "lap-trinh-cho-tre"},
	{"Scratch", "scratch"},
	{"Robot giáo dục", "robot-giao-duc"},
	{"Ứng dụng học tập", "ung-dung-hoc-tap"},
	{"Học trực tuyến", "hoc-truc-tuyen"},
	{"Lớp học số", "lop-hoc-so"},
	{"Học liệu số", "hoc-lieu-so"},
	{"Cá nhân hóa học tập", "ca-nhan-hoa-hoc-tap"},
	{"Học liệu", "hoc-lieu"},
	{"Flashcard", "flashcard"},
	{"Worksheet", "worksheet"},
	{"Phiếu bài tập", "phieu-bai-tap"},
	{"Tài liệu in", "tai-lieu-in"},
	{"Tiểu học", "tieu-hoc"},
	{"Lớp 1", "lop-1"},
	{"Chuẩn bị vào lớp 1", "chuan-bi-vao-lop-1"},
	{"Tiếng Anh trẻ em", "tieng-anh-tre-em"},
	{"Nuôi dạy con", "nuoi-day-con"},
}

// CMSOptions controls CMS content seeding (tags, categories, articles).
type CMSOptions struct {
	Tags       int
	Categories int
	Articles   int
	Reset      bool // delete prior seed-* CMS rows before seeding
}

// CMSSummary reports what CMS seeding did.
type CMSSummary struct {
	Tags        int
	Categories  int
	Articles    int
	ArticleTags int
	Skipped     int // rows already present (idempotent re-run)
	Deleted     int // rows removed by Reset
}

// CMS seeds tags, categories (a flat top-level set) and articles (every workflow
// status, each linked to a few tags + a category). Articles are authored by the bootstrap
// super_admin (which survives a user Reset → never trips the author_id FK), so
// CMS and user seeding stay independent. Idempotent; all in one transaction.
func CMS(ctx context.Context, pool *pgxpool.Pool, opts CMSOptions) (CMSSummary, error) {
	var sum CMSSummary
	if opts.Tags < 0 || opts.Categories < 0 || opts.Articles < 0 {
		return sum, fmt.Errorf("cms seed counts must be >= 0")
	}

	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		authorID, err := superAdminID(ctx, tx)
		if err != nil {
			return err
		}
		if opts.Reset {
			if err := resetCMS(ctx, tx, &sum); err != nil {
				return err
			}
		}
		if err := seedTags(ctx, tx, opts.Tags, &sum); err != nil {
			return err
		}
		catIDs, err := seedCategories(ctx, tx, opts.Categories, &sum)
		if err != nil {
			return err
		}
		tagIDs, err := loadSeedIDs(ctx, tx, "cms_tags", seedTagSlugPrefix)
		if err != nil {
			return err
		}
		return seedArticles(ctx, tx, opts.Articles, authorID, catIDs, tagIDs, &sum)
	})
	return sum, err
}

// superAdminID returns the bootstrap super_admin's id (the seed article author).
func superAdminID(ctx context.Context, tx pgx.Tx) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, SuperAdminEmail).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("super_admin %q not found — run user seeding first: %w", SuperAdminEmail, err)
	}
	return id, nil
}

// resetCMS deletes the seeded CMS rows. Articles go first (their tags cascade);
// category parent links are cleared before the delete so the parent_id RESTRICT
// FK does not block removing a seeded parent that still has a seeded child.
func resetCMS(ctx context.Context, tx pgx.Tx, sum *CMSSummary) error {
	a, err := tx.Exec(ctx, `DELETE FROM cms_articles WHERE slug LIKE $1`, seedArticleSlugPrefix+"%")
	if err != nil {
		return fmt.Errorf("reset articles: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE cms_categories SET parent_id = NULL WHERE slug LIKE $1`, seedCategorySlugPrefix+"%"); err != nil {
		return fmt.Errorf("reset category parents: %w", err)
	}
	c, err := tx.Exec(ctx, `DELETE FROM cms_categories WHERE slug LIKE $1`, seedCategorySlugPrefix+"%")
	if err != nil {
		return fmt.Errorf("reset categories: %w", err)
	}
	tg, err := tx.Exec(ctx, `DELETE FROM cms_tags WHERE slug LIKE $1`, seedTagSlugPrefix+"%")
	if err != nil {
		return fmt.Errorf("reset tags: %w", err)
	}
	sum.Deleted = int(a.RowsAffected() + c.RowsAffected() + tg.RowsAffected())
	return nil
}

// seedTags inserts the first n curated tags (capped at the catalogue size).
func seedTags(ctx context.Context, tx pgx.Tx, n int, sum *CMSSummary) error {
	if n > len(cmsTags) {
		n = len(cmsTags)
	}
	for i := 0; i < n; i++ {
		name := cmsTags[i].Name
		slug := seedTagSlugPrefix + cmsTags[i].Slug
		tag, err := tx.Exec(ctx,
			`INSERT INTO cms_tags (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`, name, slug)
		if err != nil {
			return fmt.Errorf("insert tag %s: %w", slug, err)
		}
		if tag.RowsAffected() == 1 {
			sum.Tags++
		} else {
			sum.Skipped++
		}
	}
	return nil
}

// seedCategories creates the first n curated categories (capped at the catalogue
// size) as a flat top-level set. Returns the seeded ids ordered by slug.
func seedCategories(ctx context.Context, tx pgx.Tx, n int, sum *CMSSummary) ([]uuid.UUID, error) {
	if n > len(cmsCategories) {
		n = len(cmsCategories)
	}
	for i := 0; i < n; i++ {
		c := cmsCategories[i]
		slug := seedCategorySlugPrefix + c.Slug
		tag, err := tx.Exec(ctx,
			`INSERT INTO cms_categories (name, slug, description, sort_order)
			 VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING`, c.Name, slug, c.Desc, i+1)
		if err != nil {
			return nil, fmt.Errorf("insert category %s: %w", slug, err)
		}
		if tag.RowsAffected() == 1 {
			sum.Categories++
		} else {
			sum.Skipped++
		}
	}
	return loadSeedIDs(ctx, tx, "cms_categories", seedCategorySlugPrefix)
}

// seedArticles creates n articles cycling through every workflow status, each tied
// to a category (some left uncategorized) and a few tags.
func seedArticles(ctx context.Context, tx pgx.Tx, n int, authorID uuid.UUID, catIDs, tagIDs []uuid.UUID, sum *CMSSummary) error {
	now := time.Now()
	for i := 1; i <= n; i++ {
		status := articleStatuses[(i-1)%len(articleStatuses)]
		title := fmt.Sprintf("Seed Article %03d", i)
		slug := fmt.Sprintf("%s%03d", seedArticleSlugPrefix, i)
		excerpt := fmt.Sprintf("A seeded %s article (%03d) for dev and demo listing.", status, i)
		body := fmt.Sprintf("<h2>%s</h2><p>This is seeded body content for article %03d. Status: %s.</p>", title, i, status)

		var categoryID *uuid.UUID
		if len(catIDs) > 0 && i%7 != 0 { // every 7th left uncategorized for variety
			c := catIDs[(i-1)%len(catIDs)]
			categoryID = &c
		}
		publishedAt := publishedAtFor(status, now, i)

		var articleID uuid.UUID
		err := tx.QueryRow(ctx,
			`INSERT INTO cms_articles
				(title, slug, excerpt, body_html, category_id, author_id, status, author_role,
				 seo_title, seo_description, published_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', $8, $9, $10)
			 ON CONFLICT (slug) DO NOTHING
			 RETURNING id`,
			title, slug, excerpt, body, categoryID, authorID, status, title, excerpt, publishedAt).Scan(&articleID)
		if errors.Is(err, pgx.ErrNoRows) {
			sum.Skipped++
			continue
		}
		if err != nil {
			return fmt.Errorf("insert article %s: %w", slug, err)
		}
		sum.Articles++

		linked, err := linkArticleTags(ctx, tx, articleID, i, tagIDs)
		if err != nil {
			return err
		}
		sum.ArticleTags += linked
	}
	return nil
}

// publishedAtFor sets published_at only for the states that carry one: published
// is dated in the recent past, scheduled in the near future; others have none.
func publishedAtFor(status string, now time.Time, i int) *time.Time {
	switch status {
	case "published":
		t := now.Add(-time.Duration(i) * 24 * time.Hour)
		return &t
	case "scheduled":
		t := now.Add(time.Duration(i) * 24 * time.Hour)
		return &t
	default:
		return nil
	}
}

// linkArticleTags attaches 3 deterministically-chosen distinct tags to the article.
func linkArticleTags(ctx context.Context, tx pgx.Tx, articleID uuid.UUID, i int, tagIDs []uuid.UUID) (int, error) {
	if len(tagIDs) == 0 {
		return 0, nil
	}
	linked := 0
	seen := map[uuid.UUID]bool{}
	for k := 0; k < 3; k++ {
		tagID := tagIDs[(i*3+k)%len(tagIDs)]
		if seen[tagID] {
			continue
		}
		seen[tagID] = true
		tag, err := tx.Exec(ctx,
			`INSERT INTO cms_article_tags (article_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			articleID, tagID)
		if err != nil {
			return 0, fmt.Errorf("link article tag: %w", err)
		}
		linked += int(tag.RowsAffected())
	}
	return linked, nil
}

// loadSeedIDs returns the ids of seeded rows in the given table (slug-prefixed),
// ordered by slug so assignment is stable across runs.
func loadSeedIDs(ctx context.Context, tx pgx.Tx, table, slugPrefix string) ([]uuid.UUID, error) {
	rows, err := tx.Query(ctx,
		`SELECT id FROM `+table+` WHERE slug LIKE $1 ORDER BY slug`, slugPrefix+"%")
	if err != nil {
		return nil, fmt.Errorf("load %s ids: %w", table, err)
	}
	defer rows.Close()
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan %s id: %w", table, err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
