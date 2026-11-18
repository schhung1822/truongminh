-- AlterTable
ALTER TABLE `zalo_groups` ADD COLUMN `careEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `insight` TEXT NULL,
    ADD COLUMN `postsPerDay` INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE `zalo_assets` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('TEXT', 'IMAGE', 'VIDEO') NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `path` VARCHAR(500) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `zalo_assets_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zalo_posts` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `kind` ENUM('TEXT', 'IMAGE', 'VIDEO') NOT NULL,
    `text` TEXT NOT NULL,
    `assetId` VARCHAR(191) NULL,
    `imageId` VARCHAR(191) NULL,
    `status` ENUM('PLANNED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PLANNED',
    `reason` VARCHAR(300) NULL,
    `error` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `aiGenerated` BOOLEAN NOT NULL DEFAULT true,
    `editedAt` DATETIME(3) NULL,
    `editedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `zalo_posts_groupId_scheduledAt_idx`(`groupId`, `scheduledAt`),
    INDEX `zalo_posts_status_scheduledAt_idx`(`status`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `zalo_posts` ADD CONSTRAINT `zalo_posts_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `zalo_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_posts` ADD CONSTRAINT `zalo_posts_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `zalo_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_posts` ADD CONSTRAINT `zalo_posts_imageId_fkey` FOREIGN KEY (`imageId`) REFERENCES `generated_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
