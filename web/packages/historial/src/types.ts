import {Address} from '@stellar/stellar-sdk';

    /**
 * Error Enum: Error
 */
export const Error = {
  1 : { message: "YaInicializado" },
  2 : { message: "NoInicializado" },
  /**
   * Quien intenta escribir no es un contrato de tanda autorizado.
   */
  3 : { message: "NoAutorizado" },
  4 : { message: "ParametroInvalido" }
}

/**
 * Lo que puede pasarle a alguien en una tanda.
 */
 export type Hecho =
  /**
   * Pagó su cuota antes del vencimiento (+10).
   */
  { tag: "CuotaATiempo"; values: void } |
  /**
   * Pagó su cuota después del vencimiento (+3).
   */
  { tag: "CuotaTarde"; values: void } |
  /**
   * No pagó y su garantía cubrió la cuota (−15).
   */
  { tag: "CuotaCubierta"; values: void } |
  /**
   * Su garantía no alcanzó: quedó debiendo (−100).
   */
  { tag: "Moroso"; values: void } |
  /**
   * Pagó toda su deuda (+60). No borra la mora.
   */
  { tag: "DeudaSaldada"; values: void } |
  /**
   * Terminó una tanda sin atrasos ni mora (+50).
   */
  { tag: "TandaCumplida"; values: void } |
  /**
   * Terminó una tanda con atrasos, sin mora (+25).
   */
  { tag: "TandaConAtrasos"; values: void } |
  /**
   * Recibió su bolsa (0 puntos, solo informativo).
   */
  { tag: "Cobro"; values: void };

/**
 * Enum: Nivel
 */
export enum Nivel {
  /**
   * Enum Case: Nuevo
   */
  Nuevo = 0,
  /**
   * Enum Case: Bronce
   */
  Bronce = 1,
  /**
   * Enum Case: Plata
   */
  Plata = 2,
  /**
   * Enum Case: Oro
   */
  Oro = 3
}

/**
 * Reglas anti-inflado. Se aplican solo a hechos futuros: lo ya ganado no se recalcula.
 */
export interface Reglas {
  /**
   * Los puntos positivos solo cuentan en tandas con cuota igual o mayor a esta.
   */
  cuota_minima: bigint;
  /**
   * Máximo de puntos positivos que una persona gana en una misma tanda.
   */
  tope_por_tanda: number;
}

/**
 * Un hecho nuevo en el historial de `miembro`. Este es el registro inmutable, hecho por hecho.
 */
export interface EvHechoEvent {
  name: "EvHecho";
  data: {
    miembro: string;
    /**
     * Contrato de tanda que lo reportó.
     */
    emisor?: string;
    tanda_id?: number;
    hecho?: Hecho;
    monto?: bigint;
    /**
     * Puntos que sumó (o restó), ya con las reglas aplicadas.
     */
    puntos?: number;
  };
}

/**
 * Event: EvReglas
 */
export interface EvReglasEvent {
  name: "EvReglas";
  data: {
    cuota_minima?: bigint;
    tope_por_tanda?: number;
  };
}

/**
 * Acumulados de una dirección. Todo empieza en cero.
 */
export interface Historial {
  cobros: number;
  cuotas_a_tiempo: number;
  cuotas_cubiertas: number;
  cuotas_tarde: number;
  deudas_saldadas: number;
  /**
   * Suma de las cuotas que pagó de su bolsillo (a tiempo o tarde).
   */
  monto_pagado: bigint;
  /**
   * Momento (timestamp) del primer y del último hecho. 0 = sin historial.
   */
  primera_actividad: bigint;
  /**
   * Puntos perdidos. Nunca bajan.
   */
  puntos_negativos: number;
  /**
   * Puntos ganados, ya con las reglas anti-inflado aplicadas.
   */
  puntos_positivos: number;
  tandas_con_atrasos: number;
  tandas_cumplidas: number;
  ultima_actividad: bigint;
  veces_moroso: number;
}

/**
 * Un hecho de un miembro, como lo envía la tanda.
 */
export interface HechoMiembro {
  hecho: Hecho;
  miembro: string;
  /**
   * Monto relacionado (cuota pagada, monto cubierto, deuda, bolsa...). Nunca negativo.
   */
  monto: bigint;
}

/**
 * Event: EvEmisorRevocado
 */
export interface EvEmisorRevocadoEvent {
  name: "EvEmisorRevocado";
  data: {
    emisor?: string;
  };
}

/**
 * Event: EvEmisorAutorizado
 */
export interface EvEmisorAutorizadoEvent {
  name: "EvEmisorAutorizado";
  data: {
    emisor?: string;
  };
}
    export type ContractEvent = EvHechoEvent | EvReglasEvent | EvEmisorRevocadoEvent | EvEmisorAutorizadoEvent;
    