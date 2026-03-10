ALTER TABLE `Alerta`
    MODIFY `tipo` ENUM('precio_cambio', 'tiempo_entrega_cambio') NOT NULL;
