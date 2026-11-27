-- AlterTable
ALTER TABLE `pinterest_accounts` ADD COLUMN `feedError` TEXT NULL;

-- AlterTable
ALTER TABLE `pinterest_boards` ADD COLUMN `feedCheckedAt` DATETIME(3) NULL,
    ADD COLUMN `pinsStamp` VARCHAR(80) NULL,
    ADD COLUMN `zaloFeed` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `zalo_groups` ADD COLUMN `pinFeed` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `pinterest_pin_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `pinId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `messageId` VARCHAR(100) NULL,
    `error` TEXT NULL,
    `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `pinterest_pin_deliveries_status_queuedAt_idx`(`status`, `queuedAt`),
    INDEX `pinterest_pin_deliveries_updatedAt_idx`(`updatedAt`),
    INDEX `pinterest_pin_deliveries_groupId_idx`(`groupId`),
    UNIQUE INDEX `pinterest_pin_deliveries_pinId_groupId_key`(`pinId`, `groupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pinterest_pin_deliveries` ADD CONSTRAINT `pinterest_pin_deliveries_pinId_fkey` FOREIGN KEY (`pinId`) REFERENCES `pinterest_pins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pinterest_pin_deliveries` ADD CONSTRAINT `pinterest_pin_deliveries_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `zalo_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
