import { Nivel, Reglas, Historial, HechoMiembro, ContractEvent } from './types.js';
import { Result, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef } from '@stellar/stellar-sdk/contract';
import { Address, xdr } from '@stellar/stellar-sdk';
export interface Client {
    apodo(args: {
        quien: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
    nivel(args: {
        dir: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Nivel>>;
    reglas(options?: MethodOptions): Promise<AssembledTransaction<Result<Reglas, Error>>>;
    puntaje(args: {
        dir: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
    es_emisor(args: {
        dir: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
    /**
     * Acumulados de `dir` (todo en cero si no tiene historial).
     */
    historial(args: {
        dir: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Historial>>;
    /**
     * (v4, N2) ¿Tiene una mora sin saldar en alguna tanda? (`veces_moroso > deudas_saldadas`).
     * Las tandas lo usan para no dejar unirse a quien debe.
     */
    tiene_mora(args: {
        dir: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
    /**
     * Una sola vez: guarda el admin y las reglas por defecto.
     */
    inicializar(args: {
        admin: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Pone (o cambia) el apodo de `quien`. Solo `quien` puede hacerlo.
     */
    poner_apodo(args: {
        quien: string | Address;
        apodo: string;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Quita el apodo de `quien`. Solo `quien` puede hacerlo.
     */
    quitar_apodo(args: {
        quien: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
    /**
     * (emisor autorizado) Agrega hechos de la tanda `tanda_id`, cuya cuota es `cuota`.
     * Desde otro contrato, `emisor.require_auth()` se cumple solo si quien llama ES el emisor.
     */
    registrar_lote(args: {
        emisor: string | Address;
        tanda_id: number;
        cuota: bigint;
        hechos: Array<HechoMiembro>;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * (admin) Impide escrituras FUTURAS de un emisor. No borra nada de lo que ya escribió.
     */
    revocar_emisor(args: {
        emisor: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Puntos positivos que `miembro` ya ganó en la tanda `tanda_id` del contrato `emisor`.
     */
    puntos_en_tanda(args: {
        emisor: string | Address;
        tanda_id: number;
        miembro: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
    /**
     * (admin) Permite que un contrato de tanda escriba hechos. Público y con evento.
     */
    autorizar_emisor(args: {
        emisor: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * (admin) Cambia las reglas anti-inflado para hechos futuros.
     */
    configurar_reglas(args: {
        reglas: Reglas;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Descuento de garantía que le corresponde a `dir`, en puntos básicos.
     */
    beneficio_colateral_bps(args: {
        dir: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    constructor(options: ContractClientOptions);
    static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & {
        salt?: Uint8Array;
        address?: string;
    } & ({
        wasmHash: Uint8Array | string;
        format?: "hex" | "base64";
        externalRef?: never;
    } | {
        externalRef: ExternalExecutableRef;
        wasmHash?: never;
        format?: never;
    })): Promise<AssembledTransaction<T>>;
    readonly fromJson: {
        apodo: (json: string) => AssembledTransaction<string | null>;
        nivel: (json: string) => AssembledTransaction<Nivel>;
        reglas: (json: string) => AssembledTransaction<Result<Reglas, Error>>;
        puntaje: (json: string) => AssembledTransaction<number>;
        es_emisor: (json: string) => AssembledTransaction<boolean>;
        historial: (json: string) => AssembledTransaction<Historial>;
        tiene_mora: (json: string) => AssembledTransaction<boolean>;
        inicializar: (json: string) => AssembledTransaction<Result<null, Error>>;
        poner_apodo: (json: string) => AssembledTransaction<Result<null, Error>>;
        quitar_apodo: (json: string) => AssembledTransaction<void>;
        registrar_lote: (json: string) => AssembledTransaction<Result<null, Error>>;
        revocar_emisor: (json: string) => AssembledTransaction<Result<null, Error>>;
        puntos_en_tanda: (json: string) => AssembledTransaction<number>;
        autorizar_emisor: (json: string) => AssembledTransaction<Result<null, Error>>;
        configurar_reglas: (json: string) => AssembledTransaction<Result<null, Error>>;
        beneficio_colateral_bps: (json: string) => AssembledTransaction<number>;
    };
    /** @deprecated Use fromJson instead. */
    readonly fromJSON: {
        apodo: (json: string) => AssembledTransaction<string | null>;
        nivel: (json: string) => AssembledTransaction<Nivel>;
        reglas: (json: string) => AssembledTransaction<Result<Reglas, Error>>;
        puntaje: (json: string) => AssembledTransaction<number>;
        es_emisor: (json: string) => AssembledTransaction<boolean>;
        historial: (json: string) => AssembledTransaction<Historial>;
        tiene_mora: (json: string) => AssembledTransaction<boolean>;
        inicializar: (json: string) => AssembledTransaction<Result<null, Error>>;
        poner_apodo: (json: string) => AssembledTransaction<Result<null, Error>>;
        quitar_apodo: (json: string) => AssembledTransaction<void>;
        registrar_lote: (json: string) => AssembledTransaction<Result<null, Error>>;
        revocar_emisor: (json: string) => AssembledTransaction<Result<null, Error>>;
        puntos_en_tanda: (json: string) => AssembledTransaction<number>;
        autorizar_emisor: (json: string) => AssembledTransaction<Result<null, Error>>;
        configurar_reglas: (json: string) => AssembledTransaction<Result<null, Error>>;
        beneficio_colateral_bps: (json: string) => AssembledTransaction<number>;
    };
    /**
     * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
     */
    parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined;
    /**
     * Build a topics filter row for the "EvApodo" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evApodoEventFilter(topicValues?: {
        quien?: string | Address;
    }): string[];
    /**
     * Build a topics filter row for the "EvHecho" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evHechoEventFilter(topicValues?: {
        miembro?: string | Address;
    }): string[];
    /**
     * Build a topics filter row for the "EvReglas" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evReglasEventFilter(): string[];
    /**
     * Build a topics filter row for the "EvEmisorRevocado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evEmisorRevocadoEventFilter(): string[];
    /**
     * Build a topics filter row for the "EvEmisorAutorizado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evEmisorAutorizadoEventFilter(): string[];
}
