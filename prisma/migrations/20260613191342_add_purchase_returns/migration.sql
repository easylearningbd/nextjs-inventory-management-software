-- CreateTable
CREATE TABLE `PurchaseReturn` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference` VARCHAR(191) NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `purchaseId` INTEGER NULL,
    `date` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Received',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grandTotal` DECIMAL(14, 2) NOT NULL,
    `paid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `due` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paymentType` VARCHAR(191) NOT NULL DEFAULT 'Cash',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PurchaseReturn_reference_key`(`reference`),
    INDEX `PurchaseReturn_deletedAt_idx`(`deletedAt`),
    INDEX `PurchaseReturn_supplierId_idx`(`supplierId`),
    INDEX `PurchaseReturn_warehouseId_idx`(`warehouseId`),
    INDEX `PurchaseReturn_purchaseId_idx`(`purchaseId`),
    INDEX `PurchaseReturn_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseReturnItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `returnId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `netUnitCost` DECIMAL(12, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `discountType` VARCHAR(191) NOT NULL DEFAULT 'Fixed',
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxType` VARCHAR(191) NOT NULL DEFAULT 'Exclusive',
    `orderTax` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `returnUnit` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PurchaseReturnItem_returnId_idx`(`returnId`),
    INDEX `PurchaseReturnItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PurchaseReturn` ADD CONSTRAINT `PurchaseReturn_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseReturn` ADD CONSTRAINT `PurchaseReturn_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseReturn` ADD CONSTRAINT `PurchaseReturn_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseReturnItem` ADD CONSTRAINT `PurchaseReturnItem_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `PurchaseReturn`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseReturnItem` ADD CONSTRAINT `PurchaseReturnItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
