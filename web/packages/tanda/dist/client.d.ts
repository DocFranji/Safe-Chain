import { Requisitos, OpcionesTanda, EstadoTurnos, Deuda, Tanda, Miembro, ContractEvent } from './types.js';
import { Result, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef } from '@stellar/stellar-sdk/contract';
import { Address, xdr } from '@stellar/stellar-sdk';
export interface Client {
    /**
     * Unirse a una tanda abierta: paga el colateral, que va directo a la bóveda.
     * El orden de llegada define el turno (salvo que la tanda use otro modo de turnos,
     * ver `turnos.rs`). Cuando entra el último, la tanda arranca.
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
    get_historial(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
    get_requisitos(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<Requisitos, Error>>>;
    /**
     * (admin) Conecta el contrato de historial (o lo desconecta con `None`).
     * La tanda debe estar autorizada como emisor en el historial para que sus hechos cuenten.
     */
    configurar_historial(args: {
        historial: string | Address | null;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * (creador) Requisitos de historial de la tanda `id`. Solo mientras está abierta y sin miembros,
     * para que nadie entre con unas reglas y después le cambien otras.
     */
    configurar_requisitos(args: {
        id: number;
        puntaje_minimo: number;
        descuento: boolean;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Garantía que dejaría `miembro` si se uniera ahora, con el descuento de su historial
     * (para mostrarla antes de firmar).
     */
    colateral_para_miembro(args: {
        id: number;
        miembro: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
    /**
     * Subasta: ofrecer recibir `descuento_bps` menos de la bolsa para cobrar en la ronda en
     * curso. Debe superar la mejor oferta y se acepta solo hasta que vence la ronda.
     */
    ofertar(args: {
        id: number;
        miembro: string | Address;
        descuento_bps: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Opciones de turnos de la tanda (`Llegada` sin intercambio si se creó con `crear_tanda`).
     */
    get_opciones(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<OpcionesTanda, Error>>>;
    /**
     * (garantía que dejaría `miembro` al unirse en el turno `posicion`, prima de ese turno).
     * La garantía ya trae el descuento por historial (M2). Prima > 0: se descuenta de su bolsa;
     * < 0: se le suma. En sorteo y subasta el turno no se elige: devuelve lo que se deja al unirse.
     */
    cotizar_turno(args: {
        id: number;
        miembro: string | Address;
        posicion: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<[bigint, bigint], Error>>>;
    /**
     * Unirse eligiendo un turno libre (modos `Eleccion` y `PrecioPorTurno`). Mismo camino que
     * `unirse`: verificación, ganchos del historial, colateral a la bóveda y arranque al llenarse.
     */
    unirse_en_turno(args: {
        id: number;
        miembro: string | Address;
        posicion: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Todo lo de turnos en una sola lectura: opciones, mejor oferta, orden de respaldo,
     * intercambios pendientes y fondo de primas.
     */
    get_estado_turnos(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<EstadoTurnos, Error>>>;
    /**
     * Retira la propuesta de `de`. La puede retirar `de` (se arrepintió) o `con` (la rechaza).
     * Lo que `de` dejó guardado vuelve a `de`. Funciona en cualquier estado de la tanda.
     */
    cancelar_propuesta(args: {
        id: number;
        de: string | Address;
        quien: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * `con` acepta la propuesta de `de`: cambian de turno y se mueve la compensación.
     * La garantía no se mueve: quien adelanta su turno la completa al cobrar.
     */
    aceptar_intercambio(args: {
        id: number;
        con: string | Address;
        de: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * Igual que `crear_tanda` (mismas reglas y validaciones), pero el creador elige cómo se
     * reparten los turnos: llegada, elección, precio por turno, sorteo o subasta, y si se
     * pueden intercambiar.
     */
    crear_tanda_avanzada(args: {
        creador: string | Address;
        token: string | Address;
        cuota: bigint;
        n_miembros: number;
        periodo_seg: bigint;
        penalidad_bps: number;
        cobertura_bps: number;
        opciones: OpcionesTanda;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
    /**
     * `de` propone cambiar su turno por el de `con`. Si `compensacion` > 0, `de` la deja ahora en
     * el contrato y `con` la recibe al aceptar; si es < 0, `con` le paga a `de` al aceptar.
     */
    proponer_intercambio(args: {
        id: number;
        de: string | Address;
        con: string | Address;
        compensacion: bigint;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
    /**
     * La deuda de `miembro` en la tanda `id`: a quién le debe (por ronda), su bolsa retenida si la
     * tiene, y cuánto ha pagado. Si nunca debió nada, todo vacío.
     */
    get_deuda(args: {
        id: number;
        miembro: string | Address;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<Deuda, Error>>>;
    /**
     * Las deudas de la tanda `id` en una sola consulta: solo de quienes alguna vez debieron algo
     * (incluye a quienes ya saldaron: `faltantes` vacío y `pagado > 0`).
     */
    get_deudas(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<[string, Deuda]>, Error>>>;
    /**
     * Paga (toda o una parte) la deuda de `miembro` en la tanda `id`. Puede pagarla otra persona
     * (`pagador`, que es quien firma y de quien sale el dinero). Devuelve la deuda que queda.
     *
     * Solo mientras la tanda está `Activa` o `PorLiquidar`. No se puede pagar de más.
     */
    pagar_deuda(args: {
        id: number;
        miembro: string | Address;
        pagador: string | Address;
        monto: bigint;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
    /**
     * La bóveda donde está la garantía de la tanda `id` (la web la usa para mostrar el rendimiento).
     */
    get_boveda(args: {
        id: number;
    }, options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
    /**
     * (Solo el admin) Bóveda rápida para tandas de prueba (rondas de hasta 10 minutos).
     * `None` la quita. Solo afecta a las tandas que se creen después: cada tanda conserva la suya.
     */
    configurar_boveda_rapida(args: {
        boveda: string | Address | null;
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
     * En los modos donde se elige turno, el del turno libre más bajo (ver `cotizar_turno`).
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
        get_historial: (json: string) => AssembledTransaction<string | null>;
        get_requisitos: (json: string) => AssembledTransaction<Result<Requisitos, Error>>;
        configurar_historial: (json: string) => AssembledTransaction<Result<null, Error>>;
        configurar_requisitos: (json: string) => AssembledTransaction<Result<null, Error>>;
        colateral_para_miembro: (json: string) => AssembledTransaction<Result<bigint, Error>>;
        ofertar: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_opciones: (json: string) => AssembledTransaction<Result<OpcionesTanda, Error>>;
        cotizar_turno: (json: string) => AssembledTransaction<Result<[bigint, bigint], Error>>;
        unirse_en_turno: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_estado_turnos: (json: string) => AssembledTransaction<Result<EstadoTurnos, Error>>;
        cancelar_propuesta: (json: string) => AssembledTransaction<Result<null, Error>>;
        aceptar_intercambio: (json: string) => AssembledTransaction<Result<null, Error>>;
        crear_tanda_avanzada: (json: string) => AssembledTransaction<Result<number, Error>>;
        proponer_intercambio: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_deuda: (json: string) => AssembledTransaction<Result<Deuda, Error>>;
        get_deudas: (json: string) => AssembledTransaction<Result<[string, Deuda][], Error>>;
        pagar_deuda: (json: string) => AssembledTransaction<Result<bigint, Error>>;
        get_boveda: (json: string) => AssembledTransaction<Result<string, Error>>;
        configurar_boveda_rapida: (json: string) => AssembledTransaction<Result<null, Error>>;
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
        get_historial: (json: string) => AssembledTransaction<string | null>;
        get_requisitos: (json: string) => AssembledTransaction<Result<Requisitos, Error>>;
        configurar_historial: (json: string) => AssembledTransaction<Result<null, Error>>;
        configurar_requisitos: (json: string) => AssembledTransaction<Result<null, Error>>;
        colateral_para_miembro: (json: string) => AssembledTransaction<Result<bigint, Error>>;
        ofertar: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_opciones: (json: string) => AssembledTransaction<Result<OpcionesTanda, Error>>;
        cotizar_turno: (json: string) => AssembledTransaction<Result<[bigint, bigint], Error>>;
        unirse_en_turno: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_estado_turnos: (json: string) => AssembledTransaction<Result<EstadoTurnos, Error>>;
        cancelar_propuesta: (json: string) => AssembledTransaction<Result<null, Error>>;
        aceptar_intercambio: (json: string) => AssembledTransaction<Result<null, Error>>;
        crear_tanda_avanzada: (json: string) => AssembledTransaction<Result<number, Error>>;
        proponer_intercambio: (json: string) => AssembledTransaction<Result<null, Error>>;
        get_deuda: (json: string) => AssembledTransaction<Result<Deuda, Error>>;
        get_deudas: (json: string) => AssembledTransaction<Result<[string, Deuda][], Error>>;
        pagar_deuda: (json: string) => AssembledTransaction<Result<bigint, Error>>;
        get_boveda: (json: string) => AssembledTransaction<Result<string, Error>>;
        configurar_boveda_rapida: (json: string) => AssembledTransaction<Result<null, Error>>;
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
     * Build a topics filter row for the "EvAbono" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evAbonoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvPrima" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evPrimaEventFilter(topicValues?: {
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
     * Build a topics filter row for the "EvOferta" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evOfertaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvSorteo" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evSorteoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvSubasta" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evSubastaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvCubierto" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evCubiertoEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvGarantia" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evGarantiaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvIniciada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evIniciadaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvOpciones" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evOpcionesEventFilter(topicValues?: {
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
     * Build a topics filter row for the "EvPropuesta" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evPropuestaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvFinalizada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evFinalizadaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvRequisitos" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evRequisitosEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvDeudaPagada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evDeudaPagadaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvIntercambio" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evIntercambioEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvBovedaRapida" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evBovedaRapidaEventFilter(): string[];
    /**
     * Build a topics filter row for the "EvBolsaRecuperada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evBolsaRecuperadaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvPropuestaRetirada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evPropuestaRetiradaEventFilter(topicValues?: {
        id?: number;
    }): string[];
    /**
     * Build a topics filter row for the "EvHistorialConfigurado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
     */
    evHistorialConfiguradoEventFilter(): string[];
}
