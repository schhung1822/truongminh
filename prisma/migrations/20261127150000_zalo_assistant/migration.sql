-- AlterTable
ALTER TABLE `zalo_bot_tasks` ADD COLUMN `resend` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `zalo_assistant_threads` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(100) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `state` JSON NOT NULL,
    `pending` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `zalo_assistant_threads_updatedAt_idx`(`updatedAt`),
    UNIQUE INDEX `zalo_assistant_threads_chatId_staffId_key`(`chatId`, `staffId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
