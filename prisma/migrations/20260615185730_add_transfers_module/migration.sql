-- CreateTable
CREATE TABLE `Transfer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference` VARCHAR(191) NOT NULL,
    `fromWarehouseId` INTEGER NOT NULL,
    `toWarehouseId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(14, 2) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Transfer_reference_key`(`reference`),
    INDEX `Transfer_deletedAt_idx`(`deletedAt`),
    INDEX `Transfer_fromWarehouseId_idx`(`fromWarehouseId`),
    INDEX `Transfer_toWarehouseId_idx`(`toWarehouseId`),
    INDEX `Transfer_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransferItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transferId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `netUnitCost` DECIMAL(12, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `discountType` VARCHAR(191) NOT NULL DEFAULT 'Fixed',
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxType` VARCHAR(191) NOT NULL DEFAULT 'Exclusive',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `productUnit` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TransferItem_transferId_idx`(`transferId`),
    INDEX `TransferItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_fromWarehouseId_fkey` FOREIGN KEY (`fromWarehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_toWarehouseId_fkey` FOREIGN KEY (`toWarehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferItem` ADD CONSTRAINT `TransferItem_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `Transfer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferItem` ADD CONSTRAINT `TransferItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
