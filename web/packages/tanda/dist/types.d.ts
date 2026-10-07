/**
* La deuda de un miembro, ronda por ronda (`get_deuda`).
*/
export interface Deuda {
    /**
     * Su bolsa, si se retuvo porque era moroso cuando le tocaba cobrar. La recupera al saldar.
     */
    bolsa_retenida: bigint;
    /**
     * Lo que todavía debe, del faltante más viejo al más nuevo. Suman `Miembro.deuda`.
     */
    faltantes: Array<Faltante>;
    /**
     * Cuánto se ha pagado de su deuda hasta ahora (por el miembro o por otras personas).
     */
    pagado: bigint;
}
/**
 * Error Enum: Error
 */
export declare const Error: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
    7: {
        message: string;
    };
    8: {
        message: string;
    };
    9: {
        message: string;
    };
    10: {
        message: string;
    };
    11: {
        message: string;
    };
    12: {
        message: string;
    };
    13: {
        message: string;
    };
    14: {
        message: string;
    };
    15: {
        message: string;
    };
    16: {
        message: string;
    };
    20: {
        message: string;
    };
    21: {
        message: string;
    };
    22: {
        message: string;
    };
    30: {
        message: string;
    };
    31: {
        message: string;
    };
    32: {
        message: string;
    };
    33: {
        message: string;
    };
    34: {
        message: string;
    };
    35: {
        message: string;
    };
    36: {
        message: string;
    };
    37: {
        message: string;
    };
    38: {
        message: string;
    };
    39: {
        message: string;
    };
    40: {
        message: string;
    };
    41: {
        message: string;
    };
    42: {
        message: string;
    };
    43: {
        message: string;
    };
    55: {
        message: string;
    };
    56: {
        message: string;
    };
    65: {
        message: string;
    };
};
/**
 * Struct: Tanda
 */
export interface Tanda {
    cobertura_bps: number;
    creador: string;
    cuota: bigint;
    estado: Estado;
    /**
     * Multas cobradas (se llena en `finalizar`).
     */
    fondo_premios: bigint;
    /**
     * Momento (timestamp) en que abrió la ronda actual. Vence en `inicio_ronda + periodo_seg`.
     */
    inicio_ronda: bigint;
    n_miembros: number;
    penalidad_bps: number;
    periodo_seg: bigint;
    /**
     * Bolsas que no se pagaron porque el beneficiario era moroso.
     */
    retenido: bigint;
    /**
     * Ronda en curso: 0..n_miembros. En la ronda `r` cobra el miembro con `posicion == r`.
     */
    ronda_actual: number;
    /**
     * Participaciones de ESTA tanda en la bóveda (varias tandas comparten bóveda).
     */
    shares_boveda: bigint;
    token: string;
}
/**
 * Union: Estado
 */
export type Estado = {
    tag: "Abierta";
    values: void;
} | {
    tag: "Activa";
    values: void;
} | {
    tag: "PorLiquidar";
    values: void;
} | {
    tag: "Finalizada";
    values: void;
} | {
    tag: "Cancelada";
    values: void;
};
/**
 * Struct: Miembro
 */
export interface Miembro {
    atrasos: number;
    /**
     * Ya recibió su turno.
     */
    cobro: boolean;
    /**
     * Colateral que le queda (baja si cubre impagos o multas).
     */
    colateral: bigint;
    colateral_inicial: bigint;
    /**
     * Cuotas que su colateral no alcanzó a cubrir.
     */
    deuda: bigint;
    moroso: boolean;
    multas_pendientes: bigint;
    /**
     * Turno: 0 cobra en la ronda 0.
     */
    posicion: number;
}
/**
 * Una parte de la deuda de un moroso: lo que su garantía no alcanzó a cubrir en la ronda `ronda`
 * y a quién se le debe (`acreedor`: quien cobró esa ronda y recibió de menos).
 */
export interface Faltante {
    acreedor: string;
    monto: bigint;
    ronda: number;
}
/**
 * Intercambio pendiente: `de` propone cambiar su turno por el de `con`.
 * `compensacion` > 0: `de` le paga a `con` (queda guardada en el contrato hasta aceptar o retirar).
 * `compensacion` < 0: `con` le paga a `de` al aceptar.
 */
