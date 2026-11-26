-- AlterTable
ALTER TABLE `auth_sessions` ADD COLUMN `userAgent` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(150) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `target` VARCHAR(200) NULL,
    `detail` VARCHAR(500) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_createdAt_idx`(`createdAt`),
    INDEX `activity_logs_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `activity_logs_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
