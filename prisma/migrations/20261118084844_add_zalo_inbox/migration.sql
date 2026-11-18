-- CreateTable
CREATE TABLE `zalo_contacts` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(100) NOT NULL,
    `chatType` VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
    `displayName` VARCHAR(150) NOT NULL,
    `role` ENUM('CUSTOMER', 'STAFF', 'BLOCKED') NOT NULL DEFAULT 'CUSTOMER',
    `pairCode` VARCHAR(10) NULL,
    `pairRequestedAt` DATETIME(3) NULL,
    `botPaused` BOOLEAN NOT NULL DEFAULT false,
    `needsHuman` BOOLEAN NOT NULL DEFAULT false,
    `unreadCount` INTEGER NOT NULL DEFAULT 0,
    `lastMessageAt` DATETIME(3) NULL,
    `lastMessageText` VARCHAR(200) NULL,
    `contextResetAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zalo_contacts_chatId_key`(`chatId`),
    INDEX `zalo_contacts_lastMessageAt_idx`(`lastMessageAt`),
    INDEX `zalo_contacts_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zalo_messages` (
    `id` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `author` ENUM('CONTACT', 'BOT', 'HUMAN', 'SYSTEM') NOT NULL,
    `kind` ENUM('TEXT', 'IMAGE', 'FILE', 'VOICE', 'STICKER', 'OTHER') NOT NULL DEFAULT 'TEXT',
    `text` TEXT NULL,
    `mediaPath` VARCHAR(500) NULL,
    `zaloMessageId` VARCHAR(100) NULL,
    `authorUserId` VARCHAR(191) NULL,
    `failed` BOOLEAN NOT NULL DEFAULT false,
    `error` TEXT NULL,
    `promptTokens` INTEGER NULL,
    `completionTokens` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `zalo_messages_zaloMessageId_key`(`zaloMessageId`),
    INDEX `zalo_messages_contactId_createdAt_idx`(`contactId`, `createdAt`),
    INDEX `zalo_messages_author_createdAt_idx`(`author`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `zalo_messages` ADD CONSTRAINT `zalo_messages_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `zalo_contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
