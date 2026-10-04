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
}
