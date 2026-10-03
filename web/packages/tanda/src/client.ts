import {Tanda, Miembro, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Unirse a una tanda abierta: paga el colateral, que va directo a la bóveda.
   * El orden de llegada define el turno. Cuando entra el último, la tanda arranca.
   */
  unirse(args: { id: number; miembro: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Solo el creador, y solo mientras la tanda está `Abierta` (no se llenó):
   * devuelve a cada uno su colateral más su parte del rendimiento.
   */
  cancelar(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Reparte todo al terminar las rondas. CUALQUIERA puede llamarla.
   * Orden: retirar de la bóveda → cobrar multas → devolver colateral + rendimiento
   * → repartir multas y retenido entre los cumplidos.
   */
  finalizar(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Crea una tanda nueva en estado `Abierta` y devuelve su id.
   * El creador NO queda como miembro: si quiere participar, llama `unirse`.
   */
  crear_tanda(args: { creador: string | Address; token: string | Address; cuota: bigint; n_miembros: number; periodo_seg: bigint; penalidad_bps: number; cobertura_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  /**
   * Configura el contrato una sola vez: quién es el admin, qué bóveda usar y,
   * opcionalmente, quién puede marcar direcciones como verificadas (gancho SUGEF).
   */
  inicializar(args: { admin: string | Address; boveda: string | Address; verificador: string | Address | null }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Paga la cuota de la ronda ACTUAL. Si ya venció el plazo, cuenta como pago tarde:
   * suma un atraso y una multa pendiente (que se cobra del colateral al final).
   */
  pagar_cuota(args: { id: number; miembro: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Cierra la ronda vencida. CUALQUIERA puede llamarla (así nadie bloquea la tanda).
   * - Quien no pagó: su colateral cubre la cuota. Si no alcanza, queda moroso.
   * - El beneficiario de turno recibe la bolsa (o se retiene si es moroso).
   */
  cerrar_ronda(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * (P2) El verificador marca una dirección como verificada (KYC hecho fuera de la cadena).
   */
  marcar_verificado(args: { miembro: string | Address; verificado: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * (ronda actual, fecha límite, quiénes ya pagaron)
   */
  get_ronda(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<[number, bigint, Array<string>], Error>>>;
  get_tanda(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Tanda, Error>>>;
  get_miembros(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<[string, Miembro]>, Error>>>;
  /**
   * Cuántas tandas se han creado (los ids van de 1 a este número).
   */
  total_tandas(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Colateral que pagaría el próximo en unirse (para mostrarlo antes de firmar).
   */
  colateral_siguiente(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAAAAAJtVbmlyc2UgYSB1bmEgdGFuZGEgYWJpZXJ0YTogcGFnYSBlbCBjb2xhdGVyYWwsIHF1ZSB2YSBkaXJlY3RvIGEgbGEgYsOzdmVkYS4KRWwgb3JkZW4gZGUgbGxlZ2FkYSBkZWZpbmUgZWwgdHVybm8uIEN1YW5kbyBlbnRyYSBlbCDDumx0aW1vLCBsYSB0YW5kYSBhcnJhbmNhLgAAAAAGdW5pcnNlAAAAAAACAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAHbWllbWJybwAAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAIlTb2xvIGVsIGNyZWFkb3IsIHkgc29sbyBtaWVudHJhcyBsYSB0YW5kYSBlc3TDoSBgQWJpZXJ0YWAgKG5vIHNlIGxsZW7Dsyk6CmRldnVlbHZlIGEgY2FkYSB1bm8gc3UgY29sYXRlcmFsIG3DoXMgc3UgcGFydGUgZGVsIHJlbmRpbWllbnRvLgAAAAAAAAhjYW5jZWxhcgAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAMdSZXBhcnRlIHRvZG8gYWwgdGVybWluYXIgbGFzIHJvbmRhcy4gQ1VBTFFVSUVSQSBwdWVkZSBsbGFtYXJsYS4KT3JkZW46IHJldGlyYXIgZGUgbGEgYsOzdmVkYSDihpIgY29icmFyIG11bHRhcyDihpIgZGV2b2x2ZXIgY29sYXRlcmFsICsgcmVuZGltaWVudG8K4oaSIHJlcGFydGlyIG11bHRhcyB5IHJldGVuaWRvIGVudHJlIGxvcyBjdW1wbGlkb3MuAAAAAAlmaW5hbGl6YXIAAAAAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAIJDcmVhIHVuYSB0YW5kYSBudWV2YSBlbiBlc3RhZG8gYEFiaWVydGFgIHkgZGV2dWVsdmUgc3UgaWQuCkVsIGNyZWFkb3IgTk8gcXVlZGEgY29tbyBtaWVtYnJvOiBzaSBxdWllcmUgcGFydGljaXBhciwgbGxhbWEgYHVuaXJzZWAuAAAAAAALY3JlYXJfdGFuZGEAAAAABwAAAAAAAAAHY3JlYWRvcgAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABWN1b3RhAAAAAAAACwAAAAAAAAAKbl9taWVtYnJvcwAAAAAABAAAAAAAAAALcGVyaW9kb19zZWcAAAAABgAAAAAAAAANcGVuYWxpZGFkX2JwcwAAAAAAAAQAAAAAAAAADWNvYmVydHVyYV9icHMAAAAAAAAEAAAAAQAAA+kAAAAEAAAAAw==", "AAAAAAAAAJxDb25maWd1cmEgZWwgY29udHJhdG8gdW5hIHNvbGEgdmV6OiBxdWnDqW4gZXMgZWwgYWRtaW4sIHF1w6kgYsOzdmVkYSB1c2FyIHksCm9wY2lvbmFsbWVudGUsIHF1acOpbiBwdWVkZSBtYXJjYXIgZGlyZWNjaW9uZXMgY29tbyB2ZXJpZmljYWRhcyAoZ2FuY2hvIFNVR0VGKS4AAAALaW5pY2lhbGl6YXIAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAZib3ZlZGEAAAAAABMAAAAAAAAAC3ZlcmlmaWNhZG9yAAAAA+gAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAJ1QYWdhIGxhIGN1b3RhIGRlIGxhIHJvbmRhIEFDVFVBTC4gU2kgeWEgdmVuY2nDsyBlbCBwbGF6bywgY3VlbnRhIGNvbW8gcGFnbyB0YXJkZToKc3VtYSB1biBhdHJhc28geSB1bmEgbXVsdGEgcGVuZGllbnRlIChxdWUgc2UgY29icmEgZGVsIGNvbGF0ZXJhbCBhbCBmaW5hbCkuAAAAAAAAC3BhZ2FyX2N1b3RhAAAAAAIAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAdtaWVtYnJvAAAAABMAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAOVDaWVycmEgbGEgcm9uZGEgdmVuY2lkYS4gQ1VBTFFVSUVSQSBwdWVkZSBsbGFtYXJsYSAoYXPDrSBuYWRpZSBibG9xdWVhIGxhIHRhbmRhKS4KLSBRdWllbiBubyBwYWfDszogc3UgY29sYXRlcmFsIGN1YnJlIGxhIGN1b3RhLiBTaSBubyBhbGNhbnphLCBxdWVkYSBtb3Jvc28uCi0gRWwgYmVuZWZpY2lhcmlvIGRlIHR1cm5vIHJlY2liZSBsYSBib2xzYSAobyBzZSByZXRpZW5lIHNpIGVzIG1vcm9zbykuAAAAAAAADGNlcnJhcl9yb25kYQAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAFgoUDIpIEVsIHZlcmlmaWNhZG9yIG1hcmNhIHVuYSBkaXJlY2Npw7NuIGNvbW8gdmVyaWZpY2FkYSAoS1lDIGhlY2hvIGZ1ZXJhIGRlIGxhIGNhZGVuYSkuAAAAEW1hcmNhcl92ZXJpZmljYWRvAAAAAAAAAgAAAAAAAAAHbWllbWJybwAAAAATAAAAAAAAAAp2ZXJpZmljYWRvAAAAAAABAAAAAQAAA+kAAAACAAAAAw==", "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAAOWWFJbmljaWFsaXphZG8AAAAAAAEAAAAAAAAADE5vRW5jb250cmFkYQAAAAIAAAAAAAAADkVzdGFkb0ludmFsaWRvAAAAAAADAAAAAAAAABFQYXJhbWV0cm9JbnZhbGlkbwAAAAAAAAQAAAAAAAAAC1lhRXNNaWVtYnJvAAAAAAUAAAAAAAAAClRhbmRhTGxlbmEAAAAAAAYAAAAAAAAAC05vRXNNaWVtYnJvAAAAAAcAAAAAAAAABllhUGFnbwAAAAAACAAAAAAAAAAOUm9uZGFOb1ZlbmNpZGEAAAAAAAkAAAAAAAAADU1pZW1icm9Nb3Jvc28AAAAAAAAKAAAAAAAAAAxOb1ZlcmlmaWNhZG8AAAALAAAAAAAAAAxOb0F1dG9yaXphZG8AAAAMAAAAAAAAAA5Ob0luaWNpYWxpemFkbwAAAAAADQ==", "AAAAAQAAAAAAAAAAAAAABVRhbmRhAAAAAAAADQAAAAAAAAANY29iZXJ0dXJhX2JwcwAAAAAAAAQAAAAAAAAAB2NyZWFkb3IAAAAAEwAAAAAAAAAFY3VvdGEAAAAAAAALAAAAAAAAAAZlc3RhZG8AAAAAB9AAAAAGRXN0YWRvAAAAAAAqTXVsdGFzIGNvYnJhZGFzIChzZSBsbGVuYSBlbiBgZmluYWxpemFyYCkuAAAAAAANZm9uZG9fcHJlbWlvcwAAAAAAAAsAAABZTW9tZW50byAodGltZXN0YW1wKSBlbiBxdWUgYWJyacOzIGxhIHJvbmRhIGFjdHVhbC4gVmVuY2UgZW4gYGluaWNpb19yb25kYSArIHBlcmlvZG9fc2VnYC4AAAAAAAAMaW5pY2lvX3JvbmRhAAAABgAAAAAAAAAKbl9taWVtYnJvcwAAAAAABAAAAAAAAAANcGVuYWxpZGFkX2JwcwAAAAAAAAQAAAAAAAAAC3BlcmlvZG9fc2VnAAAAAAYAAAA7Qm9sc2FzIHF1ZSBubyBzZSBwYWdhcm9uIHBvcnF1ZSBlbCBiZW5lZmljaWFyaW8gZXJhIG1vcm9zby4AAAAACHJldGVuaWRvAAAACwAAAFRSb25kYSBlbiBjdXJzbzogMC4ubl9taWVtYnJvcy4gRW4gbGEgcm9uZGEgYHJgIGNvYnJhIGVsIG1pZW1icm8gY29uIGBwb3NpY2lvbiA9PSByYC4AAAAMcm9uZGFfYWN0dWFsAAAABAAAAE5QYXJ0aWNpcGFjaW9uZXMgZGUgRVNUQSB0YW5kYSBlbiBsYSBiw7N2ZWRhICh2YXJpYXMgdGFuZGFzIGNvbXBhcnRlbiBiw7N2ZWRhKS4AAAAAAA1zaGFyZXNfYm92ZWRhAAAAAAAACwAAAAAAAAAFdG9rZW4AAAAAAAAT", "AAAAAgAAAAAAAAAAAAAABkVzdGFkbwAAAAAABQAAAAAAAAAAAAAAB0FiaWVydGEAAAAAAAAAAAAAAAAGQWN0aXZhAAAAAAAAAAAAAAAAAAtQb3JMaXF1aWRhcgAAAAAAAAAAAAAAAApGaW5hbGl6YWRhAAAAAAAAAAAAAAAAAAlDYW5jZWxhZGEAAAA=", "AAAAAQAAAAAAAAAAAAAAB01pZW1icm8AAAAACAAAAAAAAAAHYXRyYXNvcwAAAAAEAAAAFVlhIHJlY2liacOzIHN1IHR1cm5vLgAAAAAAAAVjb2JybwAAAAAAAAEAAAA4Q29sYXRlcmFsIHF1ZSBsZSBxdWVkYSAoYmFqYSBzaSBjdWJyZSBpbXBhZ29zIG8gbXVsdGFzKS4AAAAJY29sYXRlcmFsAAAAAAAACwAAAAAAAAARY29sYXRlcmFsX2luaWNpYWwAAAAAAAALAAAALUN1b3RhcyBxdWUgc3UgY29sYXRlcmFsIG5vIGFsY2FuesOzIGEgY3VicmlyLgAAAAAAAAVkZXVkYQAAAAAAAAsAAAAAAAAABm1vcm9zbwAAAAAAAQAAAAAAAAARbXVsdGFzX3BlbmRpZW50ZXMAAAAAAAALAAAAHVR1cm5vOiAwIGNvYnJhIGVuIGxhIHJvbmRhIDAuAAAAAAAACHBvc2ljaW9uAAAABA==", "AAAABQAAAAAAAAAAAAAABkV2UGFnbwAAAAAAAQAAAARwYWdvAAAABAAAAAAAAAACaWQAAAAAAAQAAAABAAAAAAAAAAdtaWVtYnJvAAAAABMAAAAAAAAAAAAAAAVyb25kYQAAAAAAAAQAAAAAAAAAAAAAAAV0YXJkZQAAAAAAAAEAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAB0V2Um9uZGEAAAAAAQAAAAVyb25kYQAAAAAAAAQAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAFcm9uZGEAAAAAAAAEAAAAAAAAAAAAAAAMYmVuZWZpY2lhcmlvAAAAEwAAAAAAAAAAAAAADG1vbnRvX3BhZ2FkbwAAAAsAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAB0V2VW5pZG8AAAAAAQAAAAV1bmlkbwAAAAAAAAQAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAHbWllbWJybwAAAAATAAAAAAAAAAAAAAAIcG9zaWNpb24AAAAEAAAAAAAAAAAAAAAJY29sYXRlcmFsAAAAAAAACwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAACEV2Q3JlYWRhAAAAAQAAAAZjcmVhZGEAAAAAAAQAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAHY3JlYWRvcgAAAAATAAAAAAAAAAAAAAAFY3VvdGEAAAAAAAALAAAAAAAAAAAAAAAKbl9taWVtYnJvcwAAAAAABAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAACEV2TW9yb3NvAAAAAQAAAAZtb3Jvc28AAAAAAAMAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAHbWllbWJybwAAAAATAAAAAAAAAAAAAAAFZGV1ZGEAAAAAAAALAAAAAAAAAAI=", "AAAABQAAAERFbCBtb21lbnRvIGNsYXZlIGRlIGxhIGRlbW86ICJlbCBjb2xhdGVyYWwgZGUgQW5hIGN1YnJpw7Mgc3UgY3VvdGEiLgAAAAAAAAAKRXZDdWJpZXJ0bwAAAAAAAQAAAAhjdWJpZXJ0bwAAAAQAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAHbWllbWJybwAAAAATAAAAAAAAAAAAAAAFcm9uZGEAAAAAAAAEAAAAAAAAAAAAAAAFbW9udG8AAAAAAAALAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAACkV2SW5pY2lhZGEAAAAAAAEAAAAIaW5pY2lhZGEAAAACAAAAAAAAAAJpZAAAAAAABAAAAAEAAAAAAAAADGluaWNpb19yb25kYQAAAAYAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAC0V2Q2FuY2VsYWRhAAAAAAEAAAAJY2FuY2VsYWRhAAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAAC0V2TGlxdWlkYWRvAAAAAAEAAAAJbGlxdWlkYWRvAAAAAAAAAwAAAAAAAAACaWQAAAAAAAQAAAABAAAAAAAAAAdtaWVtYnJvAAAAABMAAAAAAAAAAAAAAAVtb250bwAAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAADEV2RmluYWxpemFkYQAAAAEAAAAKZmluYWxpemFkYQAAAAAABQAAAAAAAAACaWQAAAAAAAQAAAABAAAAAAAAAAtyZW5kaW1pZW50bwAAAAALAAAAAAAAAAAAAAANZm9uZG9fcHJlbWlvcwAAAAAAAAsAAAAAAAAAAAAAAAhyZXRlbmlkbwAAAAsAAAAAAAAARExvIHF1ZSBubyBzZSBwdWRvIHJlcGFydGlyIHBvcnF1ZSBubyBoYWLDrWEgYSBxdWnDqW4gKGNhc28gZXh0cmVtbykuAAAADHNpbl9yZXBhcnRpcgAAAAsAAAAAAAAAAg==", "AAAAAAAAADIocm9uZGEgYWN0dWFsLCBmZWNoYSBsw61taXRlLCBxdWnDqW5lcyB5YSBwYWdhcm9uKQAAAAAACWdldF9yb25kYQAAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAPtAAAAAwAAAAQAAAAGAAAD6gAAABMAAAAD", "AAAAAAAAAAAAAAAJZ2V0X3RhbmRhAAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAAFVGFuZGEAAAAAAAAD", "AAAAAAAAAAAAAAAMZ2V0X21pZW1icm9zAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAA+oAAAPtAAAAAgAAABMAAAfQAAAAB01pZW1icm8AAAAAAw==", "AAAAAAAAAEBDdcOhbnRhcyB0YW5kYXMgc2UgaGFuIGNyZWFkbyAobG9zIGlkcyB2YW4gZGUgMSBhIGVzdGUgbsO6bWVybykuAAAADHRvdGFsX3RhbmRhcwAAAAAAAAABAAAABA==", "AAAAAAAAAE5Db2xhdGVyYWwgcXVlIHBhZ2Fyw61hIGVsIHByw7N4aW1vIGVuIHVuaXJzZSAocGFyYSBtb3N0cmFybG8gYW50ZXMgZGUgZmlybWFyKS4AAAAAABNjb2xhdGVyYWxfc2lndWllbnRlAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAALAAAAAw=="]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    unirse : this.txFromJson<Result<null, Error>>,  cancelar : this.txFromJson<Result<null, Error>>,  finalizar : this.txFromJson<Result<null, Error>>,  crear_tanda : this.txFromJson<Result<number, Error>>,  inicializar : this.txFromJson<Result<null, Error>>,  pagar_cuota : this.txFromJson<Result<null, Error>>,  cerrar_ronda : this.txFromJson<Result<null, Error>>,  marcar_verificado : this.txFromJson<Result<null, Error>>,  get_ronda : this.txFromJson<Result<[number, bigint, Array<string>], Error>>,  get_tanda : this.txFromJson<Result<Tanda, Error>>,  get_miembros : this.txFromJson<Result<Array<[string, Miembro]>, Error>>,  total_tandas : this.txFromJson<number>,  colateral_siguiente : this.txFromJson<Result<bigint, Error>>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "EvPago" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evPagoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvPago", topicValues);
  }
  /**
   * Build a topics filter row for the "EvRonda" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evRondaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvRonda", topicValues);
  }
  /**
   * Build a topics filter row for the "EvUnido" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evUnidoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvUnido", topicValues);
  }
  /**
   * Build a topics filter row for the "EvCreada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evCreadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvCreada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvMoroso" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evMorosoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvMoroso", topicValues);
  }
  /**
   * Build a topics filter row for the "EvCubierto" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evCubiertoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvCubierto", topicValues);
  }
  /**
   * Build a topics filter row for the "EvIniciada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evIniciadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvIniciada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvCancelada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evCanceladaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvCancelada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvLiquidado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evLiquidadoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvLiquidado", topicValues);
  }
  /**
   * Build a topics filter row for the "EvFinalizada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evFinalizadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvFinalizada", topicValues);
  }
}