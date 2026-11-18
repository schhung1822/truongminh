-- CreateTable
CREATE TABLE `zalo_groups` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `autoSend` BOOLEAN NOT NULL DEFAULT false,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zalo_groups_chatId_key`(`chatId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zalo_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `imageId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `status` ENUM('SENT', 'FAILED') NOT NULL,
    `messageId` VARCHAR(100) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `zalo_deliveries_groupId_createdAt_idx`(`groupId`, `createdAt`),
    UNIQUE INDEX `zalo_deliveries_imageId_groupId_key`(`imageId`, `groupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `zalo_deliveries` ADD CONSTRAINT `zalo_deliveries_imageId_fkey` FOREIGN KEY (`imageId`) REFERENCES `generated_images`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_deliveries` ADD CONSTRAINT `zalo_deliveries_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `zalo_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
