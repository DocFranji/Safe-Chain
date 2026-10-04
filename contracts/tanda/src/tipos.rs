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
}
