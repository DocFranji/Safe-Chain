import {Address} from '@stellar/stellar-sdk';

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
export const Error = {
  1 : { message: "YaInicializado" },
  2 : { message: "NoEncontrada" },
  3 : { message: "EstadoInvalido" },
  4 : { message: "ParametroInvalido" },
  5 : { message: "YaEsMiembro" },
  6 : { message: "TandaLlena" },
  7 : { message: "NoEsMiembro" },
  8 : { message: "YaPago" },
  9 : { message: "RondaNoVencida" },
  10 : { message: "MiembroMoroso" },
  11 : { message: "NoVerificado" },
  12 : { message: "NoAutorizado" },
  13 : { message: "NoInicializado" },
  14 : { message: "SinDeuda" },
  15 : { message: "PagoExcesivo" },
  16 : { message: "MontoInvalido" }
}

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
 export type Estado =
  { tag: "Abierta"; values: void } |
  { tag: "Activa"; values: void } |
  { tag: "PorLiquidar"; values: void } |
  { tag: "Finalizada"; values: void } |
  { tag: "Cancelada"; values: void };

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
    export type ContractEvent = EvPagoEvent | EvAbonoEvent | EvRondaEvent | EvUnidoEvent | EvCreadaEvent | EvMorosoEvent | EvCubiertoEvent | EvIniciadaEvent | EvCanceladaEvent | EvLiquidadoEvent | EvFinalizadaEvent | EvDeudaPagadaEvent | EvBovedaRapidaEvent | EvBolsaRecuperadaEvent;
    