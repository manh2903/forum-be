/**
 * Cron Job: Tự động cập nhật bài viết nổi bật (isFeatured)
 *
 * Chạy mỗi giờ — tính điểm nổi bật cho tất cả bài viết published
 * trong 30 ngày gần đây, chọn top N bài có điểm cao nhất làm featured.
 *
 * ============================================================
 * CÔNG THỨC (Hacker News-style, ưu tiên tương tác + độ tươi):
 * ============================================================
 *
 *   score = (L*2 + C*3 + B*1.5 + V*0.01) / (age + 2)^1.5
 *
 * Trong đó:
 *   L   = likeCount       (trọng số ×2  — like là tương tác chủ động)
 *   C   = commentCount    (trọng số ×3  — comment thể hiện sự thảo luận)
 *   B   = bookmarkCount   (trọng số ×1.5 — bookmark = giá trị lâu dài)
 *   V   = viewCount       (trọng số ×0.01 — view thụ động, ít trọng số hơn)
 *   age = số giờ kể từ khi bài được publish
 *
 * Mẫu số (age + 2)^1.5 làm điểm giảm dần theo thời gian —
 * bài mới có cơ hội lên nổi bật nhanh hơn, bài cũ dần nhường chỗ.
 */

const cron = require("node-cron");
const { Op } = require("sequelize");
const { Post } = require("../models");
const logger = require("./logger");

// Số bài được đánh dấu isFeatured = true
const FEATURED_COUNT = 10;

// Chỉ tính bài published trong 30 ngày gần đây
const DAYS_WINDOW = 30;

/**
 * Tính điểm nổi bật của một bài viết
 */
function calcScore(post) {
  const ageHours =
    (Date.now() - new Date(post.publishedAt).getTime()) / (1000 * 60 * 60);

  const interactions =
    post.likeCount * 2 +
    post.commentCount * 3 +
    post.bookmarkCount * 1.5 +
    post.viewCount * 0.01;

  const decay = Math.pow(Math.max(ageHours, 0) + 2, 1.5);

  return interactions / decay;
}

/**
 * Job chính: tính điểm, reset featured cũ, set featured mới
 */
async function updateFeaturedPosts() {
  const startTime = Date.now();
  logger.info("[FeaturedJob] Bắt đầu cập nhật bài viết nổi bật...");

  try {
    const since = new Date();
    since.setDate(since.getDate() - DAYS_WINDOW);

    // Lấy tất cả bài published trong DAYS_WINDOW ngày
    const posts = await Post.findAll({
      where: {
        status: "published",
        publishedAt: { [Op.gte]: since },
        isPinned: false, // Bài ghim không tham gia xếp hạng
      },
      attributes: [
        "id",
        "title",
        "likeCount",
        "commentCount",
        "bookmarkCount",
        "viewCount",
        "publishedAt",
      ],
    });

    if (posts.length === 0) {
      logger.info("[FeaturedJob] Không có bài viết nào để xử lý.");
      return;
    }

    // Tính điểm và sort giảm dần
    const scored = posts
      .map((p) => ({ id: p.id, title: p.title, score: calcScore(p) }))
      .sort((a, b) => b.score - a.score);

    const featuredIds = scored
      .slice(0, FEATURED_COUNT)
      .map((p) => p.id);

    const notFeaturedIds = scored
      .slice(FEATURED_COUNT)
      .map((p) => p.id);

    // Reset featured cũ ngoài cửa sổ hoặc không đủ điểm
    await Post.update(
      { isFeatured: false },
      { where: { isFeatured: true } }
    );

    // Set featured mới
    if (featuredIds.length > 0) {
      await Post.update(
        { isFeatured: true },
        { where: { id: { [Op.in]: featuredIds } } }
      );
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      `[FeaturedJob] Xong! ${featuredIds.length} bài nổi bật được cập nhật` +
      ` (${posts.length} bài được tính điểm, ${elapsed}ms)`,
      {
        top5: scored.slice(0, 5).map((p) => ({
          id: p.id,
          score: p.score.toFixed(3),
          title: p.title?.substring(0, 50),
        })),
      }
    );
  } catch (err) {
    logger.error("[FeaturedJob] Lỗi khi cập nhật bài nổi bật:", err);
  }
}

/**
 * Khởi tạo cron job
 * Schedule: chạy vào đầu mỗi giờ — "0 * * * *"
 * Có thể đổi sang mỗi 30 phút: "0,30 * * * *"
 */
function startFeaturedJob() {
  // Chạy ngay lần đầu khi server khởi động
  updateFeaturedPosts();

  // Lặp lại mỗi giờ
  cron.schedule("0 * * * *", updateFeaturedPosts, {
    timezone: "Asia/Ho_Chi_Minh",
  });

  logger.info("[FeaturedJob] Đã đăng ký cron job — chạy mỗi giờ lúc :00");
}

module.exports = { startFeaturedJob, updateFeaturedPosts, calcScore };
