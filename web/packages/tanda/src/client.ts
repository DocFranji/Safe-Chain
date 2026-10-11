import {Requisitos, OpcionesTanda, EstadoTurnos, Deuda, Tanda, Miembro, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Unirse a una tanda abierta: paga el colateral, que va directo a la bóveda.
   * El orden de llegada define el turno (salvo que la tanda use otro modo de turnos,
   * ver `turnos.rs`). Cuando entra el último, la tanda arranca.
   */
  unirse(args: { id: number; miembro: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Solo el creador, y solo mientras la tanda está `Abierta` (no se llenó):
   * devuelve a cada uno su colateral más su parte del rendimiento.
   */
  cancelar(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Reparte todo al terminar las rondas. CUALQUIERA puede llamarla.
   * Orden: retirar de la bóveda → repartir la garantía de los morosos entre quienes cobraron de menos
   * (v5) → cobrar multas → devolver colateral + rendimiento → repartir multas y retenido entre los
   * cumplidos.
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
   * - Quien no pagó: antes de su turno (fijo), su colateral cubre la cuota si alcanza para esa cuota
   * (como en la v4: lo respalda su pozo). En los demás casos (ya cobró, es su ronda o subasta), solo si
   * alcanza para todas las que le quedan (v5). Si no, la cuota queda como deuda, su colateral no se
   * toca y queda moroso.
   * - El beneficiario de turno recibe la bolsa (o se retiene si es moroso).
   * - (M1 v4) Si TODOS pagaron, se puede cerrar antes de que venza (menos en la subasta). Las
   * fechas no se mueven: la ronda siguiente vence cuando le tocaba.
   */
  cerrar_ronda(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * (P2) El verificador marca una dirección como verificada (KYC hecho fuera de la cadena).
   */
  marcar_verificado(args: { miembro: string | Address; verificado: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  get_historial(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  get_requisitos(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Requisitos, Error>>>;
  /**
   * (admin) Conecta el contrato de historial (o lo desconecta con `None`).
   * La tanda debe estar autorizada como emisor en el historial para que sus hechos cuenten.
   */
  configurar_historial(args: { historial: string | Address | null }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * (creador) Requisitos de historial de la tanda `id`. Solo mientras está abierta y sin miembros,
   * para que nadie entre con unas reglas y después le cambien otras.
   */
  configurar_requisitos(args: { id: number; puntaje_minimo: number; descuento: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Garantía que dejaría `miembro` si se uniera ahora, con el descuento de su historial
   * (para mostrarla antes de firmar).
   */
  colateral_para_miembro(args: { id: number; miembro: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * La bóveda registrada para `token`, o `None` si ese token sigue la regla general.
   */
  get_boveda_token(args: { token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * (Solo el admin) Bóveda para las tandas nuevas en `token`. `None` quita el registro y el token
   * vuelve a la regla general. Si la bóveda dice qué token guarda (el adaptador de Blend lo dice),
   * tiene que ser `token`.
   */
  registrar_boveda(args: { token: string | Address; boveda: string | Address | null }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Subasta: ofrecer recibir `descuento_bps` menos de la bolsa para cobrar en la ronda en
   * curso. Debe superar la mejor oferta y se acepta solo hasta que vence la ronda.
   */
  ofertar(args: { id: number; miembro: string | Address; descuento_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Opciones de turnos de la tanda (`Llegada` sin intercambio si se creó con `crear_tanda`).
   */
  get_opciones(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<OpcionesTanda, Error>>>;
  /**
   * (garantía que dejaría `miembro` al unirse en el turno `posicion`, prima de ese turno).
   * La garantía ya trae el descuento por historial (M2). Prima > 0: se descuenta de su bolsa;
   * < 0: se le suma. En sorteo y subasta el turno no se elige: devuelve lo que se deja al unirse.
   */
  cotizar_turno(args: { id: number; miembro: string | Address; posicion: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<[bigint, bigint], Error>>>;
  /**
   * Subasta sellada, segunda mitad de la ronda (hasta que vence): `miembro` revela la oferta que
   * selló. Gana el mayor descuento; en empate, quien va antes en el orden de respaldo.
   */
  revelar_oferta(args: { id: number; miembro: string | Address; descuento_bps: number; sal: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Subasta sellada, primera mitad de la ronda: `miembro` sella su oferta. `sello` =
   * sha256(descuento_bps en 4 bytes big-endian ‖ sal de 32 bytes). Se puede cambiar mientras dure
   * esta mitad. Un sello no se puede repetir en la ronda: nadie copia el de otro.
   */
  ofertar_sellada(args: { id: number; miembro: string | Address; sello: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Unirse eligiendo un turno libre (modos `Eleccion` y `PrecioPorTurno`). Mismo camino que
   * `unirse`: verificación, ganchos del historial, colateral a la bóveda y arranque al llenarse.
   * Si es de los primeros turnos que piden historial, se revisa el puntaje de quien se une.
   */
  unirse_en_turno(args: { id: number; miembro: string | Address; posicion: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Todo lo de turnos en una sola lectura: opciones, mejor oferta, orden de respaldo,
   * intercambios pendientes y fondo de primas.
   */
  get_estado_turnos(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<EstadoTurnos, Error>>>;
  /**
   * Retira la propuesta de `de`. La puede retirar `de` (se arrepintió) o `con` (la rechaza).
   * Lo que `de` dejó guardado vuelve a `de`. Funciona en cualquier estado de la tanda.
   */
  cancelar_propuesta(args: { id: number; de: string | Address; quien: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * `con` acepta la propuesta de `de`: cambian de turno y se mueve la compensación.
   * La garantía no se mueve: quien adelanta su turno la completa al cobrar.
   */
  aceptar_intercambio(args: { id: number; con: string | Address; de: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Igual que `crear_tanda` (mismas reglas y validaciones), pero el creador elige cómo se
   * reparten los turnos: llegada, elección, precio por turno, sorteo o subasta, y si se
   * pueden intercambiar.
   */
  crear_tanda_avanzada(args: { creador: string | Address; token: string | Address; cuota: bigint; n_miembros: number; periodo_seg: bigint; penalidad_bps: number; cobertura_bps: number; opciones: OpcionesTanda }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  /**
   * `de` propone cambiar su turno por el de `con`. Si `compensacion` > 0, `de` la deja ahora en
   * el contrato y `con` la recibe al aceptar; si es < 0, `con` le paga a `de` al aceptar.
   */
  proponer_intercambio(args: { id: number; de: string | Address; con: string | Address; compensacion: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
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
   * Mientras la tanda está `Activa` o `PorLiquidar`, y también después de `Finalizada` (v4: el
   * dinero va directo a quien recibió de menos). No se puede pagar de más.
   */
  pagar_deuda(args: { id: number; miembro: string | Address; pagador: string | Address; monto: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * El nombre de la tanda `id`. Vacío si no tiene (o si la tanda no existe): se muestra "Tanda N".
   * Solo lectura y barata (una sola entrada).
   */
  get_nombre(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Los nombres de las tandas `desde`, `desde + 1`, … (hasta 50 por llamada): la posición `i` del
   * resultado es el nombre de la tanda `desde + i`. Para la lista, en una sola consulta.
   */
  get_nombres(args: { desde: number; cuantos: number }, options?: MethodOptions): Promise<AssembledTransaction<Array<string>>>;
  /**
   * Igual que `crear_tanda` (orden de llegada, mismas reglas), con nombre. `nombre` vacío = sin
   * nombre; si no, de 2 a 40 caracteres (error `NombreInvalido`).
   */
  crear_tanda_con_nombre(args: { creador: string | Address; token: string | Address; cuota: bigint; n_miembros: number; periodo_seg: bigint; penalidad_bps: number; cobertura_bps: number; nombre: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  /**
   * Igual que `crear_tanda_avanzada` (turnos a elección), con nombre.
   */
  crear_tanda_avanzada_con_nombre(args: { creador: string | Address; token: string | Address; cuota: bigint; n_miembros: number; periodo_seg: bigint; penalidad_bps: number; cobertura_bps: number; opciones: OpcionesTanda; nombre: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
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
   * En los modos donde se elige turno, el del turno libre más bajo (ver `cotizar_turno`).
   */
  colateral_siguiente(args: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAAAAANlVbmlyc2UgYSB1bmEgdGFuZGEgYWJpZXJ0YTogcGFnYSBlbCBjb2xhdGVyYWwsIHF1ZSB2YSBkaXJlY3RvIGEgbGEgYsOzdmVkYS4KRWwgb3JkZW4gZGUgbGxlZ2FkYSBkZWZpbmUgZWwgdHVybm8gKHNhbHZvIHF1ZSBsYSB0YW5kYSB1c2Ugb3RybyBtb2RvIGRlIHR1cm5vcywKdmVyIGB0dXJub3MucnNgKS4gQ3VhbmRvIGVudHJhIGVsIMO6bHRpbW8sIGxhIHRhbmRhIGFycmFuY2EuAAAAAAAABnVuaXJzZQAAAAAAAgAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB21pZW1icm8AAAAAEwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAIlTb2xvIGVsIGNyZWFkb3IsIHkgc29sbyBtaWVudHJhcyBsYSB0YW5kYSBlc3TDoSBgQWJpZXJ0YWAgKG5vIHNlIGxsZW7Dsyk6CmRldnVlbHZlIGEgY2FkYSB1bm8gc3UgY29sYXRlcmFsIG3DoXMgc3UgcGFydGUgZGVsIHJlbmRpbWllbnRvLgAAAAAAAAhjYW5jZWxhcgAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAARVSZXBhcnRlIHRvZG8gYWwgdGVybWluYXIgbGFzIHJvbmRhcy4gQ1VBTFFVSUVSQSBwdWVkZSBsbGFtYXJsYS4KT3JkZW46IHJldGlyYXIgZGUgbGEgYsOzdmVkYSDihpIgcmVwYXJ0aXIgbGEgZ2FyYW50w61hIGRlIGxvcyBtb3Jvc29zIGVudHJlIHF1aWVuZXMgY29icmFyb24gZGUgbWVub3MKKHY1KSDihpIgY29icmFyIG11bHRhcyDihpIgZGV2b2x2ZXIgY29sYXRlcmFsICsgcmVuZGltaWVudG8g4oaSIHJlcGFydGlyIG11bHRhcyB5IHJldGVuaWRvIGVudHJlIGxvcwpjdW1wbGlkb3MuAAAAAAAACWZpbmFsaXphcgAAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAIJDcmVhIHVuYSB0YW5kYSBudWV2YSBlbiBlc3RhZG8gYEFiaWVydGFgIHkgZGV2dWVsdmUgc3UgaWQuCkVsIGNyZWFkb3IgTk8gcXVlZGEgY29tbyBtaWVtYnJvOiBzaSBxdWllcmUgcGFydGljaXBhciwgbGxhbWEgYHVuaXJzZWAuAAAAAAALY3JlYXJfdGFuZGEAAAAABwAAAAAAAAAHY3JlYWRvcgAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABWN1b3RhAAAAAAAACwAAAAAAAAAKbl9taWVtYnJvcwAAAAAABAAAAAAAAAALcGVyaW9kb19zZWcAAAAABgAAAAAAAAANcGVuYWxpZGFkX2JwcwAAAAAAAAQAAAAAAAAADWNvYmVydHVyYV9icHMAAAAAAAAEAAAAAQAAA+kAAAAEAAAAAw==", "AAAAAAAAAJxDb25maWd1cmEgZWwgY29udHJhdG8gdW5hIHNvbGEgdmV6OiBxdWnDqW4gZXMgZWwgYWRtaW4sIHF1w6kgYsOzdmVkYSB1c2FyIHksCm9wY2lvbmFsbWVudGUsIHF1acOpbiBwdWVkZSBtYXJjYXIgZGlyZWNjaW9uZXMgY29tbyB2ZXJpZmljYWRhcyAoZ2FuY2hvIFNVR0VGKS4AAAALaW5pY2lhbGl6YXIAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAZib3ZlZGEAAAAAABMAAAAAAAAAC3ZlcmlmaWNhZG9yAAAAA+gAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAJ1QYWdhIGxhIGN1b3RhIGRlIGxhIHJvbmRhIEFDVFVBTC4gU2kgeWEgdmVuY2nDsyBlbCBwbGF6bywgY3VlbnRhIGNvbW8gcGFnbyB0YXJkZToKc3VtYSB1biBhdHJhc28geSB1bmEgbXVsdGEgcGVuZGllbnRlIChxdWUgc2UgY29icmEgZGVsIGNvbGF0ZXJhbCBhbCBmaW5hbCkuAAAAAAAAC3BhZ2FyX2N1b3RhAAAAAAIAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAdtaWVtYnJvAAAAABMAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAnBDaWVycmEgbGEgcm9uZGEgdmVuY2lkYS4gQ1VBTFFVSUVSQSBwdWVkZSBsbGFtYXJsYSAoYXPDrSBuYWRpZSBibG9xdWVhIGxhIHRhbmRhKS4KLSBRdWllbiBubyBwYWfDszogYW50ZXMgZGUgc3UgdHVybm8gKGZpam8pLCBzdSBjb2xhdGVyYWwgY3VicmUgbGEgY3VvdGEgc2kgYWxjYW56YSBwYXJhIGVzYSBjdW90YQooY29tbyBlbiBsYSB2NDogbG8gcmVzcGFsZGEgc3UgcG96bykuIEVuIGxvcyBkZW3DoXMgY2Fzb3MgKHlhIGNvYnLDsywgZXMgc3Ugcm9uZGEgbyBzdWJhc3RhKSwgc29sbyBzaQphbGNhbnphIHBhcmEgdG9kYXMgbGFzIHF1ZSBsZSBxdWVkYW4gKHY1KS4gU2kgbm8sIGxhIGN1b3RhIHF1ZWRhIGNvbW8gZGV1ZGEsIHN1IGNvbGF0ZXJhbCBubyBzZQp0b2NhIHkgcXVlZGEgbW9yb3NvLgotIEVsIGJlbmVmaWNpYXJpbyBkZSB0dXJubyByZWNpYmUgbGEgYm9sc2EgKG8gc2UgcmV0aWVuZSBzaSBlcyBtb3Jvc28pLgotIChNMSB2NCkgU2kgVE9ET1MgcGFnYXJvbiwgc2UgcHVlZGUgY2VycmFyIGFudGVzIGRlIHF1ZSB2ZW56YSAobWVub3MgZW4gbGEgc3ViYXN0YSkuIExhcwpmZWNoYXMgbm8gc2UgbXVldmVuOiBsYSByb25kYSBzaWd1aWVudGUgdmVuY2UgY3VhbmRvIGxlIHRvY2FiYS4AAAAMY2VycmFyX3JvbmRhAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAFgoUDIpIEVsIHZlcmlmaWNhZG9yIG1hcmNhIHVuYSBkaXJlY2Npw7NuIGNvbW8gdmVyaWZpY2FkYSAoS1lDIGhlY2hvIGZ1ZXJhIGRlIGxhIGNhZGVuYSkuAAAAEW1hcmNhcl92ZXJpZmljYWRvAAAAAAAAAgAAAAAAAAAHbWllbWJybwAAAAATAAAAAAAAAAp2ZXJpZmljYWRvAAAAAAABAAAAAQAAA+kAAAACAAAAAw==", "AAAAAQAAADZMYSBkZXVkYSBkZSB1biBtaWVtYnJvLCByb25kYSBwb3Igcm9uZGEgKGBnZXRfZGV1ZGFgKS4AAAAAAAAAAAAFRGV1ZGEAAAAAAAADAAAAWFN1IGJvbHNhLCBzaSBzZSByZXR1dm8gcG9ycXVlIGVyYSBtb3Jvc28gY3VhbmRvIGxlIHRvY2FiYSBjb2JyYXIuIExhIHJlY3VwZXJhIGFsIHNhbGRhci4AAAAOYm9sc2FfcmV0ZW5pZGEAAAAAAAsAAABTTG8gcXVlIHRvZGF2w61hIGRlYmUsIGRlbCBmYWx0YW50ZSBtw6FzIHZpZWpvIGFsIG3DoXMgbnVldm8uIFN1bWFuIGBNaWVtYnJvLmRldWRhYC4AAAAACWZhbHRhbnRlcwAAAAAAA+oAAAfQAAAACEZhbHRhbnRlAAAAU0N1w6FudG8gc2UgaGEgcGFnYWRvIGRlIHN1IGRldWRhIGhhc3RhIGFob3JhIChwb3IgZWwgbWllbWJybyBvIHBvciBvdHJhcyBwZXJzb25hcykuAAAAAAZwYWdhZG8AAAAAAAs=", "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAJwAAAAAAAAAOWWFJbmljaWFsaXphZG8AAAAAAAEAAAAAAAAADE5vRW5jb250cmFkYQAAAAIAAAAAAAAADkVzdGFkb0ludmFsaWRvAAAAAAADAAAAAAAAABFQYXJhbWV0cm9JbnZhbGlkbwAAAAAAAAQAAAAAAAAAC1lhRXNNaWVtYnJvAAAAAAUAAAAAAAAAClRhbmRhTGxlbmEAAAAAAAYAAAAAAAAAC05vRXNNaWVtYnJvAAAAAAcAAAAAAAAABllhUGFnbwAAAAAACAAAAAAAAAAOUm9uZGFOb1ZlbmNpZGEAAAAAAAkAAAAAAAAADU1pZW1icm9Nb3Jvc28AAAAAAAAKAAAAAAAAAAxOb1ZlcmlmaWNhZG8AAAALAAAAAAAAAAxOb0F1dG9yaXphZG8AAAAMAAAAAAAAAA5Ob0luaWNpYWxpemFkbwAAAAAADQAAAAAAAAAIU2luRGV1ZGEAAAAOAAAAAAAAAAxQYWdvRXhjZXNpdm8AAAAPAAAAAAAAAA1Nb250b0ludmFsaWRvAAAAAAAAEAAAAAAAAAAWSGlzdG9yaWFsTm9Db25maWd1cmFkbwAAAAAAFAAAAAAAAAATUHVudGFqZUluc3VmaWNpZW50ZQAAAAAVAAAAAAAAABRSZXF1aXNpdG9zQmxvcXVlYWRvcwAAABYAAAAAAAAAEU9wY2lvbmVzSW52YWxpZGFzAAAAAAAAHgAAAAAAAAANTW9kb05vUGVybWl0ZQAAAAAAAB8AAAAAAAAADVR1cm5vSW52YWxpZG8AAAAAAAAgAAAAAAAAAAxUdXJub09jdXBhZG8AAAAhAAAAAAAAAA5PZmVydGFJbnZhbGlkYQAAAAAAIgAAAAAAAAAOTm9QdWVkZU9mZXJ0YXIAAAAAACMAAAAAAAAAClNpblN1YmFzdGEAAAAAACQAAAAAAAAAE0ludGVyY2FtYmlvSW52YWxpZG8AAAAAJQAAAAAAAAASUHJvcHVlc3RhRXhpc3RlbnRlAAAAAAAmAAAAAAAAAAxTaW5Qcm9wdWVzdGEAAAAnAAAAAAAAABNUdXJub0V4aWdlSGlzdG9yaWFsAAAAACgAAAAAAAAADkZhc2VFcXVpdm9jYWRhAAAAAAApAAAAAAAAAA1TZWxsb0ludmFsaWRvAAAAAAAAKgAAAAAAAAANU2VsbG9SZXBldGlkbwAAAAAAACsAAAAAAAAADlRva2VuU2luQm92ZWRhAAAAAAA3AAAAAAAAABFCb3ZlZGFEZU90cm9Ub2tlbgAAAAAAADgAAAAAAAAAFFN1YmFzdGFOb0NpZXJyYUFudGVzAAAAPAAAAAAAAAATQ2llcnJlTXV5QWRlbGFudGFkbwAAAAA9AAAAAAAAAA5EZXVkYVBlbmRpZW50ZQAAAAAAQQAAAAAAAAAOTm9tYnJlSW52YWxpZG8AAAAAAEY=", "AAAAAQAAAAAAAAAAAAAABVRhbmRhAAAAAAAADQAAAAAAAAANY29iZXJ0dXJhX2JwcwAAAAAAAAQAAAAAAAAAB2NyZWFkb3IAAAAAEwAAAAAAAAAFY3VvdGEAAAAAAAALAAAAAAAAAAZlc3RhZG8AAAAAB9AAAAAGRXN0YWRvAAAAAAAqTXVsdGFzIGNvYnJhZGFzIChzZSBsbGVuYSBlbiBgZmluYWxpemFyYCkuAAAAAAANZm9uZG9fcHJlbWlvcwAAAAAAAAsAAABZTW9tZW50byAodGltZXN0YW1wKSBlbiBxdWUgYWJyacOzIGxhIHJvbmRhIGFjdHVhbC4gVmVuY2UgZW4gYGluaWNpb19yb25kYSArIHBlcmlvZG9fc2VnYC4AAAAAAAAMaW5pY2lvX3JvbmRhAAAABgAAAAAAAAAKbl9taWVtYnJvcwAAAAAABAAAAAAAAAANcGVuYWxpZGFkX2JwcwAAAAAAAAQAAAAAAAAAC3BlcmlvZG9fc2VnAAAAAAYAAAA7Qm9sc2FzIHF1ZSBubyBzZSBwYWdhcm9uIHBvcnF1ZSBlbCBiZW5lZmljaWFyaW8gZXJhIG1vcm9zby4AAAAACHJldGVuaWRvAAAACwAAAFRSb25kYSBlbiBjdXJzbzogMC4ubl9taWVtYnJvcy4gRW4gbGEgcm9uZGEgYHJgIGNvYnJhIGVsIG1pZW1icm8gY29uIGBwb3NpY2lvbiA9PSByYC4AAAAMcm9uZGFfYWN0dWFsAAAABAAAAE5QYXJ0aWNpcGFjaW9uZXMgZGUgRVNUQSB0YW5kYSBlbiBsYSBiw7N2ZWRhICh2YXJpYXMgdGFuZGFzIGNvbXBhcnRlbiBiw7N2ZWRhKS4AAAAAAA1zaGFyZXNfYm92ZWRhAAAAAAAACwAAAAAAAAAFdG9rZW4AAAAAAAAT", "AAAAAgAAAAAAAAAAAAAABkVzdGFkbwAAAAAABQAAAAAAAAAAAAAAB0FiaWVydGEAAAAAAAAAAAAAAAAGQWN0aXZhAAAAAAAAAAAAAAAAAAtQb3JMaXF1aWRhcgAAAAAAAAAAAAAAAApGaW5hbGl6YWRhAAAAAAAAAAAAAAAAAAlDYW5jZWxhZGEAAAA=", "AAAAAQAAAAAAAAAAAAAAB01pZW1icm8AAAAACAAAAAAAAAAHYXRyYXNvcwAAAAAEAAAAFVlhIHJlY2liacOzIHN1IHR1cm5vLgAAAAAAAAVjb2JybwAAAAAAAAEAAAA4Q29sYXRlcmFsIHF1ZSBsZSBxdWVkYSAoYmFqYSBzaSBjdWJyZSBpbXBhZ29zIG8gbXVsdGFzKS4AAAAJY29sYXRlcmFsAAAAAAAACwAAAAAAAAARY29sYXRlcmFsX2luaWNpYWwAAAAAAAALAAAALUN1b3RhcyBxdWUgc3UgY29sYXRlcmFsIG5vIGFsY2FuesOzIGEgY3VicmlyLgAAAAAAAAVkZXVkYQAAAAAAAAsAAAAAAAAABm1vcm9zbwAAAAAAAQAAAAAAAAARbXVsdGFzX3BlbmRpZW50ZXMAAAAAAAALAAAAHVR1cm5vOiAwIGNvYnJhIGVuIGxhIHJvbmRhIDAuAAAAAAAACHBvc2ljaW9uAAAABA==", "AAAAAQAAALBVbmEgcGFydGUgZGUgbGEgZGV1ZGEgZGUgdW4gbW9yb3NvOiBsbyBxdWUgc3UgZ2FyYW50w61hIG5vIGFsY2FuesOzIGEgY3VicmlyIGVuIGxhIHJvbmRhIGByb25kYWAKeSBhIHF1acOpbiBzZSBsZSBkZWJlIChgYWNyZWVkb3JgOiBxdWllbiBjb2Jyw7MgZXNhIHJvbmRhIHkgcmVjaWJpw7MgZGUgbWVub3MpLgAAAAAAAAAIRmFsdGFudGUAAAADAAAAAAAAAAhhY3JlZWRvcgAAABMAAAAAAAAABW1vbnRvAAAAAAAACwAAAAAAAAAFcm9uZGEAAAAAAAAE", "AAAAAQAAANxJbnRlcmNhbWJpbyBwZW5kaWVudGU6IGBkZWAgcHJvcG9uZSBjYW1iaWFyIHN1IHR1cm5vIHBvciBlbCBkZSBgY29uYC4KYGNvbXBlbnNhY2lvbmAgPiAwOiBgZGVgIGxlIHBhZ2EgYSBgY29uYCAocXVlZGEgZ3VhcmRhZGEgZW4gZWwgY29udHJhdG8gaGFzdGEgYWNlcHRhciBvIHJldGlyYXIpLgpgY29tcGVuc2FjaW9uYCA8IDA6IGBjb25gIGxlIHBhZ2EgYSBgZGVgIGFsIGFjZXB0YXIuAAAAAAAAAAlQcm9wdWVzdGEAAAAAAAADAAAAAAAAAAxjb21wZW5zYWNpb24AAAALAAAAAAAAAANjb24AAAAAEwAAAAAAAAACZGUAAAAAABM=", "AAAAAgAAAAAAAAAAAAAACk1vZG9UdXJub3MAAAAAAAUAAAAAAAAAM0VsIG9yZGVuIGRlIGxsZWdhZGEgZGVjaWRlIGVsIHR1cm5vIChjb21vIHNpZW1wcmUpLgAAAAAHTGxlZ2FkYQAAAAAAAAAAMkNhZGEgcXVpZW4gZWxpZ2UgdW4gdHVybm8gbGlicmUgYWwgdW5pcnNlLCBncmF0aXMuAAAAAAAIRWxlY2Npb24AAAAAAAAAT0NhZGEgcXVpZW4gZWxpZ2UgdHVybm86IGxvcyBwcmltZXJvcyBwYWdhbiB1bmEgcHJpbWEgeSBsb3Mgw7psdGltb3MgbGEgcmVjaWJlbi4AAAAADlByZWNpb1BvclR1cm5vAAAAAAAAAAAANUVsIGNvbnRyYXRvIHNvcnRlYSBlbCBvcmRlbiBjdWFuZG8gc2UgbGxlbmEgbGEgdGFuZGEuAAAAAAAABlNvcnRlbwAAAAAAAAAAAEFDYWRhIHJvbmRhIGNvYnJhIHF1aWVuIG9mcmV6Y2EgZWwgbWF5b3IgZGVzY3VlbnRvIHNvYnJlIGxhIGJvbHNhLgAAAAAAAAdTdWJhc3RhAA==", "AAAAAQAAAFVSZXF1aXNpdG9zIGRlIGhpc3RvcmlhbCBkZSB1bmEgdGFuZGEgKGBjb25maWd1cmFyX3JlcXVpc2l0b3NgKS4gUG9yIGRlZmVjdG86IG5pbmd1bm8uAAAAAAAAAAAAAApSZXF1aXNpdG9zAAAAAAACAAAAOURhciBkZXNjdWVudG8gZGUgZ2FyYW50w61hIHNlZ8O6biBlbCBuaXZlbCBkZWwgaGlzdG9yaWFsLgAAAAAAAAlkZXNjdWVudG8AAAAAAAABAAAAM1B1bnRhamUgbcOtbmltbyBwYXJhIHVuaXJzZSAoMCA9IGN1YWxxdWllcmEgcHVlZGUpLgAAAAAOcHVudGFqZV9taW5pbW8AAAAAAAQ=", "AAAAAQAAAFFUb2RvIGxvIGRlIHR1cm5vcyBxdWUgbGEgd2ViIG5lY2VzaXRhLCBlbiB1bmEgc29sYSBsZWN0dXJhIChgZ2V0X2VzdGFkb190dXJub3NgKS4AAAAAAAAAAAAADEVzdGFkb1R1cm5vcwAAAAgAAABtU3ViYXN0YSBzZWxsYWRhIGVuIGN1cnNvOiBoYXN0YSBlc3RlIG1vbWVudG8gc2Ugc2VsbGE7IGRlc3B1w6lzLCBoYXN0YSBxdWUgdmVuY2UsIHNlIHJldmVsYQooMCBzaSBubyBhcGxpY2EpLgAAAAAAAAtmaW5fc2VsbGFkbwAAAAAGAAAARVByZWNpb1BvclR1cm5vOiBwcmltYXMgeWEgY29icmFkYXMgcXVlIGVzcGVyYW4gYSBsb3Mgw7psdGltb3MgdHVybm9zLgAAAAAAAAxmb25kb19wcmltYXMAAAALAAAAUVN1YmFzdGE6IGRlc2N1ZW50byBkZSBlc2Egb2ZlcnRhLCBlbiBicHMgc29icmUgbGEgYm9sc2EgKDAgc2kgbmFkaWUgaGEgb2ZlcnRhZG8pLgAAAAAAABBtZWpvcl9vZmVydGFfYnBzAAAABAAAAFNTdWJhc3RhOiBxdWnDqW4gaGl6byBsYSBtZWpvciBvZmVydGEgZGUgbGEgcm9uZGEgZW4gY3Vyc28gKG5hZGllIHRvZGF2w61hOiBgTm9uZWApLgAAAAAMbWVqb3JfcG9zdG9yAAAD6AAAABMAAAAAAAAACG9wY2lvbmVzAAAH0AAAAA1PcGNpb25lc1RhbmRhAAAAAAAAGEludGVyY2FtYmlvcyBwZW5kaWVudGVzLgAAAApwcm9wdWVzdGFzAAAAAAPqAAAH0AAAAAlQcm9wdWVzdGEAAAAAAABTU3ViYXN0YTogb3JkZW4gc29ydGVhZG8gYWwgbGxlbmFyc2U7IGRlY2lkZSBxdWnDqW4gY29icmEgZW4gbGFzIHJvbmRhcyBzaW4gb2ZlcnRhcy4AAAAACHJlc3BhbGRvAAAD6gAAABMAAABYU3ViYXN0YSBzZWxsYWRhOiBxdWnDqW5lcyBzZWxsYXJvbiB1bmEgb2ZlcnRhIGVuIGxhIHJvbmRhIGVuIGN1cnNvIHkgYcO6biBubyBsYSByZXZlbGFuLgAAAAZzZWxsb3MAAAAAA+oAAAAT", "AAAAAQAAAEFPcGNpb25lcyBkZSB0dXJub3MgcXVlIGVsaWdlIGVsIGNyZWFkb3IgKGBjcmVhcl90YW5kYV9hdmFuemFkYWApLgAAAAAAAAAAAAANT3BjaW9uZXNUYW5kYQAAAAAAAAcAAABHU3ViYXN0YTogZGVzY3VlbnRvIG3DoXhpbW8gcXVlIHNlIHB1ZWRlIG9mcmVjZXIsIGVuIGJwcyBzb2JyZSBsYSBib2xzYS4AAAAAEWRlc2N1ZW50b19tYXhfYnBzAAAAAAAABAAAAAAAAAAEbW9kbwAAB9AAAAAKTW9kb1R1cm5vcwAAAAAAWlN1YmFzdGE6IGxhcyBvZmVydGFzIHNlIHNlbGxhbiBlbiBsYSBwcmltZXJhIG1pdGFkIGRlIGxhIHJvbmRhIHkgc2UgcmV2ZWxhbiBlbiBsYSBzZWd1bmRhLgAAAAAAEG9mZXJ0YXNfc2VsbGFkYXMAAAABAAAASERvcyBtaWVtYnJvcyBwdWVkZW4gY2FtYmlhciBzdXMgdHVybm9zIGZ1dHVyb3MgKG5vIGFwbGljYSBhIGxhIHN1YmFzdGEpLgAAABRwZXJtaXRpcl9pbnRlcmNhbWJpbwAAAAEAAABaUHJlY2lvUG9yVHVybm86IHByaW1hIGRlbCBwcmltZXIgdHVybm8sIGVuIGJwcyBzb2JyZSBsYSBib2xzYS4gRWwgw7psdGltbyByZWNpYmUgbG8gbWlzbW8uAAAAAAANcHJpbWFfbWF4X2JwcwAAAAAAAAQAAACmRWxlZ2lyIHR1cm5vIHkgcHJlY2lvIHBvciB0dXJubzogY3XDoW50b3MgZGUgbG9zIHByaW1lcm9zIHR1cm5vcyBwaWRlbiBoaXN0b3JpYWwgKE0yKS4KMCA9IG5pbmd1bm8uIEVzb3MgdHVybm9zIHNvbG8gbG9zIHRvbWEgcXVpZW4gdGVuZ2EgYWwgbWVub3MgYHB1bnRhamVfcHJpbWVyb3NgLgAAAAAAFnByaW1lcm9zX2Nvbl9oaXN0b3JpYWwAAAAAAAQAAABYUHVudGFqZSBkZSBoaXN0b3JpYWwgcXVlIHBpZGVuIGxvcyBwcmltZXJvcyB0dXJub3MgKDAgc2kgYHByaW1lcm9zX2Nvbl9oaXN0b3JpYWxgIGVzIDApLgAAABBwdW50YWplX3ByaW1lcm9z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", "AAAABQAAAEVTZSByZXRpcsOzIHVuYSBwcm9wdWVzdGEgZGUgaW50ZXJjYW1iaW8gKGxvIGd1YXJkYWRvIHZvbHZpw7MgYSBgZGVgKS4AAAAAAAAAAAAAE0V2UHJvcHVlc3RhUmV0aXJhZGEAAAAAAQAAAAhpbnRlcl9ubwAAAAMAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAACZGUAAAAAABMAAAAAAAAAAAAAAANjb24AAAAAEwAAAAAAAAAC", "AAAABQAAAEdFbCBhZG1pbiBjb25lY3TDsyAobyBkZXNjb25lY3TDsywgY29uIGBOb25lYCkgZWwgY29udHJhdG8gZGUgaGlzdG9yaWFsLgAAAAAAAAAAFkV2SGlzdG9yaWFsQ29uZmlndXJhZG8AAAAAAAEAAAAJaGlzdF9jb25mAAAAAAAAAQAAAAAAAAAJaGlzdG9yaWFsAAAAAAAD6AAAABMAAAAAAAAAAg==", "AAAAAAAAAAAAAAANZ2V0X2hpc3RvcmlhbAAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAAAAAAAAOZ2V0X3JlcXVpc2l0b3MAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAfQAAAAClJlcXVpc2l0b3MAAAAAAAM=", "AAAAAAAAAJ4oYWRtaW4pIENvbmVjdGEgZWwgY29udHJhdG8gZGUgaGlzdG9yaWFsIChvIGxvIGRlc2NvbmVjdGEgY29uIGBOb25lYCkuCkxhIHRhbmRhIGRlYmUgZXN0YXIgYXV0b3JpemFkYSBjb21vIGVtaXNvciBlbiBlbCBoaXN0b3JpYWwgcGFyYSBxdWUgc3VzIGhlY2hvcyBjdWVudGVuLgAAAAAAFGNvbmZpZ3VyYXJfaGlzdG9yaWFsAAAAAQAAAAAAAAAJaGlzdG9yaWFsAAAAAAAD6AAAABMAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAKEoY3JlYWRvcikgUmVxdWlzaXRvcyBkZSBoaXN0b3JpYWwgZGUgbGEgdGFuZGEgYGlkYC4gU29sbyBtaWVudHJhcyBlc3TDoSBhYmllcnRhIHkgc2luIG1pZW1icm9zLApwYXJhIHF1ZSBuYWRpZSBlbnRyZSBjb24gdW5hcyByZWdsYXMgeSBkZXNwdcOpcyBsZSBjYW1iaWVuIG90cmFzLgAAAAAAABVjb25maWd1cmFyX3JlcXVpc2l0b3MAAAAAAAADAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAOcHVudGFqZV9taW5pbW8AAAAAAAQAAAAAAAAACWRlc2N1ZW50bwAAAAAAAAEAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAHdHYXJhbnTDrWEgcXVlIGRlamFyw61hIGBtaWVtYnJvYCBzaSBzZSB1bmllcmEgYWhvcmEsIGNvbiBlbCBkZXNjdWVudG8gZGUgc3UgaGlzdG9yaWFsCihwYXJhIG1vc3RyYXJsYSBhbnRlcyBkZSBmaXJtYXIpLgAAAAAWY29sYXRlcmFsX3BhcmFfbWllbWJybwAAAAAAAgAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB21pZW1icm8AAAAAEwAAAAEAAAPpAAAACwAAAAM=", "AAAAAAAAAFFMYSBiw7N2ZWRhIHJlZ2lzdHJhZGEgcGFyYSBgdG9rZW5gLCBvIGBOb25lYCBzaSBlc2UgdG9rZW4gc2lndWUgbGEgcmVnbGEgZ2VuZXJhbC4AAAAAAAAQZ2V0X2JvdmVkYV90b2tlbgAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAPoAAAAEw==", "AAAAAAAAANYoU29sbyBlbCBhZG1pbikgQsOzdmVkYSBwYXJhIGxhcyB0YW5kYXMgbnVldmFzIGVuIGB0b2tlbmAuIGBOb25lYCBxdWl0YSBlbCByZWdpc3RybyB5IGVsIHRva2VuCnZ1ZWx2ZSBhIGxhIHJlZ2xhIGdlbmVyYWwuIFNpIGxhIGLDs3ZlZGEgZGljZSBxdcOpIHRva2VuIGd1YXJkYSAoZWwgYWRhcHRhZG9yIGRlIEJsZW5kIGxvIGRpY2UpLAp0aWVuZSBxdWUgc2VyIGB0b2tlbmAuAAAAAAAQcmVnaXN0cmFyX2JvdmVkYQAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYm92ZWRhAAAAAAPoAAAAEwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAKRTdWJhc3RhOiBvZnJlY2VyIHJlY2liaXIgYGRlc2N1ZW50b19icHNgIG1lbm9zIGRlIGxhIGJvbHNhIHBhcmEgY29icmFyIGVuIGxhIHJvbmRhIGVuCmN1cnNvLiBEZWJlIHN1cGVyYXIgbGEgbWVqb3Igb2ZlcnRhIHkgc2UgYWNlcHRhIHNvbG8gaGFzdGEgcXVlIHZlbmNlIGxhIHJvbmRhLgAAAAdvZmVydGFyAAAAAAMAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAdtaWVtYnJvAAAAABMAAAAAAAAADWRlc2N1ZW50b19icHMAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAFlPcGNpb25lcyBkZSB0dXJub3MgZGUgbGEgdGFuZGEgKGBMbGVnYWRhYCBzaW4gaW50ZXJjYW1iaW8gc2kgc2UgY3Jlw7MgY29uIGBjcmVhcl90YW5kYWApLgAAAAAAAAxnZXRfb3BjaW9uZXMAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAH0AAAAA1PcGNpb25lc1RhbmRhAAAAAAAAAw==", "AAAAAAAAAREoZ2FyYW50w61hIHF1ZSBkZWphcsOtYSBgbWllbWJyb2AgYWwgdW5pcnNlIGVuIGVsIHR1cm5vIGBwb3NpY2lvbmAsIHByaW1hIGRlIGVzZSB0dXJubykuCkxhIGdhcmFudMOtYSB5YSB0cmFlIGVsIGRlc2N1ZW50byBwb3IgaGlzdG9yaWFsIChNMikuIFByaW1hID4gMDogc2UgZGVzY3VlbnRhIGRlIHN1IGJvbHNhOwo8IDA6IHNlIGxlIHN1bWEuIEVuIHNvcnRlbyB5IHN1YmFzdGEgZWwgdHVybm8gbm8gc2UgZWxpZ2U6IGRldnVlbHZlIGxvIHF1ZSBzZSBkZWphIGFsIHVuaXJzZS4AAAAAAAANY290aXphcl90dXJubwAAAAAAAAMAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAdtaWVtYnJvAAAAABMAAAAAAAAACHBvc2ljaW9uAAAABAAAAAEAAAPpAAAD7QAAAAIAAAALAAAACwAAAAM=", "AAAAAAAAALBTdWJhc3RhIHNlbGxhZGEsIHNlZ3VuZGEgbWl0YWQgZGUgbGEgcm9uZGEgKGhhc3RhIHF1ZSB2ZW5jZSk6IGBtaWVtYnJvYCByZXZlbGEgbGEgb2ZlcnRhIHF1ZQpzZWxsw7MuIEdhbmEgZWwgbWF5b3IgZGVzY3VlbnRvOyBlbiBlbXBhdGUsIHF1aWVuIHZhIGFudGVzIGVuIGVsIG9yZGVuIGRlIHJlc3BhbGRvLgAAAA5yZXZlbGFyX29mZXJ0YQAAAAAABAAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB21pZW1icm8AAAAAEwAAAAAAAAANZGVzY3VlbnRvX2JwcwAAAAAAAAQAAAAAAAAAA3NhbAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAP5TdWJhc3RhIHNlbGxhZGEsIHByaW1lcmEgbWl0YWQgZGUgbGEgcm9uZGE6IGBtaWVtYnJvYCBzZWxsYSBzdSBvZmVydGEuIGBzZWxsb2AgPQpzaGEyNTYoZGVzY3VlbnRvX2JwcyBlbiA0IGJ5dGVzIGJpZy1lbmRpYW4g4oCWIHNhbCBkZSAzMiBieXRlcykuIFNlIHB1ZWRlIGNhbWJpYXIgbWllbnRyYXMgZHVyZQplc3RhIG1pdGFkLiBVbiBzZWxsbyBubyBzZSBwdWVkZSByZXBldGlyIGVuIGxhIHJvbmRhOiBuYWRpZSBjb3BpYSBlbCBkZSBvdHJvLgAAAAAAD29mZXJ0YXJfc2VsbGFkYQAAAAADAAAAAAAAAAJpZAAAAAAABAAAAAAAAAAHbWllbWJybwAAAAATAAAAAAAAAAVzZWxsbwAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAQ5Vbmlyc2UgZWxpZ2llbmRvIHVuIHR1cm5vIGxpYnJlIChtb2RvcyBgRWxlY2Npb25gIHkgYFByZWNpb1BvclR1cm5vYCkuIE1pc21vIGNhbWlubyBxdWUKYHVuaXJzZWA6IHZlcmlmaWNhY2nDs24sIGdhbmNob3MgZGVsIGhpc3RvcmlhbCwgY29sYXRlcmFsIGEgbGEgYsOzdmVkYSB5IGFycmFucXVlIGFsIGxsZW5hcnNlLgpTaSBlcyBkZSBsb3MgcHJpbWVyb3MgdHVybm9zIHF1ZSBwaWRlbiBoaXN0b3JpYWwsIHNlIHJldmlzYSBlbCBwdW50YWplIGRlIHF1aWVuIHNlIHVuZS4AAAAAAA91bmlyc2VfZW5fdHVybm8AAAAAAwAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB21pZW1icm8AAAAAEwAAAAAAAAAIcG9zaWNpb24AAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAHxUb2RvIGxvIGRlIHR1cm5vcyBlbiB1bmEgc29sYSBsZWN0dXJhOiBvcGNpb25lcywgbWVqb3Igb2ZlcnRhLCBvcmRlbiBkZSByZXNwYWxkbywKaW50ZXJjYW1iaW9zIHBlbmRpZW50ZXMgeSBmb25kbyBkZSBwcmltYXMuAAAAEWdldF9lc3RhZG9fdHVybm9zAAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAAMRXN0YWRvVHVybm9zAAAAAw==", "AAAAAAAAAK1SZXRpcmEgbGEgcHJvcHVlc3RhIGRlIGBkZWAuIExhIHB1ZWRlIHJldGlyYXIgYGRlYCAoc2UgYXJyZXBpbnRpw7MpIG8gYGNvbmAgKGxhIHJlY2hhemEpLgpMbyBxdWUgYGRlYCBkZWrDsyBndWFyZGFkbyB2dWVsdmUgYSBgZGVgLiBGdW5jaW9uYSBlbiBjdWFscXVpZXIgZXN0YWRvIGRlIGxhIHRhbmRhLgAAAAAAABJjYW5jZWxhcl9wcm9wdWVzdGEAAAAAAAMAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAJkZQAAAAAAEwAAAAAAAAAFcXVpZW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAJlgY29uYCBhY2VwdGEgbGEgcHJvcHVlc3RhIGRlIGBkZWA6IGNhbWJpYW4gZGUgdHVybm8geSBzZSBtdWV2ZSBsYSBjb21wZW5zYWNpw7NuLgpMYSBnYXJhbnTDrWEgbm8gc2UgbXVldmU6IHF1aWVuIGFkZWxhbnRhIHN1IHR1cm5vIGxhIGNvbXBsZXRhIGFsIGNvYnJhci4AAAAAAAATYWNlcHRhcl9pbnRlcmNhbWJpbwAAAAADAAAAAAAAAAJpZAAAAAAABAAAAAAAAAADY29uAAAAABMAAAAAAAAAAmRlAAAAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAMBJZ3VhbCBxdWUgYGNyZWFyX3RhbmRhYCAobWlzbWFzIHJlZ2xhcyB5IHZhbGlkYWNpb25lcyksIHBlcm8gZWwgY3JlYWRvciBlbGlnZSBjw7NtbyBzZQpyZXBhcnRlbiBsb3MgdHVybm9zOiBsbGVnYWRhLCBlbGVjY2nDs24sIHByZWNpbyBwb3IgdHVybm8sIHNvcnRlbyBvIHN1YmFzdGEsIHkgc2kgc2UKcHVlZGVuIGludGVyY2FtYmlhci4AAAAUY3JlYXJfdGFuZGFfYXZhbnphZGEAAAAIAAAAAAAAAAdjcmVhZG9yAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAFY3VvdGEAAAAAAAALAAAAAAAAAApuX21pZW1icm9zAAAAAAAEAAAAAAAAAAtwZXJpb2RvX3NlZwAAAAAGAAAAAAAAAA1wZW5hbGlkYWRfYnBzAAAAAAAABAAAAAAAAAANY29iZXJ0dXJhX2JwcwAAAAAAAAQAAAAAAAAACG9wY2lvbmVzAAAH0AAAAA1PcGNpb25lc1RhbmRhAAAAAAAAAQAAA+kAAAAEAAAAAw==", "AAAAAAAAALFgZGVgIHByb3BvbmUgY2FtYmlhciBzdSB0dXJubyBwb3IgZWwgZGUgYGNvbmAuIFNpIGBjb21wZW5zYWNpb25gID4gMCwgYGRlYCBsYSBkZWphIGFob3JhIGVuCmVsIGNvbnRyYXRvIHkgYGNvbmAgbGEgcmVjaWJlIGFsIGFjZXB0YXI7IHNpIGVzIDwgMCwgYGNvbmAgbGUgcGFnYSBhIGBkZWAgYWwgYWNlcHRhci4AAAAAAAAUcHJvcG9uZXJfaW50ZXJjYW1iaW8AAAAEAAAAAAAAAAJpZAAAAAAABAAAAAAAAAACZGUAAAAAABMAAAAAAAAAA2NvbgAAAAATAAAAAAAAAAxjb21wZW5zYWNpb24AAAALAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAJxMYSBkZXVkYSBkZSBgbWllbWJyb2AgZW4gbGEgdGFuZGEgYGlkYDogYSBxdWnDqW4gbGUgZGViZSAocG9yIHJvbmRhKSwgc3UgYm9sc2EgcmV0ZW5pZGEgc2kgbGEKdGllbmUsIHkgY3XDoW50byBoYSBwYWdhZG8uIFNpIG51bmNhIGRlYmnDsyBuYWRhLCB0b2RvIHZhY8Otby4AAAAJZ2V0X2RldWRhAAAAAAAAAgAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB21pZW1icm8AAAAAEwAAAAEAAAPpAAAH0AAAAAVEZXVkYQAAAAAAAAM=", "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", "AAAAAAAAAGFMYSBiw7N2ZWRhIGRvbmRlIGVzdMOhIGxhIGdhcmFudMOtYSBkZSBsYSB0YW5kYSBgaWRgIChsYSB3ZWIgbGEgdXNhIHBhcmEgbW9zdHJhciBlbCByZW5kaW1pZW50bykuAAAAAAAACmdldF9ib3ZlZGEAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAATAAAAAw==", "AAAAAAAAALEoU29sbyBlbCBhZG1pbikgQsOzdmVkYSByw6FwaWRhIHBhcmEgdGFuZGFzIGRlIHBydWViYSAocm9uZGFzIGRlIGhhc3RhIDEwIG1pbnV0b3MpLgpgTm9uZWAgbGEgcXVpdGEuIFNvbG8gYWZlY3RhIGEgbGFzIHRhbmRhcyBxdWUgc2UgY3JlZW4gZGVzcHXDqXM6IGNhZGEgdGFuZGEgY29uc2VydmEgbGEgc3V5YS4AAAAAAAAYY29uZmlndXJhcl9ib3ZlZGFfcmFwaWRhAAAAAQAAAAAAAAAGYm92ZWRhAAAAAAPoAAAAEwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAADIocm9uZGEgYWN0dWFsLCBmZWNoYSBsw61taXRlLCBxdWnDqW5lcyB5YSBwYWdhcm9uKQAAAAAACWdldF9yb25kYQAAAAAAAAEAAAAAAAAAAmlkAAAAAAAEAAAAAQAAA+kAAAPtAAAAAwAAAAQAAAAGAAAD6gAAABMAAAAD", "AAAAAAAAAAAAAAAJZ2V0X3RhbmRhAAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAAFVGFuZGEAAAAAAAAD", "AAAAAAAAAAAAAAAMZ2V0X21pZW1icm9zAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAA+oAAAPtAAAAAgAAABMAAAfQAAAAB01pZW1icm8AAAAAAw==", "AAAAAAAAAEBDdcOhbnRhcyB0YW5kYXMgc2UgaGFuIGNyZWFkbyAobG9zIGlkcyB2YW4gZGUgMSBhIGVzdGUgbsO6bWVybykuAAAADHRvdGFsX3RhbmRhcwAAAAAAAAABAAAABA==", "AAAAAAAAAKVDb2xhdGVyYWwgcXVlIHBhZ2Fyw61hIGVsIHByw7N4aW1vIGVuIHVuaXJzZSAocGFyYSBtb3N0cmFybG8gYW50ZXMgZGUgZmlybWFyKS4KRW4gbG9zIG1vZG9zIGRvbmRlIHNlIGVsaWdlIHR1cm5vLCBlbCBkZWwgdHVybm8gbGlicmUgbcOhcyBiYWpvICh2ZXIgYGNvdGl6YXJfdHVybm9gKS4AAAAAAAATY29sYXRlcmFsX3NpZ3VpZW50ZQAAAAABAAAAAAAAAAJpZAAAAAAABAAAAAEAAAPpAAAACwAAAAM="]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    unirse : this.txFromJson<Result<null, Error>>,  cancelar : this.txFromJson<Result<null, Error>>,  finalizar : this.txFromJson<Result<null, Error>>,  crear_tanda : this.txFromJson<Result<number, Error>>,  inicializar : this.txFromJson<Result<null, Error>>,  pagar_cuota : this.txFromJson<Result<null, Error>>,  cerrar_ronda : this.txFromJson<Result<null, Error>>,  marcar_verificado : this.txFromJson<Result<null, Error>>,  get_historial : this.txFromJson<string | null>,  get_requisitos : this.txFromJson<Result<Requisitos, Error>>,  configurar_historial : this.txFromJson<Result<null, Error>>,  configurar_requisitos : this.txFromJson<Result<null, Error>>,  colateral_para_miembro : this.txFromJson<Result<bigint, Error>>,  get_boveda_token : this.txFromJson<string | null>,  registrar_boveda : this.txFromJson<Result<null, Error>>,  ofertar : this.txFromJson<Result<null, Error>>,  get_opciones : this.txFromJson<Result<OpcionesTanda, Error>>,  cotizar_turno : this.txFromJson<Result<[bigint, bigint], Error>>,  revelar_oferta : this.txFromJson<Result<null, Error>>,  ofertar_sellada : this.txFromJson<Result<null, Error>>,  unirse_en_turno : this.txFromJson<Result<null, Error>>,  get_estado_turnos : this.txFromJson<Result<EstadoTurnos, Error>>,  cancelar_propuesta : this.txFromJson<Result<null, Error>>,  aceptar_intercambio : this.txFromJson<Result<null, Error>>,  crear_tanda_avanzada : this.txFromJson<Result<number, Error>>,  proponer_intercambio : this.txFromJson<Result<null, Error>>,  get_deuda : this.txFromJson<Result<Deuda, Error>>,  get_deudas : this.txFromJson<Result<Array<[string, Deuda]>, Error>>,  pagar_deuda : this.txFromJson<Result<bigint, Error>>,  get_nombre : this.txFromJson<string>,  get_nombres : this.txFromJson<Array<string>>,  crear_tanda_con_nombre : this.txFromJson<Result<number, Error>>,  crear_tanda_avanzada_con_nombre : this.txFromJson<Result<number, Error>>,  get_boveda : this.txFromJson<Result<string, Error>>,  configurar_boveda_rapida : this.txFromJson<Result<null, Error>>,  get_ronda : this.txFromJson<Result<[number, bigint, Array<string>], Error>>,  get_tanda : this.txFromJson<Result<Tanda, Error>>,  get_miembros : this.txFromJson<Result<Array<[string, Miembro]>, Error>>,  total_tandas : this.txFromJson<number>,  colateral_siguiente : this.txFromJson<Result<bigint, Error>>
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
   * Build a topics filter row for the "EvPrima" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evPrimaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvPrima", topicValues);
  }
  /**
   * Build a topics filter row for the "EvRonda" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evRondaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvRonda", topicValues);
  }
  /**
   * Build a topics filter row for the "EvSello" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evSelloEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvSello", topicValues);
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
   * Build a topics filter row for the "EvOferta" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evOfertaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvOferta", topicValues);
  }
  /**
   * Build a topics filter row for the "EvSorteo" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evSorteoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvSorteo", topicValues);
  }
  /**
   * Build a topics filter row for the "EvSubasta" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evSubastaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvSubasta", topicValues);
  }
  /**
   * Build a topics filter row for the "EvCubierto" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evCubiertoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvCubierto", topicValues);
  }
  /**
   * Build a topics filter row for the "EvGarantia" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evGarantiaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvGarantia", topicValues);
  }
  /**
   * Build a topics filter row for the "EvIniciada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evIniciadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvIniciada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvOpciones" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evOpcionesEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvOpciones", topicValues);
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
   * Build a topics filter row for the "EvPropuesta" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evPropuestaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvPropuesta", topicValues);
  }
  /**
   * Build a topics filter row for the "EvAbonoFinal" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evAbonoFinalEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvAbonoFinal", topicValues);
  }
  /**
   * Build a topics filter row for the "EvFinalizada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evFinalizadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvFinalizada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvRequisitos" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evRequisitosEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvRequisitos", topicValues);
  }
  /**
   * Build a topics filter row for the "EvBovedaToken" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evBovedaTokenEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("EvBovedaToken", topicValues);
  }
  /**
   * Build a topics filter row for the "EvDeudaPagada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evDeudaPagadaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvDeudaPagada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvIntercambio" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evIntercambioEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvIntercambio", topicValues);
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
  /**
   * Build a topics filter row for the "EvCierreAnticipado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evCierreAnticipadoEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvCierreAnticipado", topicValues);
  }
  /**
   * Build a topics filter row for the "EvGarantiaRepartida" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evGarantiaRepartidaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvGarantiaRepartida", topicValues);
  }
  /**
   * Build a topics filter row for the "EvPropuestaRetirada" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evPropuestaRetiradaEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("EvPropuestaRetirada", topicValues);
  }
  /**
   * Build a topics filter row for the "EvHistorialConfigurado" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  evHistorialConfiguradoEventFilter(): string[] {
    return this.spec.eventTopicFilter("EvHistorialConfigurado");
  }
}