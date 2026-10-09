//! Misión **M2**: conexión con el historial crediticio y requisitos por tanda.
//!
//! - `configurar_historial` (admin): conecta el contrato `historial`. Sin esto, todo funciona como antes.
//! - `configurar_requisitos` (creador, tanda abierta y vacía): puntaje mínimo para entrar y descuento
//!   de garantía según el nivel.
//! - Consultas para la web: `get_historial`, `get_requisitos`, `colateral_para_miembro`.
//!
//! La tanda le reporta hechos al historial desde `ganchos.rs`. Diseño: `docs/historial.md`.
use soroban_sdk::{contractclient, contractimpl, Address, Env, Vec};

use crate::almacenamiento::*;
use crate::turnos::colateral_base_siguiente;
use crate::{
    ganchos, ClaveM2, DataKey, Error, Estado, EvHistorialConfigurado, EvRequisitos, HechoMiembro,
    Requisitos, TandaContract, TandaContractArgs, TandaContractClient,
};

/// Lo que la tanda usa del contrato `historial` (`contracts/historial`).
#[allow(dead_code)] // solo se usa a través del cliente generado
#[contractclient(name = "HistorialClient")]
pub trait HistorialIface {
    fn registrar_lote(
        env: Env,
        emisor: Address,
        tanda_id: u32,
        cuota: i128,
        hechos: Vec<HechoMiembro>,
    );
    fn puntaje(env: Env, dir: Address) -> u32;
    fn beneficio_colateral_bps(env: Env, dir: Address) -> u32;
    fn tiene_mora(env: Env, dir: Address) -> bool;
}

/// Dirección del historial, si el admin lo configuró.
pub(crate) fn direccion_historial(env: &Env) -> Option<Address> {
    env.storage().instance().get(&ClaveM2::Historial)
}

/// Requisitos de la tanda `id` (por defecto, ninguno).
pub(crate) fn requisitos_de(env: &Env, id: u32) -> Requisitos {
    env.storage()
        .persistent()
        .get(&ClaveM2::Requisitos(id))
        .unwrap_or_default()
}

#[contractimpl]
impl TandaContract {
    /// (admin) Conecta el contrato de historial (o lo desconecta con `None`).
    /// La tanda debe estar autorizada como emisor en el historial para que sus hechos cuenten.
    pub fn configurar_historial(env: Env, historial: Option<Address>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NoInicializado)?;
        admin.require_auth();
        let s = env.storage().instance();
        match &historial {
            Some(h) => s.set(&ClaveM2::Historial, h),
            None => s.remove(&ClaveM2::Historial),
        }
        extender_instancia(&env);
        EvHistorialConfigurado { historial }.publish(&env);
        Ok(())
    }

    /// (creador) Requisitos de historial de la tanda `id`. Solo mientras está abierta y sin miembros,
    /// para que nadie entre con unas reglas y después le cambien otras.
    pub fn configurar_requisitos(
        env: Env,
        id: u32,
        puntaje_minimo: u32,
        descuento: bool,
    ) -> Result<(), Error> {
        let t = cargar_tanda(&env, id)?;
        t.creador.require_auth();
        if t.estado != Estado::Abierta || !cargar_miembros(&env, id).is_empty() {
            return Err(Error::RequisitosBloqueados);
        }
        if (puntaje_minimo > 0 || descuento) && direccion_historial(&env).is_none() {
            return Err(Error::HistorialNoConfigurado);
        }
        let clave = ClaveM2::Requisitos(id);
        env.storage().persistent().set(
            &clave,
            &Requisitos {
                puntaje_minimo,
                descuento,
            },
        );
        renovar_para_tanda(&env, &t, &clave);
        EvRequisitos {
            id,
            puntaje_minimo,
            descuento,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_historial(env: Env) -> Option<Address> {
        direccion_historial(&env)
    }

    pub fn get_requisitos(env: Env, id: u32) -> Result<Requisitos, Error> {
        cargar_tanda(&env, id)?;
        Ok(requisitos_de(&env, id))
    }

    /// Garantía que dejaría `miembro` si se uniera ahora, con el descuento de su historial
    /// (para mostrarla antes de firmar).
    pub fn colateral_para_miembro(env: Env, id: u32, miembro: Address) -> Result<i128, Error> {
        let t = cargar_tanda(&env, id)?;
        // (M3) Garantía base del próximo en unirse según el modo de turnos (ACORDADO con M2).
        let base = colateral_base_siguiente(&env, &t, id)?;
        Ok(ganchos::ajustar_colateral(&env, &t, id, &miembro, base))
    }
}
