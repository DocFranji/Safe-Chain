//! Datos que el contrato guarda en la blockchain y sus códigos de error.
use soroban_sdk::{contracterror, contracttype, Address};

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
}
