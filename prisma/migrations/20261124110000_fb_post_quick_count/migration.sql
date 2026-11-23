-- AlterTable
ALTER TABLE `fb_posts`
    ADD COLUMN `lastFullScannedAt` DATETIME(3) NULL,
    ADD COLUMN `reportedCommentCount` INTEGER NULL;
