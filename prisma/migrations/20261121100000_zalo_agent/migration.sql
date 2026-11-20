-- AlterTable
ALTER TABLE `zalo_contacts` ADD COLUMN `userId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `zalo_bot_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(100) NOT NULL,
    `chatType` VARCHAR(20) NOT NULL DEFAULT 'GROUP',
    `kind` ENUM('CATALOG', 'DESIGN') NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `logoId` VARCHAR(191) NULL,
    `imageMessageId` VARCHAR(40) NULL,
    `status` ENUM('RUNNING', 'DELIVERING', 'DONE', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `summary` TEXT NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `zalo_bot_tasks_chatId_createdAt_idx`(`chatId`, `createdAt`),
    INDEX `zalo_bot_tasks_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `zalo_contacts` ADD CONSTRAINT `zalo_contacts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_bot_tasks` ADD CONSTRAINT `zalo_bot_tasks_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `consult_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_bot_tasks` ADD CONSTRAINT `zalo_bot_tasks_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
