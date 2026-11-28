-- Lead Facebook v1.1: luồng tìm nhà sản xuất và mời dùng vật liệu (thiet-ke-module-lead-facebook-v1.1-luong-nha-san-xuat.md, D131).
-- Thêm hàng chờ trả lời, mẫu câu, fanpage; chỉ THÊM bảng/cột, không đổi hay xóa dữ liệu cũ.

-- AlterTable
ALTER TABLE `ext_logs` MODIFY `type` ENUM('SCAN_OK', 'SCAN_FAIL', 'SELECTOR_BROKEN', 'CHECKPOINT', 'REPLY_SENT', 'POST_DONE', 'REPLY_FAIL') NOT NULL;

-- AlterTable
ALTER TABLE `fb_groups` ADD COLUMN `pageAllowed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pageJoined` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `fb_leads` ADD COLUMN `calledAt` DATETIME(3) NULL,
    ADD COLUMN `capability` TEXT NULL,
    ADD COLUMN `lastOfferedAt` DATETIME(3) NULL,
    ADD COLUMN `sampleSentAt` DATETIME(3) NULL,
    ADD COLUMN `supplierType` ENUM('MANUFACTURER', 'BROKER', 'UNKNOWN') NULL,
    ADD COLUMN `zaloMessagedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `fb_posts` ADD COLUMN `productRef` VARCHAR(200) NULL,
    ADD COLUMN `suggestedMaterialIds` JSON NULL;

-- CreateTable
CREATE TABLE `fb_pages` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `url` VARCHAR(300) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'PAUSED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fb_pages_url_key`(`url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fb_reply_queue` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `intent` ENUM('ANSWER_INTEREST', 'SUPPLIER_OFFER') NOT NULL,
    `replyAs` ENUM('ACCOUNT', 'PAGE') NOT NULL DEFAULT 'ACCOUNT',
    `pageId` VARCHAR(191) NULL,
    `templateId` VARCHAR(191) NULL,
    `draftText` TEXT NOT NULL,
    `finalText` TEXT NULL,
    `aiGenerated` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'APPROVED', 'FILLED', 'SENT', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `filledAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `failReason` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fb_reply_queue_commentId_key`(`commentId`),
    INDEX `fb_reply_queue_accountId_status_idx`(`accountId`, `status`),
    INDEX `fb_reply_queue_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `fb_reply_queue_leadId_intent_createdAt_idx`(`leadId`, `intent`, `createdAt`),
    INDEX `fb_reply_queue_pageId_idx`(`pageId`),
    INDEX `fb_reply_queue_templateId_idx`(`templateId`),
    INDEX `fb_reply_queue_approvedById_idx`(`approvedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fb_reply_templates` (
    `id` VARCHAR(191) NOT NULL,
    `purpose` ENUM('FIND_CUSTOMER', 'FIND_SUPPLIER') NOT NULL,
    `category` ENUM('INTEREST', 'QUESTION', 'SUPPLIER_OFFER') NOT NULL,
    `text` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fb_reply_templates_purpose_category_active_idx`(`purpose`, `category`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `fb_leads_leadType_createdAt_idx` ON `fb_leads`(`leadType`, `createdAt`);

-- AddForeignKey
ALTER TABLE `fb_reply_queue` ADD CONSTRAINT `fb_reply_queue_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `fb_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_reply_queue` ADD CONSTRAINT `fb_reply_queue_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `fb_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_reply_queue` ADD CONSTRAINT `fb_reply_queue_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `fb_leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_reply_queue` ADD CONSTRAINT `fb_reply_queue_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `fb_pages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_reply_queue` ADD CONSTRAINT `fb_reply_queue_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `fb_reply_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_reply_queue` ADD CONSTRAINT `fb_reply_queue_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
