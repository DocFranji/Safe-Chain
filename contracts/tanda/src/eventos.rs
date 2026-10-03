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
