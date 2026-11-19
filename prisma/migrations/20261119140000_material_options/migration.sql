-- AlterTable
ALTER TABLE `materials` ADD COLUMN `aiVisualNote` TEXT NULL,
    ADD COLUMN `backColorConfidence` VARCHAR(20) NULL,
    ADD COLUMN `backColorFamily` VARCHAR(60) NULL,
    ADD COLUMN `backColorName` VARCHAR(100) NULL,
    ADD COLUMN `baseMaterial` VARCHAR(60) NULL,
    ADD COLUMN `classifyConfidence` VARCHAR(20) NULL,
    ADD COLUMN `colorCount` ENUM('ONE', 'TWO') NULL,
    ADD COLUMN `frontColorConfidence` VARCHAR(20) NULL,
    ADD COLUMN `frontColorFamily` VARCHAR(60) NULL,
    ADD COLUMN `frontColorName` VARCHAR(100) NULL,
    ADD COLUMN `needsReview` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `photoIssue` VARCHAR(200) NULL,
    ADD COLUMN `reviewNote` TEXT NULL,
    ADD COLUMN `seriesCode` VARCHAR(60) NULL,
    ADD COLUMN `surfaceFinish` VARCHAR(60) NULL,
    ADD COLUMN `surfacePattern` VARCHAR(60) NULL,
    ADD COLUMN `technique` VARCHAR(60) NULL;

