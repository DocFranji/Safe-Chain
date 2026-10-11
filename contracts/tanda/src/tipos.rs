//! Datos que el contrato guarda en la blockchain y sus códigos de error.
use soroban_sdk::{contracterror, contracttype, Address, Vec};

// ---------------------------------------------------------------------------
// Tipos guardados en la blockchain
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Estado {
    Abierta,
    Activa,
    PorLiquidar,
    Finalizada,
    Cancelada,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tanda {
    pub creador: Address,
    pub token: Address,
    pub cuota: i128,
    pub n_miembros: u32,
    pub periodo_seg: u64,
    pub penalidad_bps: u32,
    pub cobertura_bps: u32,
    pub estado: Estado,
    /// Ronda en curso: 0..n_miembros. En la ronda `r` cobra el miembro con `posicion == r`.
    pub ronda_actual: u32,
    /// Momento (timestamp) en que abrió la ronda actual. Vence en `inicio_ronda + periodo_seg`.
    pub inicio_ronda: u64,
    /// Participaciones de ESTA tanda en la bóveda (varias tandas comparten bóveda).
    pub shares_boveda: i128,
    /// Multas cobradas (se llena en `finalizar`).
    pub fondo_premios: i128,
    /// Bolsas que no se pagaron porque el beneficiario era moroso.
    pub retenido: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Miembro {
    /// Turno: 0 cobra en la ronda 0.
    pub posicion: u32,
    pub colateral_inicial: i128,
    /// Colateral que le queda (baja si cubre impagos o multas).
    pub colateral: i128,
    pub atrasos: u32,
    pub multas_pendientes: i128,
    /// Cuotas que su colateral no alcanzó a cubrir.
    pub deuda: i128,
    pub moroso: bool,
    /// Ya recibió su turno.
    pub cobro: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    // "instance": datos del contrato completo (viven mientras viva el contrato)
    Admin,
    Boveda,
    Verificador,
    Contador,
    // "persistent": un registro por tanda / miembro
    Tanda(u32),
    Miembros(u32),
    Miembro(u32, Address),
    Pagado(u32, u32, Address),
    Verificado(Address),
}

// ---------------------------------------------------------------------------
// Errores: un código fijo por cada problema, para que la interfaz muestre un
// mensaje claro en español en vez de "transaction failed".
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    YaInicializado = 1,
    NoEncontrada = 2,
    EstadoInvalido = 3,
    ParametroInvalido = 4,
    YaEsMiembro = 5,
    TandaLlena = 6,
    NoEsMiembro = 7,
    YaPago = 8,
    RondaNoVencida = 9,
    MiembroMoroso = 10,
    NoVerificado = 11,
    NoAutorizado = 12,
    NoInicializado = 13,
    // --- M1: pagar deudas (14–19). Sin comentarios `///`: el SDK de JS usaría ese texto como
    // mensaje en vez del nombre, y la web traduce por nombre o por código (contrato.ts). ---
    SinDeuda = 14,      // esa persona no tiene deuda en esta tanda
    PagoExcesivo = 15,  // el monto es mayor que la deuda
    MontoInvalido = 16, // el monto debe ser mayor que cero
    // --- M2: historial crediticio (20–29). Sin `///` por la misma razón. ---
    HistorialNoConfigurado = 20, // no hay historial configurado o no responde
    PuntajeInsuficiente = 21,    // la tanda pide un puntaje mínimo que no alcanza
    RequisitosBloqueados = 22,   // la tanda ya no está abierta o ya tiene miembros
    // --- M3: turnos (30–49) ---
    OpcionesInvalidas = 30,
    ModoNoPermite = 31,
    TurnoInvalido = 32,
    TurnoOcupado = 33,
    OfertaInvalida = 34,
    NoPuedeOfertar = 35,
    SinSubasta = 36,
    IntercambioInvalido = 37,
    PropuestaExistente = 38,
    SinPropuesta = 39,
    TurnoExigeHistorial = 40,
    FaseEquivocada = 41,
    SelloInvalido = 42,
    SelloRepetido = 43,
    // --- M4: bóveda por token (50–59; el adaptador de Blend usa 50–53 con sus propios nombres) ---
    TokenSinBoveda = 55,    // no hay bóveda para el token de esta tanda
    BovedaDeOtroToken = 56, // la bóveda que se quiere registrar guarda otro token
    // --- M1 (v4): cerrar la ronda antes (60–64) ---
    SubastaNoCierraAntes = 60, // en la subasta la ronda no se puede cerrar antes de que venza
    CierreMuyAdelantado = 61,  // la fecha límite siguiente quedaría a más de 120 días
    // --- M2 v4: bloqueo por deuda (65–69) ---
    DeudaPendiente = 65, // tiene una mora sin saldar en alguna tanda: no puede unirse a otra
    // --- M1 v5: nombre y reparto de la garantía (70–74) ---
    NombreInvalido = 70, // el nombre de la tanda no tiene de 2 a 40 caracteres permitidos
}

// ---------------------------------------------------------------------------
// --- M1: tiempos reales y pago de deudas ---
// ---------------------------------------------------------------------------

/// Una parte de la deuda de un moroso: lo que su garantía no alcanzó a cubrir en la ronda `ronda`
/// y a quién se le debe (`acreedor`: quien cobró esa ronda y recibió de menos).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Faltante {
    pub ronda: u32,
    pub acreedor: Address,
    pub monto: i128,
}

