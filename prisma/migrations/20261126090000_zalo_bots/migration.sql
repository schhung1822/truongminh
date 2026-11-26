-- AlterTable
ALTER TABLE `zalo_contacts` ADD COLUMN `botId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `zalo_groups` ADD COLUMN `botId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `zalo_bots` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `tokenEnc` TEXT NOT NULL,
    `tokenHint` VARCHAR(12) NOT NULL,
    `webhookSecretEnc` TEXT NOT NULL,
    `zaloId` VARCHAR(60) NULL,
    `accountName` VARCHAR(150) NULL,
    `canJoinGroups` BOOLEAN NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastCheckedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `webhookSetAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zalo_bots_zaloId_key`(`zaloId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `zalo_contacts_botId_idx` ON `zalo_contacts`(`botId`);

-- CreateIndex
CREATE INDEX `zalo_groups_botId_idx` ON `zalo_groups`(`botId`);

-- AddForeignKey
ALTER TABLE `zalo_groups` ADD CONSTRAINT `zalo_groups_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `zalo_bots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zalo_contacts` ADD CONSTRAINT `zalo_contacts_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `zalo_bots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