-- CreateTable
CREATE TABLE `material_options` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('BASE_MATERIAL', 'TECHNIQUE', 'SURFACE_FINISH', 'SURFACE_PATTERN', 'COLOR_FAMILY', 'STYLE_TAG', 'SERIES') NOT NULL,
    `value` VARCHAR(60) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `material_options_type_isActive_sortOrder_idx`(`type`, `isActive`, `sortOrder`),
    UNIQUE INDEX `material_options_type_value_key`(`type`, `value`),
    UNIQUE INDEX `material_options_type_label_key`(`type`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_style_tags` (
    `materialId` VARCHAR(191) NOT NULL,
    `value` VARCHAR(60) NOT NULL,

    INDEX `material_style_tags_value_idx`(`value`),
    PRIMARY KEY (`materialId`, `value`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `materials_baseMaterial_idx` ON `materials`(`baseMaterial`);

-- CreateIndex
CREATE INDEX `materials_technique_idx` ON `materials`(`technique`);

-- CreateIndex
CREATE INDEX `materials_surfaceFinish_idx` ON `materials`(`surfaceFinish`);

-- CreateIndex
CREATE INDEX `materials_surfacePattern_idx` ON `materials`(`surfacePattern`);

-- CreateIndex
CREATE INDEX `materials_colorCount_idx` ON `materials`(`colorCount`);

-- CreateIndex
CREATE INDEX `materials_needsReview_idx` ON `materials`(`needsReview`);

-- AddForeignKey
ALTER TABLE `material_style_tags` ADD CONSTRAINT `material_style_tags_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Nạp danh mục mặc định (admin sửa nhãn/thêm/tắt ở Quản trị > Danh mục chất liệu)
INSERT INTO `material_options` (`id`, `type`, `value`, `label`, `sortOrder`, `isActive`, `updatedAt`) VALUES
  ('opt_BASE_MATERIAL_nhua', 'BASE_MATERIAL', 'nhua', 'Nhựa', 10, true, CURRENT_TIMESTAMP(3)),
  ('opt_BASE_MATERIAL_vai', 'BASE_MATERIAL', 'vai', 'Vải', 20, true, CURRENT_TIMESTAMP(3)),
  ('opt_BASE_MATERIAL_gia-guong', 'BASE_MATERIAL', 'gia-guong', 'Giả gương', 30, true, CURRENT_TIMESTAMP(3)),
  ('opt_TECHNIQUE_khac-laser', 'TECHNIQUE', 'khac-laser', 'Khắc laser', 10, true, CURRENT_TIMESTAMP(3)),
  ('opt_TECHNIQUE_cat-laser', 'TECHNIQUE', 'cat-laser', 'Cắt laser', 20, true, CURRENT_TIMESTAMP(3)),
  ('opt_TECHNIQUE_in-uv', 'TECHNIQUE', 'in-uv', 'In UV', 30, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_mo', 'SURFACE_FINISH', 'mo', 'Mờ', 10, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_bong', 'SURFACE_FINISH', 'bong', 'Bóng', 20, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_guong', 'SURFACE_FINISH', 'guong', 'Gương', 30, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_anh-kim-xuoc', 'SURFACE_FINISH', 'anh-kim-xuoc', 'Ánh kim / xước', 40, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_nhu-lap-lanh', 'SURFACE_FINISH', 'nhu-lap-lanh', 'Nhũ / lấp lánh', 50, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_anh-cau-vong', 'SURFACE_FINISH', 'anh-cau-vong', 'Ánh cầu vồng', 60, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_nhung-long', 'SURFACE_FINISH', 'nhung-long', 'Nhung / lông', 70, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_phong-noi', 'SURFACE_FINISH', 'phong-noi', 'Phồng / nổi', 80, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_gia-da', 'SURFACE_FINISH', 'gia-da', 'Giả da / hạt nhám', 90, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_vai-det', 'SURFACE_FINISH', 'vai-det', 'Vải dệt / jeans', 100, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_FINISH_khac', 'SURFACE_FINISH', 'khac', 'Khác', 110, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_tron', 'SURFACE_PATTERN', 'tron', 'Trơn', 10, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_caro', 'SURFACE_PATTERN', 'caro', 'Caro / ô vuông', 20, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_ke-soc', 'SURFACE_PATTERN', 'ke-soc', 'Kẻ sọc', 30, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_hinh-hoc', 'SURFACE_PATTERN', 'hinh-hoc', 'Hoa văn hình học (carbon, tổ ong, đan chéo)', 40, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_song-xoay-ran-ri', 'SURFACE_PATTERN', 'song-xoay-ran-ri', 'Hoa văn lượn (sóng, xoáy, rằn ri)', 50, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_nut-ran', 'SURFACE_PATTERN', 'nut-ran', 'Nứt / rạn', 60, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_van-nhien', 'SURFACE_PATTERN', 'van-nhien', 'Vân tự nhiên (đá, mây, loang)', 70, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_chuyen-mau', 'SURFACE_PATTERN', 'chuyen-mau', 'Chuyển màu', 80, true, CURRENT_TIMESTAMP(3)),
  ('opt_SURFACE_PATTERN_khac', 'SURFACE_PATTERN', 'khac', 'Khác', 90, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_trang', 'COLOR_FAMILY', 'trang', 'Trắng', 10, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_kem-be', 'COLOR_FAMILY', 'kem-be', 'Kem / be', 20, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_den', 'COLOR_FAMILY', 'den', 'Đen', 30, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_xam', 'COLOR_FAMILY', 'xam', 'Xám', 40, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_bac', 'COLOR_FAMILY', 'bac', 'Bạc', 50, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_vang-kim', 'COLOR_FAMILY', 'vang-kim', 'Vàng kim', 60, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_vang', 'COLOR_FAMILY', 'vang', 'Vàng', 70, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_cam', 'COLOR_FAMILY', 'cam', 'Cam', 80, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_do', 'COLOR_FAMILY', 'do', 'Đỏ', 90, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_hong', 'COLOR_FAMILY', 'hong', 'Hồng', 100, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_tim', 'COLOR_FAMILY', 'tim', 'Tím', 110, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_xanh-duong', 'COLOR_FAMILY', 'xanh-duong', 'Xanh dương', 120, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_xanh-ngoc', 'COLOR_FAMILY', 'xanh-ngoc', 'Xanh ngọc', 130, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_xanh-la', 'COLOR_FAMILY', 'xanh-la', 'Xanh lá', 140, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_nau', 'COLOR_FAMILY', 'nau', 'Nâu', 150, true, CURRENT_TIMESTAMP(3)),
  ('opt_COLOR_FAMILY_nhieu-mau', 'COLOR_FAMILY', 'nhieu-mau', 'Nhiều màu', 160, true, CURRENT_TIMESTAMP(3)),
  ('opt_STYLE_TAG_toi-gian', 'STYLE_TAG', 'toi-gian', 'Tối giản', 10, true, CURRENT_TIMESTAMP(3)),
  ('opt_STYLE_TAG_sang-trong', 'STYLE_TAG', 'sang-trong', 'Sang trọng', 20, true, CURRENT_TIMESTAMP(3)),
  ('opt_STYLE_TAG_tre-trung', 'STYLE_TAG', 'tre-trung', 'Trẻ trung', 30, true, CURRENT_TIMESTAMP(3)),
  ('opt_STYLE_TAG_the-thao', 'STYLE_TAG', 'the-thao', 'Thể thao', 40, true, CURRENT_TIMESTAMP(3)),
  ('opt_STYLE_TAG_streetwear', 'STYLE_TAG', 'streetwear', 'Streetwear', 50, true, CURRENT_TIMESTAMP(3)),
  ('opt_STYLE_TAG_moc-mac', 'STYLE_TAG', 'moc-mac', 'Mộc mạc', 60, true, CURRENT_TIMESTAMP(3)),
  ('opt_STYLE_TAG_dong-phuc', 'STYLE_TAG', 'dong-phuc', 'Đồng phục công ty', 70, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_zy', 'SERIES', 'zy', 'ZY', 10, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_ht', 'SERIES', 'ht', 'HT', 20, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_h', 'SERIES', 'h', 'H', 30, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_yyb', 'SERIES', 'yyb', 'YYB', 40, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_yps', 'SERIES', 'yps', 'YPS', 50, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_lw', 'SERIES', 'lw', 'LW', 60, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_11074', 'SERIES', '11074', '11074', 70, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_11078', 'SERIES', '11078', '11078', 80, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_su', 'SERIES', 'su', 'SU', 90, true, CURRENT_TIMESTAMP(3)),
  ('opt_SERIES_hb', 'SERIES', 'hb', 'HB', 100, true, CURRENT_TIMESTAMP(3));

-- Điền sẵn baseMaterial và technique từ nhóm / công nghệ in hiện có (giá trị lạ để trống, admin chọn lại ở form)
UPDATE `materials` SET `baseMaterial` = CASE `groupName`
  WHEN 'Nhựa' THEN 'nhua' WHEN 'Vải' THEN 'vai' WHEN 'Giả Gương' THEN 'gia-guong' END
WHERE `baseMaterial` IS NULL;
UPDATE `materials` SET `technique` = CASE `printTech`
  WHEN 'Khắc laser' THEN 'khac-laser' WHEN 'Cắt laser' THEN 'cat-laser' WHEN 'In UV' THEN 'in-uv' END
WHERE `technique` IS NULL;
-- Chính tả nhãn thống nhất: "Giả gương"
UPDATE `materials` SET `groupName` = 'Giả gương' WHERE `baseMaterial` = 'gia-guong';
