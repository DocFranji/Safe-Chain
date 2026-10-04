//! Eventos: avisos que el contrato publica y la interfaz escucha (línea de tiempo, resultados).
use soroban_sdk::{contractevent, Address, Vec};

use crate::ModoTurnos;

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
// --- M3: turnos ---
// Todos con tópicos [nombre, id], como los de arriba: la web los lee con el mismo filtro.
// ---------------------------------------------------------------------------

/// La tanda se creó con opciones de turnos (`crear_tanda_avanzada`).
#[contractevent(topics = ["opciones"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvOpciones {
    #[topic]
    pub id: u32,
    pub modo: ModoTurnos,
    pub permitir_intercambio: bool,
    pub prima_max_bps: u32,
    pub descuento_max_bps: u32,
}

/// El contrato sorteó el orden de cobro: `orden[i]` cobra en la ronda `i`.
#[contractevent(topics = ["sorteo"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvSorteo {
    #[topic]
    pub id: u32,
    pub orden: Vec<Address>,
}

/// Subasta: alguien ofreció recibir `descuento` menos para cobrar en esta ronda.
#[contractevent(topics = ["oferta"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvOferta {
    #[topic]
    pub id: u32,
    pub ronda: u32,
    pub miembro: Address,
    pub descuento_bps: u32,
    /// En dinero, si todos pagan la ronda.
    pub descuento: i128,
}

/// Subasta: quién se quedó con la bolsa de la ronda y cuánto recibió cada uno de los demás.
#[contractevent(topics = ["subasta"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvSubasta {
    #[topic]
    pub id: u32,
    pub ronda: u32,
    pub ganador: Address,
    pub descuento: i128,
    /// Lo que se sumó a la garantía de cada uno de los demás.
    pub dividendo: i128,
    /// Nadie ofertó (o la oferta no valía): cobró el siguiente del orden de respaldo.
    pub por_respaldo: bool,
}

/// Precio por turno: `prima` > 0 la pagó quien cobró (se apartó de su bolsa); < 0 la recibió.
#[contractevent(topics = ["prima"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvPrima {
    #[topic]
    pub id: u32,
    pub ronda: u32,
    pub miembro: Address,
    pub prima: i128,
}

/// De la bolsa de quien cobró se apartó `monto` para completar su garantía (vuelve al final).
#[contractevent(topics = ["garantia"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvGarantia {
    #[topic]
    pub id: u32,
    pub ronda: u32,
    pub miembro: Address,
    pub monto: i128,
}

#[contractevent(topics = ["inter_prop"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvPropuesta {
    #[topic]
    pub id: u32,
    pub de: Address,
    pub con: Address,
    pub compensacion: i128,
}

/// Dos miembros cambiaron de turno: `de` ahora cobra en `turno_de` y `con` en `turno_con`.
#[contractevent(topics = ["inter_ok"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvIntercambio {
    #[topic]
    pub id: u32,
    pub de: Address,
    pub con: Address,
    pub turno_de: u32,
    pub turno_con: u32,
    pub compensacion: i128,
}

/// Se retiró una propuesta de intercambio (lo guardado volvió a `de`).
#[contractevent(topics = ["inter_no"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvPropuestaRetirada {
    #[topic]
    pub id: u32,
    pub de: Address,
    pub con: Address,
}
