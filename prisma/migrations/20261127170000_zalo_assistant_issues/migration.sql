-- CreateTable
CREATE TABLE `zalo_assistant_issues` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `chatId` VARCHAR(100) NOT NULL,
    `isGroup` BOOLEAN NOT NULL DEFAULT false,
    `chatName` VARCHAR(150) NULL,
    `staffName` VARCHAR(150) NULL,
    `command` TEXT NULL,
    `detail` TEXT NULL,
    `tool` VARCHAR(40) NULL,
    `model` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `zalo_assistant_issues_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