export interface Propuesta {
    compensacion: bigint;
    con: string;
    de: string;
}
/**
 * Union: ModoTurnos
 */
export type ModoTurnos = 
/**
 * El orden de llegada decide el turno (como siempre).
 */
{
    tag: "Llegada";
    values: void;
} | 
/**
 * Cada quien elige un turno libre al unirse, gratis.
 */
{
    tag: "Eleccion";
    values: void;
} | 
/**
 * Cada quien elige turno: los primeros pagan una prima y los últimos la reciben.
 */
{
    tag: "PrecioPorTurno";
    values: void;
} | 
/**
 * El contrato sortea el orden cuando se llena la tanda.
 */
{
    tag: "Sorteo";
    values: void;
} | 
/**
 * Cada ronda cobra quien ofrezca el mayor descuento sobre la bolsa.
 */
{
    tag: "Subasta";
    values: void;
};
/**
 * Requisitos de historial de una tanda (`configurar_requisitos`). Por defecto: ninguno.
 */
export interface Requisitos {
    /**
     * Dar descuento de garantía según el nivel del historial.
     */
    descuento: boolean;
    /**
     * Puntaje mínimo para unirse (0 = cualquiera puede).
     */
    puntaje_minimo: number;
}
/**
 * Todo lo de turnos que la web necesita, en una sola lectura (`get_estado_turnos`).
 */
export interface EstadoTurnos {
    /**
     * Subasta sellada en curso: hasta este momento se sella; después, hasta que vence, se revela
     * (0 si no aplica).
     */
    fin_sellado: bigint;
    /**
     * PrecioPorTurno: primas ya cobradas que esperan a los últimos turnos.
     */
    fondo_primas: bigint;
    /**
     * Subasta: descuento de esa oferta, en bps sobre la bolsa (0 si nadie ha ofertado).
     */
    mejor_oferta_bps: number;
    /**
     * Subasta: quién hizo la mejor oferta de la ronda en curso (nadie todavía: `None`).
     */
    mejor_postor: string | null;
    opciones: OpcionesTanda;
    /**
     * Intercambios pendientes.
     */
    propuestas: Array<Propuesta>;
    /**
     * Subasta: orden sorteado al llenarse; decide quién cobra en las rondas sin ofertas.
     */
    respaldo: Array<string>;
    /**
     * Subasta sellada: quiénes sellaron una oferta en la ronda en curso y aún no la revelan.
     */
    sellos: Array<string>;
}
/**
 * Opciones de turnos que elige el creador (`crear_tanda_avanzada`).
 */
export interface OpcionesTanda {
    /**
     * Subasta: descuento máximo que se puede ofrecer, en bps sobre la bolsa.
     */
    descuento_max_bps: number;
    modo: ModoTurnos;
    /**
     * Subasta: las ofertas se sellan en la primera mitad de la ronda y se revelan en la segunda.
     */
    ofertas_selladas: boolean;
    /**
     * Dos miembros pueden cambiar sus turnos futuros (no aplica a la subasta).
     */
    permitir_intercambio: boolean;
    /**
     * PrecioPorTurno: prima del primer turno, en bps sobre la bolsa. El último recibe lo mismo.
     */
    prima_max_bps: number;
    /**
     * Elegir turno y precio por turno: cuántos de los primeros turnos piden historial (M2).
     * 0 = ninguno. Esos turnos solo los toma quien tenga al menos `puntaje_primeros`.
     */
    primeros_con_historial: number;
    /**
     * Puntaje de historial que piden los primeros turnos (0 si `primeros_con_historial` es 0).
     */
    puntaje_primeros: number;
}
/**
 * Event: EvPago
 */
export interface EvPagoEvent {
    name: "EvPago";
    data: {
        id: number;
        miembro?: string;
        ronda?: number;
        tarde?: boolean;
    };
}
/**
 * Una parte de ese pago llegó a quien cobró de menos en la ronda `ronda`.
 * Si su bolsa estaba retenida (también era moroso), `retenida` es `true` y el monto se sumó a esa bolsa.
 */
