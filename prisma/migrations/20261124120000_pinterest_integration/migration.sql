-- CreateTable
CREATE TABLE `pinterest_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `pinterestUserId` VARCHAR(40) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `profileImageUrl` VARCHAR(500) NULL,
    `accessTokenEnc` TEXT NOT NULL,
    `refreshTokenEnc` TEXT NOT NULL,
    `accessTokenExpiresAt` DATETIME(3) NOT NULL,
    `refreshTokenExpiresAt` DATETIME(3) NOT NULL,
    `scope` VARCHAR(300) NOT NULL,
    `connectedById` VARCHAR(191) NOT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `lastSyncError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pinterest_accounts_pinterestUserId_key`(`pinterestUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pinterest_boards` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `pinterestBoardId` VARCHAR(40) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `privacy` VARCHAR(20) NOT NULL,
    `pinCount` INTEGER NOT NULL DEFAULT 0,
    `coverImageUrl` VARCHAR(500) NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pinterest_boards_pinterestBoardId_key`(`pinterestBoardId`),
    INDEX `pinterest_boards_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pinterest_pins` (
    `id` VARCHAR(191) NOT NULL,
    `boardId` VARCHAR(191) NOT NULL,
    `pinterestPinId` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NULL,
    `description` TEXT NULL,
    `altText` VARCHAR(500) NULL,
    `sourceImageUrl` VARCHAR(500) NOT NULL,
    `localPath` VARCHAR(500) NULL,
    `kieRefUrl` VARCHAR(500) NULL,
    `kieRefExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pinterest_pins_pinterestPinId_key`(`pinterestPinId`),
    INDEX `pinterest_pins_boardId_idx`(`boardId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pinterest_accounts` ADD CONSTRAINT `pinterest_accounts_connectedById_fkey` FOREIGN KEY (`connectedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pinterest_boards` ADD CONSTRAINT `pinterest_boards_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `pinterest_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pinterest_pins` ADD CONSTRAINT `pinterest_pins_boardId_fkey` FOREIGN KEY (`boardId`) REFERENCES `pinterest_boards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
