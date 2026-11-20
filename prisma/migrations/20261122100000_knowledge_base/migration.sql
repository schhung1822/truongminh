-- CreateTable
CREATE TABLE `business_profile` (
    `id` VARCHAR(191) NOT NULL,
    `tradeName` VARCHAR(200) NULL,
    `intro` TEXT NULL,
    `address` TEXT NULL,
    `hours` TEXT NULL,
    `hotline` VARCHAR(100) NULL,
    `zalo` VARCHAR(200) NULL,
    `fanpage` VARCHAR(300) NULL,
    `website` VARCHAR(300) NULL,
    `deliveryArea` TEXT NULL,
    `payment` TEXT NULL,
    `visibility` JSON NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_articles` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `body` TEXT NOT NULL,
    `visibility` ENUM('PUBLIC', 'INTERNAL', 'ADMIN_ONLY') NOT NULL DEFAULT 'INTERNAL',
    `tags` JSON NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'RETIRED') NOT NULL DEFAULT 'DRAFT',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `alwaysInclude` BOOLEAN NOT NULL DEFAULT false,
    `effectiveFrom` DATETIME(3) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `knowledge_articles_status_visibility_idx`(`status`, `visibility`),
    INDEX `knowledge_articles_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_article_roles` (
    `articleId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(30) NOT NULL,

    INDEX `knowledge_article_roles_role_idx`(`role`),
    PRIMARY KEY (`articleId`, `role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pricing_params` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `value` DECIMAL(18, 4) NULL,
    `unit` VARCHAR(40) NULL,
    `note` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pricing_params_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_uses` (
    `id` VARCHAR(191) NOT NULL,
    `role` VARCHAR(30) NOT NULL,
    `question` VARCHAR(500) NOT NULL,
    `usedIds` JSON NOT NULL,
    `droppedIds` JSON NOT NULL,
    `unknown` BOOLEAN NOT NULL DEFAULT false,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `knowledge_uses_createdAt_idx`(`createdAt`),
    INDEX `knowledge_uses_role_createdAt_idx`(`role`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_gaps` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `role` VARCHAR(30) NOT NULL,
    `question` VARCHAR(500) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `resolvedByArticleId` VARCHAR(191) NULL,
    `firstAskedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAskedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `knowledge_gaps_key_key`(`key`),
    INDEX `knowledge_gaps_status_lastAskedAt_idx`(`status`, `lastAskedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `knowledge_article_roles` ADD CONSTRAINT `knowledge_article_roles_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `knowledge_articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

