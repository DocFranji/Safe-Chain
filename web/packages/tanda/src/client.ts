import {Deuda, Tanda, Miembro, ContractEvent} from './types.js';
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
   * La deuda de `miembro` en la tanda `id`: a quién le debe (por ronda), su bolsa retenida si la
   * tiene, y cuánto ha pagado. Si nunca debió nada, todo vacío.
   */
  get_deuda(args: { id: number; miembro: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<Deuda, Error>>>;
  /**
   * Las deudas de la tanda `id` en una sola consulta: solo de quienes alguna vez debieron algo
   * (incluye a quienes ya saldaron: `faltantes` vacío y `pagado > 0`).
   */
  get_deudas(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<[string, Deuda]>, Error>>>;
  /**
   * Paga (toda o una parte) la deuda de `miembro` en la tanda `id`. Puede pagarla otra persona
   * (`pagador`, que es quien firma y de quien sale el dinero). Devuelve la deuda que queda.
   *
   * Solo mientras la tanda está `Activa` o `PorLiquidar`. No se puede pagar de más.
   */
  pagar_deuda(args: { id: number; miembro: string | Address; pagador: string | Address; monto: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * La bóveda donde está la garantía de la tanda `id` (la web la usa para mostrar el rendimiento).
   */
  get_boveda(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * (Solo el admin) Bóveda rápida para tandas de prueba (rondas de hasta 10 minutos).
   * `None` la quita. Solo afecta a las tandas que se creen después: cada tanda conserva la suya.
   */
  configurar_boveda_rapida(args: { boveda: string | Address | null }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
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
      new Spec(["AAAAAAAAAJtVbmlyc2UgYSB1bmEgdGFuZGEgYWJpZXJ0YTogcGFnYSBlbCBjb2xhdGVyYWwsIHF1ZSB2YSBkaXJlY3RvIGEgbGEgYsOzdmVkYS4KRWwgb3JkZW4gZGUgbGxlZ2FkYSBkZWZpbmUgZWwgdHVybm8uIEN1YW5kbyBlbnRyYSBlbCDDumx0aW1vLCBsYSB0YW5kYSBhcnJhbmNhLgAAAAAGdW5pcnNlAAAAAAACAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAHbWllbWJybwAAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAIlTb2xvIGVsIGNyZWFkb3IsIHkgc29sbyBtaWVudHJhcyBsYSB0YW5kYSBlc3TDoSBgQWJpZXJ0YWAgKG5vIHNlIGxsZW7Dsyk6CmRldnVlbHZlIGEgY2FkYSB1bm8gc3UgY29sYXRlcmFsIG3DoXMgc3UgcGFydGUgZGVsIHJlbmRpbWllbnRvLgAAAAAAAAhjYW5jZWxhcgAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAMdSZXBhcnRlIHRvZG8gYWwgdGVybWluYXIgbGFzIHJvbmRhcy4gQ1VBTFFVSUVSQSBwdWVkZSBsbGFtYXJsYS4KT3JkZW46IHJldGlyYXIgZGUgbGEgYsOzdmVkYSDihpIgY29icmFyIG11bHRhcyDihpIgZGV2b2x2ZXIgY29sYXRlcmFsICsgcmVuZGltaWVudG8K4oaSIHJlcGFydGlyIG11bHRhcyB5IHJldGVuaWRvIGVudHJlIGxvcyBjdW1wbGlkb3MuAAAAAAlmaW5hbGl6YXIAAAAAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAIJDcmVhIHVuYSB0YW5kYSBudWV2YSBlbiBlc3RhZG8gYEFiaWVydGFgIHkgZGV2dWVsdmUgc3UgaWQuCkVsIGNyZWFkb3IgTk8gcXVlZGEgY29tbyBtaWVtYnJvOiBzaSBxdWllcmUgcGFydGljaXBhciwgbGxhbWEgYHVuaXJzZWAuAAAAAAALY3JlYXJfdGFuZGEAAAAABwAAAAAAAAAHY3JlYWRvcgAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABWN1b3RhAAAAAAAACwAAAAAAAAAKbl9taWVtYnJvcwAAAAAABAAAAAAAAAALcGVyaW9kb19zZWcAAAAABgAAAAAAAAANcGVuYWxpZGFkX2JwcwAAAAAAAAQAAAAAAAAADWNvYmVydHVyYV9icHMAAAAAAAAEAAAAAQAAA+kAAAAEAAAAAw==", "AAAAAAAAAJxDb25maWd1cmEgZWwgY29udHJhdG8gdW5hIHNvbGEgdmV6OiBxdWnDqW4gZXMgZWwgYWRtaW4sIHF1w6kgYsOzdmVkYSB1c2FyIHksCm9wY2lvbmFsbWVudGUsIHF1acOpbiBwdWVkZSBtYXJjYXIgZGlyZWNjaW9uZXMgY29tbyB2ZXJpZmljYWRhcyAoZ2FuY2hvIFNVR0VGKS4AAAALaW5pY2lhbGl6YXIAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAZib3ZlZGEAAAAAABMAAAAAAAAAC3ZlcmlmaWNhZG9yAAAAA+gAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAJ1QYWdhIGxhIGN1b3RhIGRlIGxhIHJvbmRhIEFDVFVBTC4gU2kgeWEgdmVuY2nDsyBlbCBwbGF6bywgY3VlbnRhIGNvbW8gcGFnbyB0YXJkZToKc3VtYSB1biBhdHJhc28geSB1bmEgbXVsdGEgcGVuZGllbnRlIChxdWUgc2UgY29icmEgZGVsIGNvbGF0ZXJhbCBhbCBmaW5hbCkuAAAAAAAAC3BhZ2FyX2N1b3RhAAAAAAIAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAdtaWVtYnJvAAAAABMAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAOVDaWVycmEgbGEgcm9uZGEgdmVuY2lkYS4gQ1VBTFFVSUVSQSBwdWVkZSBsbGFtYXJsYSAoYXPDrSBuYWRpZSBibG9xdWVhIGxhIHRhbmRhKS4KLSBRdWllbiBubyBwYWfDszogc3UgY29sYXRlcmFsIGN1YnJlIGxhIGN1b3RhLiBTaSBubyBhbGNhbnphLCBxdWVkYSBtb3Jvc28uCi0gRWwgYmVuZWZpY2lhcmlvIGRlIHR1cm5vIHJlY2liZSBsYSBib2xzYSAobyBzZSByZXRpZW5lIHNpIGVzIG1vcm9zbykuAAAAAAAADGNlcnJhcl9yb25kYQAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAFgoUDIpIEVsIHZlcmlmaWNhZG9yIG1hcmNhIHVuYSBkaXJlY2Npw7NuIGNvbW8gdmVyaWZpY2FkYSAoS1lDIGhlY2hvIGZ1ZXJhIGRlIGxhIGNhZGVuYSkuAAAAEW1hcmNhcl92ZXJpZmljYWRvAAAAAAAAAgAAAAAAAAAHbWllbWJybwAAAAATAAAAAAAAAAp2ZXJpZmljYWRvAAAAAAABAAAAAQAAA+kAAAACAAAAAw==", "AAAAAQAAADZMYSBkZXVkYSBkZSB1biBtaWVtYnJvLCByb25kYSBwb3Igcm9uZGEgKGBnZXRfZGV1ZGFgKS4AAAAAAAAAAAAFRGV1ZGEAAAAAAAADAAAAWFN1IGJvbHNhLCBzaSBzZSByZXR1dm8gcG9ycXVlIGVyYSBtb3Jvc28gY3VhbmRvIGxlIHRvY2FiYSBjb2JyYXIuIExhIHJlY3VwZXJhIGFsIHNhbGRhci4AAAAOYm9sc2FfcmV0ZW5pZGEAAAAAAAsAAABTTG8gcXVlIHRvZGF2w61hIGRlYmUsIGRlbCBmYWx0YW50ZSBtw6FzIHZpZWpvIGFsIG3DoXMgbnVldm8uIFN1bWFuIGBNaWVtYnJvLmRldWRhYC4AAAAACWZhbHRhbnRlcwAAAAAAA+oAAAfQAAAACEZhbHRhbnRlAAAAU0N1w6FudG8gc2UgaGEgcGFnYWRvIGRlIHN1IGRldWRhIGhhc3RhIGFob3JhIChwb3IgZWwgbWllbWJybyBvIHBvciBvdHJhcyBwZXJzb25hcykuAAAAAAZwYWdhZG8AAAAAAAs=", "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEAAAAAAAAAAOWWFJbmljaWFsaXphZG8AAAAAAAEAAAAAAAAADE5vRW5jb250cmFkYQAAAAIAAAAAAAAADkVzdGFkb0ludmFsaWRvAAAAAAADAAAAAAAAABFQYXJhbWV0cm9JbnZhbGlkbwAAAAAAAAQAAAAAAAAAC1lhRXNNaWVtYnJvAAAAAAUAAAAAAAAAClRhbmRhTGxlbmEAAAAAAAYAAAAAAAAAC05vRXNNaWVtYnJvAAAAAAcAAAAAAAAABllhUGFnbwAAAAAACAAAAAAAAAAOUm9uZGFOb1ZlbmNpZGEAAAAAAAkAAAAAAAAADU1pZW1icm9Nb3Jvc28AAAAAAAAKAAAAAAAAAAxOb1ZlcmlmaWNhZG8AAAALAAAAAAAAAAxOb0F1dG9yaXphZG8AAAAMAAAAAAAAAA5Ob0luaWNpYWxpemFkbwAAAAAADQAAAAAAAAAIU2luRGV1ZGEAAAAOAAAAAAAAAAxQYWdvRXhjZXNpdm8AAAAPAAAAAAAAAA1Nb250b0ludmFsaWRvAAAAAAAAEA==", "AAAAAQAAAAAAAAAAAAAABVRhbmRhAAAAAAAADQAAAAAAAAANY29iZXJ0dXJhX2JwcwAAAAAAAAQAAAAAAAAAB2NyZWFkb3IAAAAAEwAAAAAAAAAFY3VvdGEAAAAAAAALAAAAAAAAAAZlc3RhZG8AAAAAB9AAAAAGRXN0YWRvAAAAAAAqTXVsdGFzIGNvYnJhZGFzIChzZSBsbGVuYSBlbiBgZmluYWxpemFyYCkuAAAAAAANZm9uZG9fcHJlbWlvcwAAAAAAAAsAAABZTW9tZW50byAodGltZXN0YW1wKSBlbiBxdWUgYWJyacOzIGxhIHJvbmRhIGFjdHVhbC4gVmVuY2UgZW4gYGluaWNpb19yb25kYSArIHBlcmlvZG9fc2VnYC4AAAAAAAAMaW5pY2lvX3JvbmRhAAAABgAAAAAAAAAKbl9taWVtYnJvcwAAAAAABAAAAAAAAAANcGVuYWxpZGFkX2JwcwAAAAAAAAQAAAAAAAAAC3BlcmlvZG9fc2VnAAAAAAYAAAA7Qm9sc2FzIHF1ZSBubyBzZSBwYWdhcm9uIHBvcnF1ZSBlbCBiZW5lZmljaWFyaW8gZXJhIG1vcm9zby4AAAAACHJldGVuaWRvAAAACwAAAFRSb25kYSBlbiBjdXJzbzogMC4ubl9taWVtYnJvcy4gRW4gbGEgcm9uZGEgYHJgIGNvYnJhIGVsIG1pZW1icm8gY29uIGBwb3NpY2lvbiA9PSByYC4AAAAMcm9uZGFfYWN0dWFsAAAABAAAAE5QYXJ0aWNpcGFjaW9uZXMgZGUgRVNUQSB0YW5kYSBlbiBsYSBiw7N2ZWRhICh2YXJpYXMgdGFuZGFzIGNvbXBhcnRlbiBiw7N2ZWRhKS4AAAAAAA1zaGFyZXNfYm92ZWRhAAAAAAAACwAAAAAAAAAFdG9rZW4AAAAAAAAT", "AAAAAgAAAAAAAAAAAAAABkVzdGFkbwAAAAAABQAAAAAAAAAAAAAAB0FiaWVydGEAAAAAAAAAAAAAAAAGQWN0aXZhAAAAAAAAAAAAAAAAAAtQb3JMaXF1aWRhcgAAAAAAAAAAAAAAAApGaW5hbGl6YWRhAAAAAAAAAAAAAAAAAAlDYW5jZWxhZGEAAAA=", "AAAAAQAAAAAAAAAAAAAAB01pZW1icm8AAAAACAAAAAAAAAAHYXRyYXNvcwAAAAAEAAAAFVlhIHJlY2liacOzIHN1IHR1cm5vLgAAAAAAAAVjb2JybwAAAAAAAAEAAAA4Q29sYXRlcmFsIHF1ZSBsZSBxdWVkYSAoYmFqYSBzaSBjdWJyZSBpbXBhZ29zIG8gbXVsdGFzKS4AAAAJY29sYXRlcmFsAAAAAAAACwAAAAAAAAARY29sYXRlcmFsX2luaWNpYWwAAAAAAAALAAAALUN1b3RhcyBxdWUgc3UgY29sYXRlcmFsIG5vIGFsY2FuesOzIGEgY3VicmlyLgAAAAAAAAVkZXVkYQAAAAAAAAsAAAAAAAAABm1vcm9zbwAAAAAAAQAAAAAAAAARbXVsdGFzX3BlbmRpZW50ZXMAAAAAAAALAAAAHVR1cm5vOiAwIGNvYnJhIGVuIGxhIHJvbmRhIDAuAAAAAAAACHBvc2ljaW9uAAAABA==", "AAAAAQAAALBVbmEgcGFydGUgZGUgbGEgZGV1ZGEgZGUgdW4gbW9yb3NvOiBsbyBxdWUgc3UgZ2FyYW50w61hIG5vIGFsY2FuesOzIGEgY3VicmlyIGVuIGxhIHJvbmRhIGByb25kYWAKeSBhIHF1acOpbiBzZSBsZSBkZWJlIChgYWNyZWVkb3JgOiBxdWllbiBjb2Jyw7MgZXNhIHJvbmRhIHkgcmVjaWJpw7MgZGUgbWVub3MpLgAAAAAAAAAIRmFsdGFudGUAAAADAAAAAAAAAAhhY3JlZWRvcgAAABMAAAAAAAAABW1vbnRvAAAAAAAACwAAAAAAAAAFcm9uZGEAAAAAAAAE", "AAAABQAAAAAAAAAAAAAABkV2UGFnbwAAAAAAAQAAAARwYWdvAAAABAAAAAAAAAACaWQAAAAAAAQAAAABAAAAAAAAAAdtaWVtYnJvAAAAABMAAAAAAAAAAAAAAAVyb25kYQAAAAAAAAQAAAAAAAAAAAAAAAV0YXJkZQAAAAAAAAEAAAAAAAAAAg==", "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", "AAAAAAAAAQVQYWdhICh0b2RhIG8gdW5hIHBhcnRlKSBsYSBkZXVkYSBkZSBgbWllbWJyb2AgZW4gbGEgdGFuZGEgYGlkYC4gUHVlZGUgcGFnYXJsYSBvdHJhIHBlcnNvbmEKKGBwYWdhZG9yYCwgcXVlIGVzIHF1aWVuIGZpcm1hIHkgZGUgcXVpZW4gc2FsZSBlbCBkaW5lcm8pLiBEZXZ1ZWx2ZSBsYSBkZXVkYSBxdWUgcXVlZGEuCgpTb2xvIG1pZW50cmFzIGxhIHRhbmRhIGVzdMOhIGBBY3RpdmFgIG8gYFBvckxpcXVpZGFyYC4gTm8gc2UgcHVlZGUgcGFnYXIgZGUgbcOhcy4AAAAAAAALcGFnYXJfZGV1ZGEAAAAABAAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB21pZW1icm8AAAAAEwAAAAAAAAAHcGFnYWRvcgAAAAATAAAAAAAAAAVtb250bwAAAAAAAAsAAAABAAAD6QAAAAsAAAAD", "AAAAAAAAAGFMYSBiw7N2ZWRhIGRvbmRlIGVzdMOhIGxhIGdhcmFudMOtYSBkZSBsYSB0YW5kYSBgaWRgIChsYSB3ZWIgbGEgdXNhIHBhcmEgbW9zdHJhciBlbCByZW5kaW1pZW50bykuAAAAAAAACmdldF9ib3ZlZGEAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAATAAAAAw==", "AAAAAAAAALEoU29sbyBlbCBhZG1pbikgQsOzdmVkYSByw6FwaWRhIHBhcmEgdGFuZGFzIGRlIHBydWViYSAocm9uZGFzIGRlIGhhc3RhIDEwIG1pbnV0b3MpLgpgTm9uZWAgbGEgcXVpdGEuIFNvbG8gYWZlY3RhIGEgbGFzIHRhbmRhcyBxdWUgc2UgY3JlZW4gZGVzcHXDqXM6IGNhZGEgdGFuZGEgY29uc2VydmEgbGEgc3V5YS4AAAAAAAAYY29uZmlndXJhcl9ib3ZlZGFfcmFwaWRhAAAAAQAAAAAAAAAGYm92ZWRhAAAAAAPoAAAAEwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAADIocm9uZGEgYWN0dWFsLCBmZWNoYSBsw61taXRlLCBxdWnDqW5lcyB5YSBwYWdhcm9uKQAAAAAACWdldF9yb25kYQAAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAPtAAAAAwAAAAQAAAAGAAAD6gAAABMAAAAD", "AAAAAAAAAAAAAAAJZ2V0X3RhbmRhAAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAAFVGFuZGEAAAAAAAAD", "AAAAAAAAAAAAAAAMZ2V0X21pZW1icm9zAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAA+oAAAPtAAAAAgAAABMAAAfQAAAAB01pZW1icm8AAAAAAw==", "AAAAAAAAAEBDdcOhbnRhcyB0YW5kYXMgc2UgaGFuIGNyZWFkbyAobG9zIGlkcyB2YW4gZGUgMSBhIGVzdGUgbsO6bWVybykuAAAADHRvdGFsX3RhbmRhcwAAAAAAAAABAAAABA==", "AAAAAAAAAE5Db2xhdGVyYWwgcXVlIHBhZ2Fyw61hIGVsIHByw7N4aW1vIGVuIHVuaXJzZSAocGFyYSBtb3N0cmFybG8gYW50ZXMgZGUgZmlybWFyKS4AAAAAABNjb2xhdGVyYWxfc2lndWllbnRlAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAALAAAAAw=="]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    unirse : this.txFromJson<Result<null, Error>>,  cancelar : this.txFromJson<Result<null, Error>>,  finalizar : this.txFromJson<Result<null, Error>>,  crear_tanda : this.txFromJson<Result<number, Error>>,  inicializar : this.txFromJson<Result<null, Error>>,  pagar_cuota : this.txFromJson<Result<null, Error>>,  cerrar_ronda : this.txFromJson<Result<null, Error>>,  marcar_verificado : this.txFromJson<Result<null, Error>>,  get_deuda : this.txFromJson<Result<Deuda, Error>>,  get_deudas : this.txFromJson<Result<Array<[string, Deuda]>, Error>>,  pagar_deuda : this.txFromJson<Result<bigint, Error>>,  get_boveda : this.txFromJson<Result<string, Error>>,  configurar_boveda_rapida : this.txFromJson<Result<null, Error>>,  get_ronda : this.txFromJson<Result<[number, bigint, Array<string>], Error>>,  get_tanda : this.txFromJson<Result<Tanda, Error>>,  get_miembros : this.txFromJson<Result<Array<[string, Miembro]>, Error>>,  total_tandas : this.txFromJson<number>,  colateral_siguiente : this.txFromJson<Result<bigint, Error>>
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
   * Build a topics filter row for the "EvAbono" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evAbonoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvAbono", topicValues);
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
  /**
   * Build a topics filter row for the "EvDeudaPagada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evDeudaPagadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvDeudaPagada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvBovedaRapida" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evBovedaRapidaEventFilter(): string[] {
    return this.spec.eventTopicFilter("EvBovedaRapida");
  }
  /**
   * Build a topics filter row for the "EvBolsaRecuperada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evBolsaRecuperadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvBolsaRecuperada", topicValues);
  }
}