/// La deuda de un miembro, ronda por ronda (`get_deuda`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deuda {
    /// Lo que todavía debe, del faltante más viejo al más nuevo. Suman `Miembro.deuda`.
    pub faltantes: Vec<Faltante>,
    /// Su bolsa, si se retuvo porque era moroso cuando le tocaba cobrar. La recupera al saldar.
    pub bolsa_retenida: i128,
    /// Cuánto se ha pagado de su deuda hasta ahora (por el miembro o por otras personas).
    pub pagado: i128,
}

/// (v5) Una parte de la garantía de un moroso que se repartió al finalizar: `acreedor` es quien
/// cobró de menos. Si su propia bolsa había quedado retenida (también era moroso), `a_pozo` es `true`:
/// esa parte no se le paga a él, va al fondo que se reparte entre quienes cumplieron.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParteGarantia {
    pub acreedor: Address,
    pub monto: i128,
    pub a_pozo: bool,
}

/// Claves de almacenamiento de M1. Enum propio para no tocar `DataKey`.
#[contracttype]
#[derive(Clone)]
pub enum ClaveM1 {
    /// (instancia) Bóveda rápida, acelerada, para tandas de prueba con rondas cortas. Opcional.
    BovedaRapida,
    /// Bóveda donde guarda su garantía la tanda `id`. Se elige al crearla y no cambia.
    BovedaDe(u32),
    /// Deuda del miembro en la tanda `id` (solo existe si alguna vez debió algo).
    DeudaDe(u32, Address),
    /// (v4) Quiénes recibieron en partes iguales las bolsas retenidas al finalizar la tanda `id`. Solo
    /// existe si hubo bolsa retenida: a ellos les llega lo que se pague después de esas rondas.
    Repartidos(u32),
    /// (v5) Nombre de la tanda `id`. Solo existe si el creador le puso uno.
    Nombre(u32),
}

// ---------------------------------------------------------------------------
// --- M2: historial crediticio ---
// ---------------------------------------------------------------------------

/// Requisitos de historial de una tanda (`configurar_requisitos`). Por defecto: ninguno.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Requisitos {
    /// Puntaje mínimo para unirse (0 = cualquiera puede).
    pub puntaje_minimo: u32,
    /// Dar descuento de garantía según el nivel del historial.
    pub descuento: bool,
}

/// Lo que la tanda le reporta al contrato `historial` (mismos nombres que allá).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Hecho {
    CuotaATiempo,
    CuotaTarde,
    CuotaCubierta,
    Moroso,
    DeudaSaldada,
    TandaCumplida,
    TandaConAtrasos,
    Cobro,
}

/// Un hecho de un miembro (mismo formato que `historial::HechoMiembro`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HechoMiembro {
    pub miembro: Address,
    pub hecho: Hecho,
    pub monto: i128,
}

/// Claves de almacenamiento de M2. Enum propio para no tocar `DataKey`.
#[contracttype]
#[derive(Clone)]
pub enum ClaveM2 {
    /// (instancia) Contrato de historial. Si no existe, los ganchos no hacen nada.
    Historial,
    /// Requisitos de la tanda `id` (solo existe si el creador los configuró).
    Requisitos(u32),
    /// (temporal) Hechos de la operación en curso de la tanda `id`, para enviarlos en un solo lote.
    HechosPendientes(u32),
}

