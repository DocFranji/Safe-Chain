import {Nivel, Reglas, Historial, HechoMiembro, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  apodo(args: { quien: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  nivel(args: { dir: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Nivel>>;
  reglas(options?: MethodOptions): Promise<AssembledTransaction<Result<Reglas, Error>>>;
  puntaje(args: { dir: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  es_emisor(args: { dir: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Acumulados de `dir` (todo en cero si no tiene historial).
   */
  historial(args: { dir: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Historial>>;
  /**
   * (v4, N2) ¿Tiene una mora sin saldar en alguna tanda? (`veces_moroso > deudas_saldadas`).
   * Las tandas lo usan para no dejar unirse a quien debe.
   */
  tiene_mora(args: { dir: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Una sola vez: guarda el admin y las reglas por defecto.
   */
  inicializar(args: { admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Pone (o cambia) el apodo de `quien`. Solo `quien` puede hacerlo.
   */
  poner_apodo(args: { quien: string | Address; apodo: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Quita el apodo de `quien`. Solo `quien` puede hacerlo.
   */
  quitar_apodo(args: { quien: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * (emisor autorizado) Agrega hechos de la tanda `tanda_id`, cuya cuota es `cuota`.
   * Desde otro contrato, `emisor.require_auth()` se cumple solo si quien llama ES el emisor.
   */
  registrar_lote(args: { emisor: string | Address; tanda_id: number; cuota: bigint; hechos: Array<HechoMiembro> }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * (admin) Impide escrituras FUTURAS de un emisor. No borra nada de lo que ya escribió.
   */
  revocar_emisor(args: { emisor: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Puntos positivos que `miembro` ya ganó en la tanda `tanda_id` del contrato `emisor`.
   */
  puntos_en_tanda(args: { emisor: string | Address; tanda_id: number; miembro: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * (admin) Permite que un contrato de tanda escriba hechos. Público y con evento.
   */
  autorizar_emisor(args: { emisor: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * (admin) Cambia las reglas anti-inflado para hechos futuros.
   */
  configurar_reglas(args: { reglas: Reglas }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Descuento de garantía que le corresponde a `dir`, en puntos básicos.
   */
  beneficio_colateral_bps(args: { dir: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAOWWFJbmljaWFsaXphZG8AAAAAAAEAAAAAAAAADk5vSW5pY2lhbGl6YWRvAAAAAAACAAAAPVF1aWVuIGludGVudGEgZXNjcmliaXIgbm8gZXMgdW4gY29udHJhdG8gZGUgdGFuZGEgYXV0b3JpemFkby4AAAAAAAAMTm9BdXRvcml6YWRvAAAAAwAAAAAAAAARUGFyYW1ldHJvSW52YWxpZG8AAAAAAAAEAAAAOCh2NCkgRWwgYXBvZG8gbm8gY3VtcGxlIGxhcyByZWdsYXMgKGxhcmdvIG8gY2FyYWN0ZXJlcykuAAAADUFwb2RvSW52YWxpZG8AAAAAAAAF", "AAAAAgAAACxMbyBxdWUgcHVlZGUgcGFzYXJsZSBhIGFsZ3VpZW4gZW4gdW5hIHRhbmRhLgAAAAAAAAAFSGVjaG8AAAAAAAAIAAAAAAAAACtQYWfDsyBzdSBjdW90YSBhbnRlcyBkZWwgdmVuY2ltaWVudG8gKCsxMCkuAAAAAAxDdW90YUFUaWVtcG8AAAAAAAAALVBhZ8OzIHN1IGN1b3RhIGRlc3B1w6lzIGRlbCB2ZW5jaW1pZW50byAoKzMpLgAAAAAAAApDdW90YVRhcmRlAAAAAAAAAAAAMU5vIHBhZ8OzIHkgc3UgZ2FyYW50w61hIGN1YnJpw7MgbGEgY3VvdGEgKOKIkjE1KS4AAAAAAAANQ3VvdGFDdWJpZXJ0YQAAAAAAAAAAAAAzU3UgZ2FyYW50w61hIG5vIGFsY2FuesOzOiBxdWVkw7MgZGViaWVuZG8gKOKIkjEwMCkuAAAAAAZNb3Jvc28AAAAAAAAAAAAsUGFnw7MgdG9kYSBzdSBkZXVkYSAoKzYwKS4gTm8gYm9ycmEgbGEgbW9yYS4AAAAMRGV1ZGFTYWxkYWRhAAAAAAAAAC1UZXJtaW7DsyB1bmEgdGFuZGEgc2luIGF0cmFzb3MgbmkgbW9yYSAoKzUwKS4AAAAAAAANVGFuZGFDdW1wbGlkYQAAAAAAAAAAAAAvVGVybWluw7MgdW5hIHRhbmRhIGNvbiBhdHJhc29zLCBzaW4gbW9yYSAoKzI1KS4AAAAAD1RhbmRhQ29uQXRyYXNvcwAAAAAAAAAAL1JlY2liacOzIHN1IGJvbHNhICgwIHB1bnRvcywgc29sbyBpbmZvcm1hdGl2bykuAAAAAAVDb2JybwAAAA==", "AAAAAwAAAAAAAAAAAAAABU5pdmVsAAAAAAAABAAAAAAAAAAFTnVldm8AAAAAAAAAAAAAAAAAAAZCcm9uY2UAAAAAAAEAAAAAAAAABVBsYXRhAAAAAAAAAgAAAAAAAAADT3JvAAAAAAM=", "AAAAAQAAAFRSZWdsYXMgYW50aS1pbmZsYWRvLiBTZSBhcGxpY2FuIHNvbG8gYSBoZWNob3MgZnV0dXJvczogbG8geWEgZ2FuYWRvIG5vIHNlIHJlY2FsY3VsYS4AAAAAAAAABlJlZ2xhcwAAAAAAAgAAAEtMb3MgcHVudG9zIHBvc2l0aXZvcyBzb2xvIGN1ZW50YW4gZW4gdGFuZGFzIGNvbiBjdW90YSBpZ3VhbCBvIG1heW9yIGEgZXN0YS4AAAAADGN1b3RhX21pbmltYQAAAAsAAABETcOheGltbyBkZSBwdW50b3MgcG9zaXRpdm9zIHF1ZSB1bmEgcGVyc29uYSBnYW5hIGVuIHVuYSBtaXNtYSB0YW5kYS4AAAAOdG9wZV9wb3JfdGFuZGEAAAAAAAQ=", "AAAABQAAADsodjQpIEFsZ3VpZW4gcHVzbyAobyBxdWl0w7MsIGNvbiBgTm9uZWApIHN1IGFwb2RvIHDDumJsaWNvLgAAAAAAAAAAB0V2QXBvZG8AAAAAAQAAAAVhcG9kbwAAAAAAAAIAAAAAAAAABXF1aWVuAAAAAAAAEwAAAAEAAAAAAAAABWFwb2RvAAAAAAAD6AAAABAAAAAAAAAAAg==", "AAAABQAAAFxVbiBoZWNobyBudWV2byBlbiBlbCBoaXN0b3JpYWwgZGUgYG1pZW1icm9gLiBFc3RlIGVzIGVsIHJlZ2lzdHJvIGlubXV0YWJsZSwgaGVjaG8gcG9yIGhlY2hvLgAAAAAAAAAHRXZIZWNobwAAAAABAAAACmhpc3RfaGVjaG8AAAAAAAYAAAAAAAAAB21pZW1icm8AAAAAEwAAAAEAAAAiQ29udHJhdG8gZGUgdGFuZGEgcXVlIGxvIHJlcG9ydMOzLgAAAAAABmVtaXNvcgAAAAAAEwAAAAAAAAAAAAAACHRhbmRhX2lkAAAABAAAAAAAAAAAAAAABWhlY2hvAAAAAAAH0AAAAAVIZWNobwAAAAAAAAAAAAAAAAAABW1vbnRvAAAAAAAACwAAAAAAAAA5UHVudG9zIHF1ZSBzdW3DsyAobyByZXN0w7MpLCB5YSBjb24gbGFzIHJlZ2xhcyBhcGxpY2FkYXMuAAAAAAAABnB1bnRvcwAAAAAABQAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAACEV2UmVnbGFzAAAAAQAAAAZyZWdsYXMAAAAAAAIAAAAAAAAADGN1b3RhX21pbmltYQAAAAsAAAAAAAAAAAAAAA50b3BlX3Bvcl90YW5kYQAAAAAABAAAAAAAAAAC", "AAAAAQAAADNBY3VtdWxhZG9zIGRlIHVuYSBkaXJlY2Npw7NuLiBUb2RvIGVtcGllemEgZW4gY2Vyby4AAAAAAAAAAAlIaXN0b3JpYWwAAAAAAAANAAAAAAAAAAZjb2Jyb3MAAAAAAAQAAAAAAAAAD2N1b3Rhc19hX3RpZW1wbwAAAAAEAAAAAAAAABBjdW90YXNfY3ViaWVydGFzAAAABAAAAAAAAAAMY3VvdGFzX3RhcmRlAAAABAAAAAAAAAAPZGV1ZGFzX3NhbGRhZGFzAAAAAAQAAAA/U3VtYSBkZSBsYXMgY3VvdGFzIHF1ZSBwYWfDsyBkZSBzdSBib2xzaWxsbyAoYSB0aWVtcG8gbyB0YXJkZSkuAAAAAAxtb250b19wYWdhZG8AAAALAAAARk1vbWVudG8gKHRpbWVzdGFtcCkgZGVsIHByaW1lciB5IGRlbCDDumx0aW1vIGhlY2hvLiAwID0gc2luIGhpc3RvcmlhbC4AAAAAABFwcmltZXJhX2FjdGl2aWRhZAAAAAAAAAYAAAAdUHVudG9zIHBlcmRpZG9zLiBOdW5jYSBiYWphbi4AAAAAAAAQcHVudG9zX25lZ2F0aXZvcwAAAAQAAAA5UHVudG9zIGdhbmFkb3MsIHlhIGNvbiBsYXMgcmVnbGFzIGFudGktaW5mbGFkbyBhcGxpY2FkYXMuAAAAAAAAEHB1bnRvc19wb3NpdGl2b3MAAAAEAAAAAAAAABJ0YW5kYXNfY29uX2F0cmFzb3MAAAAAAAQAAAAAAAAAEHRhbmRhc19jdW1wbGlkYXMAAAAEAAAAAAAAABB1bHRpbWFfYWN0aXZpZGFkAAAABgAAAAAAAAAMdmVjZXNfbW9yb3NvAAAABA==", "AAAAAQAAADBVbiBoZWNobyBkZSB1biBtaWVtYnJvLCBjb21vIGxvIGVudsOtYSBsYSB0YW5kYS4AAAAAAAAADEhlY2hvTWllbWJybwAAAAMAAAAAAAAABWhlY2hvAAAAAAAH0AAAAAVIZWNobwAAAAAAAAAAAAAHbWllbWJybwAAAAATAAAAUk1vbnRvIHJlbGFjaW9uYWRvIChjdW90YSBwYWdhZGEsIG1vbnRvIGN1YmllcnRvLCBkZXVkYSwgYm9sc2EuLi4pLiBOdW5jYSBuZWdhdGl2by4AAAAAAAVtb250bwAAAAAAAAs=", "AAAABQAAAAAAAAAAAAAAEEV2RW1pc29yUmV2b2NhZG8AAAABAAAACWVtaXNvcl9ubwAAAAAAAAEAAAAAAAAABmVtaXNvcgAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEkV2RW1pc29yQXV0b3JpemFkbwAAAAAAAQAAAAllbWlzb3Jfb2sAAAAAAAABAAAAAAAAAAZlbWlzb3IAAAAAABMAAAAAAAAAAg==", "AAAAAAAAAAAAAAAFYXBvZG8AAAAAAAABAAAAAAAAAAVxdWllbgAAAAAAABMAAAABAAAD6AAAABA=", "AAAAAAAAAAAAAAAFbml2ZWwAAAAAAAABAAAAAAAAAANkaXIAAAAAEwAAAAEAAAfQAAAABU5pdmVsAAAA", "AAAAAAAAAAAAAAAGcmVnbGFzAAAAAAAAAAAAAQAAA+kAAAfQAAAABlJlZ2xhcwAAAAAAAw==", "AAAAAAAAAAAAAAAHcHVudGFqZQAAAAABAAAAAAAAAANkaXIAAAAAEwAAAAEAAAAE", "AAAAAAAAAAAAAAAJZXNfZW1pc29yAAAAAAAAAQAAAAAAAAADZGlyAAAAABMAAAABAAAAAQ==", "AAAAAAAAADlBY3VtdWxhZG9zIGRlIGBkaXJgICh0b2RvIGVuIGNlcm8gc2kgbm8gdGllbmUgaGlzdG9yaWFsKS4AAAAAAAAJaGlzdG9yaWFsAAAAAAAAAQAAAAAAAAADZGlyAAAAABMAAAABAAAH0AAAAAlIaXN0b3JpYWwAAAA=", "AAAAAAAAAI8odjQsIE4yKSDCv1RpZW5lIHVuYSBtb3JhIHNpbiBzYWxkYXIgZW4gYWxndW5hIHRhbmRhPyAoYHZlY2VzX21vcm9zbyA+IGRldWRhc19zYWxkYWRhc2ApLgpMYXMgdGFuZGFzIGxvIHVzYW4gcGFyYSBubyBkZWphciB1bmlyc2UgYSBxdWllbiBkZWJlLgAAAAAKdGllbmVfbW9yYQAAAAAAAQAAAAAAAAADZGlyAAAAABMAAAABAAAAAQ==", "AAAAAAAAADdVbmEgc29sYSB2ZXo6IGd1YXJkYSBlbCBhZG1pbiB5IGxhcyByZWdsYXMgcG9yIGRlZmVjdG8uAAAAAAtpbmljaWFsaXphcgAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAEBQb25lIChvIGNhbWJpYSkgZWwgYXBvZG8gZGUgYHF1aWVuYC4gU29sbyBgcXVpZW5gIHB1ZWRlIGhhY2VybG8uAAAAC3BvbmVyX2Fwb2RvAAAAAAIAAAAAAAAABXF1aWVuAAAAAAAAEwAAAAAAAAAFYXBvZG8AAAAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAADZRdWl0YSBlbCBhcG9kbyBkZSBgcXVpZW5gLiBTb2xvIGBxdWllbmAgcHVlZGUgaGFjZXJsby4AAAAAAAxxdWl0YXJfYXBvZG8AAAABAAAAAAAAAAVxdWllbgAAAAAAABMAAAAA", "AAAAAAAAAKkoZW1pc29yIGF1dG9yaXphZG8pIEFncmVnYSBoZWNob3MgZGUgbGEgdGFuZGEgYHRhbmRhX2lkYCwgY3V5YSBjdW90YSBlcyBgY3VvdGFgLgpEZXNkZSBvdHJvIGNvbnRyYXRvLCBgZW1pc29yLnJlcXVpcmVfYXV0aCgpYCBzZSBjdW1wbGUgc29sbyBzaSBxdWllbiBsbGFtYSBFUyBlbCBlbWlzb3IuAAAAAAAADnJlZ2lzdHJhcl9sb3RlAAAAAAAEAAAAAAAAAAZlbWlzb3IAAAAAABMAAAAAAAAACHRhbmRhX2lkAAAABAAAAAAAAAAFY3VvdGEAAAAAAAALAAAAAAAAAAZoZWNob3MAAAAAA+oAAAfQAAAADEhlY2hvTWllbWJybwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAFUoYWRtaW4pIEltcGlkZSBlc2NyaXR1cmFzIEZVVFVSQVMgZGUgdW4gZW1pc29yLiBObyBib3JyYSBuYWRhIGRlIGxvIHF1ZSB5YSBlc2NyaWJpw7MuAAAAAAAADnJldm9jYXJfZW1pc29yAAAAAAABAAAAAAAAAAZlbWlzb3IAAAAAABMAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAFVQdW50b3MgcG9zaXRpdm9zIHF1ZSBgbWllbWJyb2AgeWEgZ2Fuw7MgZW4gbGEgdGFuZGEgYHRhbmRhX2lkYCBkZWwgY29udHJhdG8gYGVtaXNvcmAuAAAAAAAAD3B1bnRvc19lbl90YW5kYQAAAAADAAAAAAAAAAZlbWlzb3IAAAAAABMAAAAAAAAACHRhbmRhX2lkAAAABAAAAAAAAAAHbWllbWJybwAAAAATAAAAAQAAAAQ=", "AAAAAAAAAE8oYWRtaW4pIFBlcm1pdGUgcXVlIHVuIGNvbnRyYXRvIGRlIHRhbmRhIGVzY3JpYmEgaGVjaG9zLiBQw7pibGljbyB5IGNvbiBldmVudG8uAAAAABBhdXRvcml6YXJfZW1pc29yAAAAAQAAAAAAAAAGZW1pc29yAAAAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAADsoYWRtaW4pIENhbWJpYSBsYXMgcmVnbGFzIGFudGktaW5mbGFkbyBwYXJhIGhlY2hvcyBmdXR1cm9zLgAAAAARY29uZmlndXJhcl9yZWdsYXMAAAAAAAABAAAAAAAAAAZyZWdsYXMAAAAAB9AAAAAGUmVnbGFzAAAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAEZEZXNjdWVudG8gZGUgZ2FyYW50w61hIHF1ZSBsZSBjb3JyZXNwb25kZSBhIGBkaXJgLCBlbiBwdW50b3MgYsOhc2ljb3MuAAAAAAAXYmVuZWZpY2lvX2NvbGF0ZXJhbF9icHMAAAAAAQAAAAAAAAADZGlyAAAAABMAAAABAAAABA=="]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    apodo : this.txFromJson<string | null>,  nivel : this.txFromJson<Nivel>,  reglas : this.txFromJson<Result<Reglas, Error>>,  puntaje : this.txFromJson<number>,  es_emisor : this.txFromJson<boolean>,  historial : this.txFromJson<Historial>,  tiene_mora : this.txFromJson<boolean>,  inicializar : this.txFromJson<Result<null, Error>>,  poner_apodo : this.txFromJson<Result<null, Error>>,  quitar_apodo : this.txFromJson<void>,  registrar_lote : this.txFromJson<Result<null, Error>>,  revocar_emisor : this.txFromJson<Result<null, Error>>,  puntos_en_tanda : this.txFromJson<number>,  autorizar_emisor : this.txFromJson<Result<null, Error>>,  configurar_reglas : this.txFromJson<Result<null, Error>>,  beneficio_colateral_bps : this.txFromJson<number>
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
   * Build a topics filter row for the "EvApodo" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evApodoEventFilter(topicValues?: { quien?: string | Address }): string[] {
    return this.spec.eventTopicFilter("EvApodo", topicValues);
  }
  /**
   * Build a topics filter row for the "EvHecho" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evHechoEventFilter(topicValues?: { miembro?: string | Address }): string[] {
    return this.spec.eventTopicFilter("EvHecho", topicValues);
  }
  /**
   * Build a topics filter row for the "EvReglas" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evReglasEventFilter(): string[] {
    return this.spec.eventTopicFilter("EvReglas");
  }
  /**
   * Build a topics filter row for the "EvEmisorRevocado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evEmisorRevocadoEventFilter(): string[] {
    return this.spec.eventTopicFilter("EvEmisorRevocado");
  }
  /**
   * Build a topics filter row for the "EvEmisorAutorizado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evEmisorAutorizadoEventFilter(): string[] {
    return this.spec.eventTopicFilter("EvEmisorAutorizado");
  }
}