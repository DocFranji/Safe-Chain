import { Tanda, Miembro, ContractEvent } from './types.js';
import { Result, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef } from '@stellar/stellar-sdk/contract';
import { Address, xdr } from '@stellar/stellar-sdk';
export interface Client {
    /**
     * Unirse a una tanda abierta: paga el colateral, que va directo a la bóveda.
     * El orden de llegada define el turno. Cuando entra el último, la tanda arranca.
     */
    unirse(args: {
        id: number;
        miembro: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Solo el creador, y solo mientras la tanda está `Abierta` (no se llenó):
     * devuelve a cada uno su colateral más su parte del rendimiento.
     */
    cancelar(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Reparte todo al terminar las rondas. CUALQUIERA puede llamarla.
     * Orden: retirar de la bóveda → cobrar multas → devolver colateral + rendimiento
     * → repartir multas y retenido entre los cumplidos.
     */
    finalizar(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Crea una tanda nueva en estado `Abierta` y devuelve su id.
     * El creador NO queda como miembro: si quiere participar, llama `unirse`.
     */
    crear_tanda(args: {
        creador: string | Address;
        token: string | Address;
        cuota: bigint;
        n_miembros: number;
        periodo_seg: bigint;
        penalidad_bps: number;
        cobertura_bps: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
    /**
     * Configura el contrato una sola vez: quién es el admin, qué bóveda usar y,
     * opcionalmente, quién puede marcar direcciones como verificadas (gancho SUGEF).
     */
    inicializar(args: {
        admin: string | Address;
        boveda: string | Address;
        verificador: string | Address | null;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Paga la cuota de la ronda ACTUAL. Si ya venció el plazo, cuenta como pago tarde:
     * suma un atraso y una multa pendiente (que se cobra del colateral al final).
     */
    pagar_cuota(args: {
        id: number;
        miembro: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Cierra la ronda vencida. CUALQUIERA puede llamarla (así nadie bloquea la tanda).
     * - Quien no pagó: su colateral cubre la cuota. Si no alcanza, queda moroso.
     * - El beneficiario de turno recibe la bolsa (o se retiene si es moroso).
     */
    cerrar_ronda(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * (P2) El verificador marca una dirección como verificada (KYC hecho fuera de la cadena).
     */
    marcar_verificado(args: {
        miembro: string | Address;
        verificado: boolean;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * (ronda actual, fecha límite, quiénes ya pagaron)
     */
    get_ronda(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<[number, bigint, Array<string>], Error>>>;
    get_tanda(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<Tanda, Error>>>;
    get_miembros(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<[string, Miembro]>, Error>>>;
    /**
     * Cuántas tandas se han creado (los ids van de 1 a este número).
     */
    total_tandas(options?: MethodOptions): Promise<AssembledTransaction<number>>;
    /**
     * Colateral que pagaría el próximo en unirse (para mostrarlo antes de firmar).
     */
    colateral_siguiente(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
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
        unirse: (json: string) => AssembledTransaction<Result<null, Error>>;
        cancelar: (json: string) => AssembledTransaction<Result<null, Error>>;
        finalizar: (json: string) => AssembledTransaction<Result<null, Error>>;
        crear_tanda: (json: string) => AssembledTransaction<Result<number, Error>>;
        inicializar: (json: string) => AssembledTransaction<Result<null, Error>>;
        pagar_cuota: (json: string) => AssembledTransaction<Result<null, Error>>;
        cerrar_ronda: (json: string) => AssembledTransaction<Result<null, Error>>;
        marcar_verificado: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_ronda: (json: string) => AssembledTransaction<Result<[number, bigint, string[]], Error>>;
        get_tanda: (json: string) => AssembledTransaction<Result<Tanda, Error>>;
        get_miembros: (json: string) => AssembledTransaction<Result<[string, Miembro][], Error>>;
        total_tandas: (json: string) => AssembledTransaction<number>;
        colateral_siguiente: (json: string) => AssembledTransaction<Result<bigint, Error>>;
    };
    /** @deprecated Use fromJson instead. */
    readonly fromJSON: {
        unirse: (json: string) => AssembledTransaction<Result<null, Error>>;
        cancelar: (json: string) => AssembledTransaction<Result<null, Error>>;
        finalizar: (json: string) => AssembledTransaction<Result<null, Error>>;
        crear_tanda: (json: string) => AssembledTransaction<Result<number, Error>>;
        inicializar: (json: string) => AssembledTransaction<Result<null, Error>>;
        pagar_cuota: (json: string) => AssembledTransaction<Result<null, Error>>;
        cerrar_ronda: (json: string) => AssembledTransaction<Result<null, Error>>;
        marcar_verificado: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_ronda: (json: string) => AssembledTransaction<Result<[number, bigint, string[]], Error>>;
        get_tanda: (json: string) => AssembledTransaction<Result<Tanda, Error>>;
        get_miembros: (json: string) => AssembledTransaction<Result<[string, Miembro][], Error>>;
        total_tandas: (json: string) => AssembledTransaction<number>;
        colateral_siguiente: (json: string) => AssembledTransaction<Result<bigint, Error>>;
    };
    /**
     * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
     */
    parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined;
    /**
     * Build a topics filter row for the "EvPago" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evPagoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvRonda" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evRondaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvUnido" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evUnidoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvCreada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evCreadaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvMoroso" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evMorosoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvCubierto" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evCubiertoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvIniciada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evIniciadaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvCancelada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evCanceladaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvLiquidado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evLiquidadoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvFinalizada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evFinalizadaEventFilter(topicValues?: {
        id?: number;
    }): string[];
}
