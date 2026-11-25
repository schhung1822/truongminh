-- AlterTable
ALTER TABLE `pinterest_boards` ADD COLUMN `techniqueHint` VARCHAR(60) NULL;

-- CreateTable
CREATE TABLE `pinterest_pin_style_tags` (
    `pinId` VARCHAR(191) NOT NULL,
    `value` VARCHAR(60) NOT NULL,

    INDEX `pinterest_pin_style_tags_value_idx`(`value`),
    PRIMARY KEY (`pinId`, `value`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logo_favorite_pins` (
    `id` VARCHAR(191) NOT NULL,
    `logoId` VARCHAR(191) NOT NULL,
    `pinId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `logo_favorite_pins_pinId_idx`(`pinId`),
    UNIQUE INDEX `logo_favorite_pins_logoId_pinId_key`(`logoId`, `pinId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `generated_image_style_ref_pins` (
    `id` VARCHAR(191) NOT NULL,
    `imageId` VARCHAR(191) NOT NULL,
    `pinId` VARCHAR(191) NOT NULL,

    INDEX `generated_image_style_ref_pins_pinId_idx`(`pinId`),
    UNIQUE INDEX `generated_image_style_ref_pins_imageId_pinId_key`(`imageId`, `pinId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pinterest_pin_style_tags` ADD CONSTRAINT `pinterest_pin_style_tags_pinId_fkey` FOREIGN KEY (`pinId`) REFERENCES `pinterest_pins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logo_favorite_pins` ADD CONSTRAINT `logo_favorite_pins_logoId_fkey` FOREIGN KEY (`logoId`) REFERENCES `logos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logo_favorite_pins` ADD CONSTRAINT `logo_favorite_pins_pinId_fkey` FOREIGN KEY (`pinId`) REFERENCES `pinterest_pins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logo_favorite_pins` ADD CONSTRAINT `logo_favorite_pins_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_image_style_ref_pins` ADD CONSTRAINT `generated_image_style_ref_pins_imageId_fkey` FOREIGN KEY (`imageId`) REFERENCES `generated_images`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generated_image_style_ref_pins` ADD CONSTRAINT `generated_image_style_ref_pins_pinId_fkey` FOREIGN KEY (`pinId`) REFERENCES `pinterest_pins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