export interface EvAbonoEvent {
    name: "EvAbono";
    data: {
        id: number;
        deudor?: string;
        acreedor?: string;
        ronda?: number;
        monto?: bigint;
        retenida?: boolean;
    };
}
/**
 * Precio por turno: `prima` > 0 la pagó quien cobró (se apartó de su bolsa); < 0 la recibió.
 */
export interface EvPrimaEvent {
    name: "EvPrima";
    data: {
        id: number;
        ronda?: number;
        miembro?: string;
        prima?: bigint;
    };
}
/**
 * Event: EvRonda
 */
export interface EvRondaEvent {
    name: "EvRonda";
    data: {
        id: number;
        ronda?: number;
        beneficiario?: string;
        monto_pagado?: bigint;
    };
}
/**
 * Subasta sellada: `miembro` selló una oferta en la ronda `ronda` (el monto se verá al revelarla).
 */
export interface EvSelloEvent {
    name: "EvSello";
    data: {
        id: number;
        ronda?: number;
        miembro?: string;
    };
}
/**
 * Event: EvUnido
 */
export interface EvUnidoEvent {
    name: "EvUnido";
    data: {
        id: number;
        miembro?: string;
        posicion?: number;
        colateral?: bigint;
    };
}
/**
 * Event: EvCreada
 */
export interface EvCreadaEvent {
    name: "EvCreada";
    data: {
        id: number;
        creador?: string;
        cuota?: bigint;
        n_miembros?: number;
    };
}
/**
 * Event: EvMoroso
 */
export interface EvMorosoEvent {
    name: "EvMoroso";
    data: {
        id: number;
        miembro?: string;
        deuda?: bigint;
    };
}
/**
 * Subasta: alguien ofreció recibir `descuento` menos para cobrar en esta ronda.
 */
export interface EvOfertaEvent {
    name: "EvOferta";
    data: {
        id: number;
        ronda?: number;
        miembro?: string;
        descuento_bps?: number;
        /**
         * En dinero, si todos pagan la ronda.
         */
        descuento?: bigint;
    };
}
/**
 * El contrato sorteó el orden de cobro: `orden[i]` cobra en la ronda `i`.
 */
export interface EvSorteoEvent {
    name: "EvSorteo";
    data: {
        id: number;
        orden?: Array<string>;
    };
}
/**
 * Subasta: quién se quedó con la bolsa de la ronda y cuánto recibió cada uno de los demás.
 */
export interface EvSubastaEvent {
    name: "EvSubasta";
    data: {
        id: number;
        ronda?: number;
        ganador?: string;
        descuento?: bigint;
        /**
         * Lo que se sumó a la garantía de cada uno de los demás.
         */
        dividendo?: bigint;
        /**
         * Nadie ofertó (o la oferta no valía): cobró el siguiente del orden de respaldo.
         */
        por_respaldo?: boolean;
    };
}
/**
 * El momento clave de la demo: "el colateral de Ana cubrió su cuota".
 */
export interface EvCubiertoEvent {
    name: "EvCubierto";
    data: {
        id: number;
        miembro?: string;
        ronda?: number;
        monto?: bigint;
    };
}
/**
 * De la bolsa de quien cobró se apartó `monto` para completar su garantía (vuelve al final).
 */
export interface EvGarantiaEvent {
    name: "EvGarantia";
    data: {
        id: number;
        ronda?: number;
        miembro?: string;
        monto?: bigint;
    };
}
/**
 * Event: EvIniciada
 */
export interface EvIniciadaEvent {
    name: "EvIniciada";
    data: {
        id: number;
        inicio_ronda?: bigint;
    };
}
/**
 * La tanda se creó con opciones de turnos (`crear_tanda_avanzada`).
 */
export interface EvOpcionesEvent {
    name: "EvOpciones";
    data: {
        id: number;
        modo?: ModoTurnos;
        permitir_intercambio?: boolean;
        prima_max_bps?: number;
        descuento_max_bps?: number;
        primeros_con_historial?: number;
        puntaje_primeros?: number;
        ofertas_selladas?: boolean;
    };
}
/**
 * Event: EvCancelada
 */
