/**
* Error Enum: Error
*/
export const Error = {
    1: { message: "YaInicializado" },
    2: { message: "NoInicializado" },
    /**
     * Quien intenta escribir no es un contrato de tanda autorizado.
     */
    3: { message: "NoAutorizado" },
    4: { message: "ParametroInvalido" }
};
/**
 * Enum: Nivel
 */
export var Nivel;
(function (Nivel) {
    /**
     * Enum Case: Nuevo
     */
    Nivel[Nivel["Nuevo"] = 0] = "Nuevo";
    /**
     * Enum Case: Bronce
     */
    Nivel[Nivel["Bronce"] = 1] = "Bronce";
    /**
     * Enum Case: Plata
     */
    Nivel[Nivel["Plata"] = 2] = "Plata";
    /**
     * Enum Case: Oro
     */
    Nivel[Nivel["Oro"] = 3] = "Oro";
})(Nivel || (Nivel = {}));
