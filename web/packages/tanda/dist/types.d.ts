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
export type ContractEvent = EvPagoEvent | EvRondaEvent | EvUnidoEvent | EvCreadaEvent | EvMorosoEvent | EvCubiertoEvent | EvIniciadaEvent | EvCanceladaEvent | EvLiquidadoEvent | EvFinalizadaEvent;
