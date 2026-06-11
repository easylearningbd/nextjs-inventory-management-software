-- AlterTable: add unique constraint to ProductStock so each (product, warehouse)
-- pair has exactly one canonical stock row, enabling upsert in the stock service.
ALTER TABLE `ProductStock` ADD CONSTRAINT `ProductStock_productId_warehouseId_key` UNIQUE (`productId`, `warehouseId`);

-- CreateTable: Adjustment header
CREATE TABLE `Adjustment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference` VARCHAR(191) NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Adjustment_reference_key`(`reference`),
    INDEX `Adjustment_deletedAt_idx`(`deletedAt`),
    INDEX `Adjustment_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Adjustment line items
CREATE TABLE `AdjustmentItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adjustmentId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdjustmentItem_adjustmentId_idx`(`adjustmentId`),
    INDEX `AdjustmentItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: Adjustment → Warehouse
ALTER TABLE `Adjustment` ADD CONSTRAINT `Adjustment_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: AdjustmentItem → Adjustment
ALTER TABLE `AdjustmentItem` ADD CONSTRAINT `AdjustmentItem_adjustmentId_fkey` FOREIGN KEY (`adjustmentId`) REFERENCES `Adjustment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: AdjustmentItem → Product
ALTER TABLE `AdjustmentItem` ADD CONSTRAINT `AdjustmentItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
