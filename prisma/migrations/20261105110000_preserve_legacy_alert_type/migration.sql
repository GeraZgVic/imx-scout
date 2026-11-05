ALTER TABLE `Alerta`
    MODIFY `tipo` ENUM('precio_cambio', 'tiempo_entrega_cambio', 'disponibilidad_cambio') NOT NULL;
