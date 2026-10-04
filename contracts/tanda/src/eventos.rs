//! Eventos: avisos que el contrato publica y la interfaz escucha (línea de tiempo, resultados).
use soroban_sdk::{contractevent, Address};

// ---------------------------------------------------------------------------
// Eventos: avisos que el contrato publica y la interfaz escucha para actualizarse.
// ---------------------------------------------------------------------------

#[contractevent(topics = ["creada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvCreada {
    #[topic]
    pub id: u32,
    pub creador: Address,
    pub cuota: i128,
    pub n_miembros: u32,
}

#[contractevent(topics = ["unido"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvUnido {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub posicion: u32,
    pub colateral: i128,
}

#[contractevent(topics = ["iniciada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvIniciada {
    #[topic]
    pub id: u32,
    pub inicio_ronda: u64,
}

#[contractevent(topics = ["pago"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvPago {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub ronda: u32,
    pub tarde: bool,
}

/// El momento clave de la demo: "el colateral de Ana cubrió su cuota".
#[contractevent(topics = ["cubierto"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvCubierto {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub ronda: u32,
    pub monto: i128,
}

#[contractevent(topics = ["moroso"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvMoroso {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub deuda: i128,
}

#[contractevent(topics = ["ronda"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvRonda {
    #[topic]
    pub id: u32,
    pub ronda: u32,
    pub beneficiario: Address,
    pub monto_pagado: i128,
}

#[contractevent(topics = ["liquidado"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvLiquidado {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub monto: i128,
}

#[contractevent(topics = ["finalizada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvFinalizada {
    #[topic]
    pub id: u32,
    pub rendimiento: i128,
    pub fondo_premios: i128,
    pub retenido: i128,
    /// Lo que no se pudo repartir porque no había a quién (caso extremo).
    pub sin_repartir: i128,
}

#[contractevent(topics = ["cancelada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvCancelada {
    #[topic]
    pub id: u32,
}

// ---------------------------------------------------------------------------
// --- M1: tiempos reales y pago de deudas ---
// ---------------------------------------------------------------------------

/// Alguien pagó (toda o una parte) la deuda de `miembro`. Puede ser el miembro u otra persona.
#[contractevent(topics = ["deuda_pag"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvDeudaPagada {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub pagador: Address,
    pub monto: i128,
    pub deuda_restante: i128,
}

/// Una parte de ese pago llegó a quien cobró de menos en la ronda `ronda`.
/// Si su bolsa estaba retenida (también era moroso), `retenida` es `true` y el monto se sumó a esa bolsa.
#[contractevent(topics = ["abono"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvAbono {
    #[topic]
    pub id: u32,
    pub deudor: Address,
    pub acreedor: Address,
    pub ronda: u32,
    pub monto: i128,
    pub retenida: bool,
}

/// Un moroso saldó su deuda y recuperó su bolsa retenida: recibió `monto`; se descontaron `multas`
/// (al fondo de premios) y `garantia` (repone su garantía para las cuotas que aún debe).
#[contractevent(topics = ["bolsa_rec"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvBolsaRecuperada {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub monto: i128,
    pub multas: i128,
    pub garantia: i128,
}

/// El admin cambió la bóveda rápida (solo afecta a las tandas que se creen después).
#[contractevent(topics = ["bov_rapid"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvBovedaRapida {
    pub boveda: Option<Address>,
}

// ---------------------------------------------------------------------------
// --- M2: historial crediticio ---
// ---------------------------------------------------------------------------

/// El admin conectó (o desconectó, con `None`) el contrato de historial.
#[contractevent(topics = ["hist_conf"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvHistorialConfigurado {
    pub historial: Option<Address>,
}

/// El creador de la tanda `id` fijó sus requisitos de historial.
#[contractevent(topics = ["requisitos"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvRequisitos {
    #[topic]
    pub id: u32,
    pub puntaje_minimo: u32,
    pub descuento: bool,
}
