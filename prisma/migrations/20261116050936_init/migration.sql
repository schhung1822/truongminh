-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'SALE') NOT NULL DEFAULT 'SALE',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_sessions_tokenHash_key`(`tokenHash`),
    INDEX `auth_sessions_userId_idx`(`userId`),
    INDEX `auth_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `materials` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `groupName` VARCHAR(191) NOT NULL,
    `printTech` VARCHAR(191) NOT NULL,
    `descHuman` TEXT NOT NULL,
    `descAi` TEXT NOT NULL,
    `layer1Path` VARCHAR(500) NULL,
    `layer2Path` VARCHAR(500) NULL,
    `productPhotoPath` VARCHAR(500) NULL,
    `referencePath` VARCHAR(500) NULL,
    `referenceUpdatedAt` DATETIME(3) NULL,
    `kieRefUrl` VARCHAR(1000) NULL,
    `kieRefExpiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `materials_code_key`(`code`),
    INDEX `materials_groupName_isActive_idx`(`groupName`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sheets` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `groupName` VARCHAR(191) NOT NULL DEFAULT '',
    `cols` INTEGER NOT NULL DEFAULT 2,
    `rows` INTEGER NOT NULL DEFAULT 5,
    `aspectRatio` VARCHAR(191) NOT NULL DEFAULT '2:3',
    `resolution` VARCHAR(191) NOT NULL DEFAULT '2K',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sheet_materials` (
    `id` VARCHAR(191) NOT NULL,
    `sheetId` VARCHAR(191) NOT NULL,
    `materialId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `sheet_materials_materialId_idx`(`materialId`),
    UNIQUE INDEX `sheet_materials_sheetId_position_key`(`sheetId`, `position`),
    UNIQUE INDEX `sheet_materials_sheetId_materialId_key`(`sheetId`, `materialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_templates` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('CATALOG', 'DESIGN') NOT NULL,
    `version` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prompt_templates_kind_isActive_idx`(`kind`, `isActive`),
    UNIQUE INDEX `prompt_templates_kind_version_key`(`kind`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `design_styles` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customers_name_idx`(`name`),
    INDEX `customers_phone_idx`(`phone`),
    INDEX `customers_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brands` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `brands_customerId_idx`(`customerId`),
    INDEX `brands_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logos` (
    `id` VARCHAR(191) NOT NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `originalPath` VARCHAR(500) NOT NULL,
    `normalizedPath` VARCHAR(500) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `note` TEXT NULL,
    `kieUrl` VARCHAR(1000) NULL,
    `kieExpiresAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `logos_brandId_idx`(`brandId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consult_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('CATALOG', 'DESIGN') NOT NULL,
    `logoId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `productType` VARCHAR(191) NULL,
    `variantsPerMaterial` INTEGER NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `consult_sessions_logoId_idx`(`logoId`),
    INDEX `consult_sessions_parentId_idx`(`parentId`),
    INDEX `consult_sessions_createdById_createdAt_idx`(`createdById`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_selected_materials` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `materialId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `session_selected_materials_sessionId_materialId_key`(`sessionId`, `materialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generated_images` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `kind` ENUM('SHEET', 'DESIGN') NOT NULL,
    `sheetId` VARCHAR(191) NULL,
    `materialId` VARCHAR(191) NULL,
    `designStyleId` VARCHAR(191) NULL,
    `variantIndex` INTEGER NOT NULL DEFAULT 0,
    `layoutSnapshot` JSON NOT NULL,
    `promptUsed` TEXT NOT NULL,
    `promptTemplateId` VARCHAR(191) NULL,
    `promptVersion` INTEGER NULL,
    `model` VARCHAR(191) NOT NULL,
    `resolution` VARCHAR(191) NOT NULL,
    `aspectRatio` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `lastPolledAt` DATETIME(3) NULL,
    `originalPath` VARCHAR(500) NULL,
    `finalPath` VARCHAR(500) NULL,
    `errorMessage` TEXT NULL,
    `parentImageId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `generated_images_status_lastPolledAt_idx`(`status`, `lastPolledAt`),
    INDEX `generated_images_sessionId_idx`(`sessionId`),
    INDEX `generated_images_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usage_logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `imageId` VARCHAR(191) NULL,
    `kind` ENUM('SHEET', 'DESIGN') NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `usage_logs_userId_day_idx`(`userId`, `day`),
    INDEX `usage_logs_day_idx`(`day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sheet_materials` ADD CONSTRAINT `sheet_materials_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `sheets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sheet_materials` ADD CONSTRAINT `sheet_materials_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `brands` ADD CONSTRAINT `brands_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `brands` ADD CONSTRAINT `brands_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logos` ADD CONSTRAINT `logos_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logos` ADD CONSTRAINT `logos_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consult_sessions` ADD CONSTRAINT `consult_sessions_logoId_fkey` FOREIGN KEY (`logoId`) REFERENCES `logos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consult_sessions` ADD CONSTRAINT `consult_sessions_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `consult_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consult_sessions` ADD CONSTRAINT `consult_sessions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_selected_materials` ADD CONSTRAINT `session_selected_materials_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `consult_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_selected_materials` ADD CONSTRAINT `session_selected_materials_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_images` ADD CONSTRAINT `generated_images_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `consult_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_images` ADD CONSTRAINT `generated_images_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `sheets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_images` ADD CONSTRAINT `generated_images_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_images` ADD CONSTRAINT `generated_images_designStyleId_fkey` FOREIGN KEY (`designStyleId`) REFERENCES `design_styles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_images` ADD CONSTRAINT `generated_images_promptTemplateId_fkey` FOREIGN KEY (`promptTemplateId`) REFERENCES `prompt_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_images` ADD CONSTRAINT `generated_images_parentImageId_fkey` FOREIGN KEY (`parentImageId`) REFERENCES `generated_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_images` ADD CONSTRAINT `generated_images_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usage_logs` ADD CONSTRAINT `usage_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usage_logs` ADD CONSTRAINT `usage_logs_imageId_fkey` FOREIGN KEY (`imageId`) REFERENCES `generated_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