export interface EvCanceladaEvent {
    name: "EvCancelada";
    data: {
        id: number;
    };
}
/**
 * Event: EvLiquidado
 */
export interface EvLiquidadoEvent {
    name: "EvLiquidado";
    data: {
        id: number;
        miembro?: string;
        monto?: bigint;
    };
}
/**
 * Event: EvPropuesta
 */
export interface EvPropuestaEvent {
    name: "EvPropuesta";
    data: {
        id: number;
        de?: string;
        con?: string;
        compensacion?: bigint;
    };
}
/**
 * Event: EvFinalizada
 */
export interface EvFinalizadaEvent {
    name: "EvFinalizada";
    data: {
        id: number;
        rendimiento?: bigint;
        fondo_premios?: bigint;
        retenido?: bigint;
        /**
         * Lo que no se pudo repartir porque no había a quién (caso extremo).
         */
        sin_repartir?: bigint;
    };
}
/**
 * El creador de la tanda `id` fijó sus requisitos de historial.
 */
export interface EvRequisitosEvent {
    name: "EvRequisitos";
    data: {
        id: number;
        puntaje_minimo?: number;
        descuento?: boolean;
    };
}
/**
 * El admin registró (o quitó) la bóveda de un token. Solo afecta a las tandas que se creen después.
 */
export interface EvBovedaTokenEvent {
    name: "EvBovedaToken";
    data: {
        token: string;
        boveda?: string | null;
    };
}
/**
 * Alguien pagó (toda o una parte) la deuda de `miembro`. Puede ser el miembro u otra persona.
 */
export interface EvDeudaPagadaEvent {
    name: "EvDeudaPagada";
    data: {
        id: number;
        miembro?: string;
        pagador?: string;
        monto?: bigint;
        deuda_restante?: bigint;
    };
}
/**
 * Dos miembros cambiaron de turno: `de` ahora cobra en `turno_de` y `con` en `turno_con`.
 */
export interface EvIntercambioEvent {
    name: "EvIntercambio";
    data: {
        id: number;
        de?: string;
        con?: string;
        turno_de?: number;
        turno_con?: number;
        compensacion?: bigint;
    };
}
/**
 * El admin cambió la bóveda rápida (solo afecta a las tandas que se creen después).
 */
export interface EvBovedaRapidaEvent {
    name: "EvBovedaRapida";
    data: {
        boveda?: string | null;
    };
}
/**
 * Un moroso saldó su deuda y recuperó su bolsa retenida: recibió `monto`; se descontaron `multas`
 * (al fondo de premios) y `garantia` (repone su garantía para las cuotas que aún debe).
 */
export interface EvBolsaRecuperadaEvent {
    name: "EvBolsaRecuperada";
    data: {
        id: number;
        miembro?: string;
        monto?: bigint;
        multas?: bigint;
        garantia?: bigint;
    };
}
/**
 * Se retiró una propuesta de intercambio (lo guardado volvió a `de`).
 */
export interface EvPropuestaRetiradaEvent {
    name: "EvPropuestaRetirada";
    data: {
        id: number;
        de?: string;
        con?: string;
    };
}
/**
 * El admin conectó (o desconectó, con `None`) el contrato de historial.
 */
export interface EvHistorialConfiguradoEvent {
    name: "EvHistorialConfigurado";
    data: {
        historial?: string | null;
    };
}
export type ContractEvent = EvPagoEvent | EvAbonoEvent | EvPrimaEvent | EvRondaEvent | EvSelloEvent | EvUnidoEvent | EvCreadaEvent | EvMorosoEvent | EvOfertaEvent | EvSorteoEvent | EvSubastaEvent | EvCubiertoEvent | EvGarantiaEvent | EvIniciadaEvent | EvOpcionesEvent | EvCanceladaEvent | EvLiquidadoEvent | EvPropuestaEvent | EvFinalizadaEvent | EvRequisitosEvent | EvBovedaTokenEvent | EvDeudaPagadaEvent | EvIntercambioEvent | EvBovedaRapidaEvent | EvBolsaRecuperadaEvent | EvPropuestaRetiradaEvent | EvHistorialConfiguradoEvent;
