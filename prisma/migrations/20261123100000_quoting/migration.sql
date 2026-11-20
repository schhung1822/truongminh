-- AlterTable
ALTER TABLE `materials` ADD COLUMN `allowRotate` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `edgeMarginMm` DOUBLE NULL,
    ADD COLUMN `gapMm` DOUBLE NULL,
    ADD COLUMN `stockHeightMm` DOUBLE NULL,
    ADD COLUMN `stockPrice` DECIMAL(14, 2) NULL,
    ADD COLUMN `stockWidthMm` DOUBLE NULL;

-- CreateTable
CREATE TABLE `machine_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `technique` VARCHAR(60) NOT NULL,
    `cutSpeedMmPerSec` DOUBLE NULL,
    `engraveSpeedMm2PerSec` DOUBLE NULL,
    `setupMinutesPerJob` DOUBLE NULL,
    `sheetChangeMinutes` DOUBLE NULL,
    `machineCostPerHour` DECIMAL(14, 2) NULL,
    `laborSecondsPerPiece` DOUBLE NULL,
    `laborCostPerHour` DECIMAL(14, 2) NULL,
    `consumableCostPerM2` DECIMAL(14, 2) NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `machine_profiles_technique_key`(`technique`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quote_settings` (
    `id` VARCHAR(191) NOT NULL,
    `defaultGapMm` DOUBLE NULL,
    `lastSheetPolicy` ENUM('WHOLE_SHEET', 'PRO_RATA') NULL,
    `marginTiers` JSON NOT NULL,
    `displayQuantities` JSON NOT NULL,
    `roundTo` INTEGER NULL,
    `engraveLevels` JSON NOT NULL,
    `configVersion` INTEGER NOT NULL DEFAULT 0,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_change_logs` (
    `id` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(40) NOT NULL,
    `entityId` VARCHAR(60) NOT NULL,
    `entityLabel` VARCHAR(200) NOT NULL,
    `before` JSON NULL,
    `after` JSON NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `config_change_logs_entity_createdAt_idx`(`entity`, `createdAt`),
    INDEX `config_change_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logo_geometry` (
    `logoId` VARCHAR(191) NOT NULL,
    `geometry` JSON NOT NULL,
    `algoVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`logoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotes` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `logoId` VARCHAR(191) NOT NULL,
    `materialId` VARCHAR(191) NOT NULL,
    `logoWidthMm` DOUBLE NOT NULL,
    `logoHeightMm` DOUBLE NOT NULL,
    `engraveLevel` VARCHAR(20) NOT NULL,
    `perSheet` INTEGER NOT NULL,
    `efficiencyPct` DOUBLE NOT NULL,
    `nestingStrategy` VARCHAR(40) NOT NULL,
    `nestingLabel` VARCHAR(300) NOT NULL,
    `placements` JSON NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'WON') NOT NULL DEFAULT 'DRAFT',
    `configVersion` INTEGER NOT NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `wonAt` DATETIME(3) NULL,

    INDEX `quotes_logoId_idx`(`logoId`),
    INDEX `quotes_sessionId_idx`(`sessionId`),
    INDEX `quotes_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `quotes_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quote_lines` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `sheetsNeeded` INTEGER NOT NULL,
    `machineMinutes` DOUBLE NOT NULL,
    `unitPrice` INTEGER NOT NULL,
    `totalPrice` INTEGER NOT NULL,

    UNIQUE INDEX `quote_lines_quoteId_quantity_key`(`quoteId`, `quantity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quote_cost_snapshots` (
    `quoteId` VARCHAR(191) NOT NULL,
    `paramsSnapshot` JSON NOT NULL,
    `costDetail` JSON NOT NULL,

    PRIMARY KEY (`quoteId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machine_time_logs` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NULL,
    `description` VARCHAR(300) NOT NULL,
    `technique` VARCHAR(60) NOT NULL,
    `totalCutMm` DOUBLE NOT NULL,
    `engraveAreaMm2` DOUBLE NOT NULL,
    `sheets` INTEGER NOT NULL,
    `actualMinutes` DOUBLE NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `machine_time_logs_technique_createdAt_idx`(`technique`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `logo_geometry` ADD CONSTRAINT `logo_geometry_logoId_fkey` FOREIGN KEY (`logoId`) REFERENCES `logos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `consult_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_logoId_fkey` FOREIGN KEY (`logoId`) REFERENCES `logos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_lines` ADD CONSTRAINT `quote_lines_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_cost_snapshots` ADD CONSTRAINT `quote_cost_snapshots_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `quotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

