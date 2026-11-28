-- Người dùng bot Zalo (D133): quyền dùng bot và mã ghép nối cá nhân trên tài khoản web, đếm lần nhập sai mã trên hội thoại,
-- và bảng đếm số tin mỗi bot đã gửi theo tháng. Chỉ thêm cột/bảng, không đổi dữ liệu cũ: mọi tài khoản đang có giữ quyền Đầy đủ.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `zaloBotAccess` ENUM('NONE', 'LOOKUP', 'FULL') NOT NULL DEFAULT 'FULL',
    ADD COLUMN `zaloPairCode` VARCHAR(12) NULL,
    ADD COLUMN `zaloPairCodeAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `zalo_contacts` ADD COLUMN `pairFailAt` DATETIME(3) NULL,
    ADD COLUMN `pairFailCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pairedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `zalo_bot_usage` (
    `id` VARCHAR(191) NOT NULL,
    `botKey` VARCHAR(40) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `quotaHitAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zalo_bot_usage_botKey_month_key`(`botKey`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_zaloPairCode_key` ON `users`(`zaloPairCode`);
