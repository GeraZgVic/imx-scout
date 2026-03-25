ALTER TABLE `Producto`
    ADD COLUMN `prioritario` BOOLEAN NOT NULL DEFAULT false AFTER `activo`;
