-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('ADMIN', 'SALE', 'MKT') NOT NULL DEFAULT 'SALE';

-- CreateTable
CREATE TABLE `fb_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(150) NOT NULL,
    `profileUrl` VARCHAR(300) NOT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'RESTRICTED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fb_accounts_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fb_groups` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `url` VARCHAR(300) NOT NULL,
    `topic` VARCHAR(150) NULL,
    `purpose` ENUM('FIND_CUSTOMER', 'FIND_SUPPLIER', 'BOTH') NOT NULL DEFAULT 'BOTH',
    `notes` TEXT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'BANNED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fb_groups_url_key`(`url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fb_posts` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NULL,
    `url` VARCHAR(400) NOT NULL,
    `contentSnapshot` TEXT NULL,
    `purpose` ENUM('FIND_CUSTOMER', 'FIND_SUPPLIER') NOT NULL,
    `postedAt` DATETIME(3) NULL,
    `trackingStatus` ENUM('TRACKING', 'PAUSED', 'DONE') NOT NULL DEFAULT 'TRACKING',
    `lastScannedAt` DATETIME(3) NULL,
    `lastCommentAt` DATETIME(3) NULL,
    `commentCount` INTEGER NOT NULL DEFAULT 0,
    `leadCount` INTEGER NOT NULL DEFAULT 0,
    `registeredById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fb_posts_url_key`(`url`),
    INDEX `fb_posts_accountId_trackingStatus_lastScannedAt_idx`(`accountId`, `trackingStatus`, `lastScannedAt`),
    INDEX `fb_posts_groupId_idx`(`groupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fb_comments` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `fbCommentId` VARCHAR(100) NOT NULL,
    `parentFbCommentId` VARCHAR(100) NULL,
    `authorName` VARCHAR(200) NOT NULL,
    `authorProfileUrl` VARCHAR(500) NULL,
    `isOwn` BOOLEAN NOT NULL DEFAULT false,
    `text` TEXT NOT NULL,
    `timeText` VARCHAR(60) NULL,
    `commentedAt` DATETIME(3) NULL,
    `category` ENUM('HAS_CONTACT', 'INTEREST', 'QUESTION', 'OTHER', 'SPAM') NOT NULL DEFAULT 'OTHER',
    `extractedPhone` VARCHAR(20) NULL,
    `extractedOther` JSON NULL,
    `handled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fb_comments_category_createdAt_idx`(`category`, `createdAt`),
    INDEX `fb_comments_extractedPhone_idx`(`extractedPhone`),
    UNIQUE INDEX `fb_comments_postId_fbCommentId_key`(`postId`, `fbCommentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fb_leads` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NULL,
    `name` VARCHAR(200) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `zalo` VARCHAR(20) NULL,
    `email` VARCHAR(200) NULL,
    `profileUrl` VARCHAR(500) NULL,
    `leadType` ENUM('CUSTOMER', 'SUPPLIER') NOT NULL,
    `status` ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'INVALID') NOT NULL DEFAULT 'NEW',
    `assignedToId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fb_leads_commentId_key`(`commentId`),
    UNIQUE INDEX `fb_leads_phone_key`(`phone`),
    INDEX `fb_leads_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `fb_leads_assignedToId_idx`(`assignedToId`),
    INDEX `fb_leads_postId_idx`(`postId`),
    INDEX `fb_leads_groupId_idx`(`groupId`),
    INDEX `fb_leads_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fb_lead_sources` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fb_lead_sources_commentId_key`(`commentId`),
    INDEX `fb_lead_sources_leadId_idx`(`leadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ext_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `tokenPrefix` VARCHAR(16) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ext_tokens_tokenHash_key`(`tokenHash`),
    INDEX `ext_tokens_userId_idx`(`userId`),
    INDEX `ext_tokens_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ext_logs` (
    `id` VARCHAR(191) NOT NULL,
    `tokenId` VARCHAR(191) NOT NULL,
    `type` ENUM('SCAN_OK', 'SCAN_FAIL', 'SELECTOR_BROKEN', 'CHECKPOINT', 'REPLY_SENT', 'POST_DONE') NOT NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ext_logs_tokenId_createdAt_idx`(`tokenId`, `createdAt`),
    INDEX `ext_logs_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fb_accounts` ADD CONSTRAINT `fb_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_posts` ADD CONSTRAINT `fb_posts_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `fb_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_posts` ADD CONSTRAINT `fb_posts_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `fb_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_posts` ADD CONSTRAINT `fb_posts_registeredById_fkey` FOREIGN KEY (`registeredById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_comments` ADD CONSTRAINT `fb_comments_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `fb_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_leads` ADD CONSTRAINT `fb_leads_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `fb_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_leads` ADD CONSTRAINT `fb_leads_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `fb_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_leads` ADD CONSTRAINT `fb_leads_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `fb_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_leads` ADD CONSTRAINT `fb_leads_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_leads` ADD CONSTRAINT `fb_leads_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_lead_sources` ADD CONSTRAINT `fb_lead_sources_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `fb_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fb_lead_sources` ADD CONSTRAINT `fb_lead_sources_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `fb_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ext_tokens` ADD CONSTRAINT `ext_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ext_tokens` ADD CONSTRAINT `ext_tokens_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `fb_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ext_logs` ADD CONSTRAINT `ext_logs_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `ext_tokens`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
