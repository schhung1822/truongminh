-- AlterTable
ALTER TABLE `zalo_contacts` ADD COLUMN `accountId` VARCHAR(191) NULL,
    ADD COLUMN `avatarUrl` VARCHAR(500) NULL,
    ADD COLUMN `threadId` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `zalo_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `uid` VARCHAR(40) NULL,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `credentials` TEXT NULL,
    `status` ENUM('CONNECTED', 'CONNECTING', 'DISCONNECTED', 'LOGGED_OUT') NOT NULL DEFAULT 'DISCONNECTED',
    `lastError` TEXT NULL,
    `lastConnectedAt` DATETIME(3) NULL,
    `autoConnect` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zalo_accounts_uid_key`(`uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `zalo_contacts_accountId_lastMessageAt_idx` ON `zalo_contacts`(`accountId`, `lastMessageAt`);

-- AddForeignKey
ALTER TABLE `zalo_contacts` ADD CONSTRAINT `zalo_contacts_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `zalo_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