// ---------------------------------------------------------------------------
// --- M3: turnos ---
// Cómo se decide quién cobra en cada ronda (ver docs/turnos.md). Las tandas creadas con
// `crear_tanda` no usan nada de esto: su turno sigue siendo el orden de llegada.
// ---------------------------------------------------------------------------

/// `Miembro.posicion` de quien todavía no tiene turno (sorteo antes de llenarse, subasta antes de ganar).
pub const SIN_TURNO: u32 = u32::MAX;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModoTurnos {
    /// El orden de llegada decide el turno (como siempre).
    Llegada,
    /// Cada quien elige un turno libre al unirse, gratis.
    Eleccion,
    /// Cada quien elige turno: los primeros pagan una prima y los últimos la reciben.
    PrecioPorTurno,
    /// El contrato sortea el orden cuando se llena la tanda.
    Sorteo,
    /// Cada ronda cobra quien ofrezca el mayor descuento sobre la bolsa.
    Subasta,
}

/// Opciones de turnos que elige el creador (`crear_tanda_avanzada`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OpcionesTanda {
    pub modo: ModoTurnos,
    /// Dos miembros pueden cambiar sus turnos futuros (no aplica a la subasta).
    pub permitir_intercambio: bool,
    /// PrecioPorTurno: prima del primer turno, en bps sobre la bolsa. El último recibe lo mismo.
    pub prima_max_bps: u32,
    /// Subasta: descuento máximo que se puede ofrecer, en bps sobre la bolsa.
    pub descuento_max_bps: u32,
    /// Elegir turno y precio por turno: cuántos de los primeros turnos piden historial (M2).
    /// 0 = ninguno. Esos turnos solo los toma quien tenga al menos `puntaje_primeros`.
    pub primeros_con_historial: u32,
    /// Puntaje de historial que piden los primeros turnos (0 si `primeros_con_historial` es 0).
    pub puntaje_primeros: u32,
    /// Subasta: las ofertas se sellan en la primera mitad de la ronda y se revelan en la segunda.
    pub ofertas_selladas: bool,
}

/// Subasta: la mejor oferta de una ronda.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Oferta {
    pub ronda: u32,
    pub miembro: Address,
    pub descuento_bps: u32,
}

/// Intercambio pendiente: `de` propone cambiar su turno por el de `con`.
/// `compensacion` > 0: `de` le paga a `con` (queda guardada en el contrato hasta aceptar o retirar).
/// `compensacion` < 0: `con` le paga a `de` al aceptar.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Propuesta {
    pub de: Address,
    pub con: Address,
    pub compensacion: i128,
}

/// Todo lo de turnos que la web necesita, en una sola lectura (`get_estado_turnos`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EstadoTurnos {
    pub opciones: OpcionesTanda,
    /// Subasta: quién hizo la mejor oferta de la ronda en curso (nadie todavía: `None`).
    pub mejor_postor: Option<Address>,
    /// Subasta: descuento de esa oferta, en bps sobre la bolsa (0 si nadie ha ofertado).
    pub mejor_oferta_bps: u32,
    /// Subasta: orden sorteado al llenarse; decide quién cobra en las rondas sin ofertas.
    pub respaldo: Vec<Address>,
    /// Intercambios pendientes.
    pub propuestas: Vec<Propuesta>,
    /// PrecioPorTurno: primas ya cobradas que esperan a los últimos turnos.
    pub fondo_primas: i128,
    /// Subasta sellada: quiénes sellaron una oferta en la ronda en curso y aún no la revelan.
    pub sellos: Vec<Address>,
    /// Subasta sellada en curso: hasta este momento se sella; después, hasta que vence, se revela
    /// (0 si no aplica).
    pub fin_sellado: u64,
}

// --- M4: bóveda por token ---

/// Claves de la misión M4 (enum propio para no tocar `DataKey`).
#[contracttype]
#[derive(Clone)]
pub enum ClaveM4 {
    /// (instancia) Bóveda para las tandas nuevas en ese token. Por ejemplo, USDC de Blend → adaptador
    /// de Blend (rendimiento real). Los tokens sin bóveda propia siguen la regla de M1.
    BovedaToken(Address),
}
