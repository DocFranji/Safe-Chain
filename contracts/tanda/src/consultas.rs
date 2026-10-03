//! Consultas: funciones de solo lectura que usa la interfaz. No cambian nada ni piden firma.
use soroban_sdk::{contractimpl, Address, Env, Vec};

use crate::almacenamiento::*;
use crate::turnos::{colateral_para, posicion_al_unirse};
use crate::{
    DataKey, Error, Miembro, Tanda, TandaContract, TandaContractArgs, TandaContractClient,
};

#[contractimpl]
impl TandaContract {
    // Consultas (no cambian nada, no cuestan firma): las usa la interfaz.
    // ---------------------------------------------------------------------

    pub fn get_tanda(env: Env, id: u32) -> Result<Tanda, Error> {
        cargar_tanda(&env, id)
    }

    pub fn get_miembros(env: Env, id: u32) -> Result<Vec<(Address, Miembro)>, Error> {
        cargar_tanda(&env, id)?;
        let mut out = Vec::new(&env);
        for dir in cargar_miembros(&env, id).iter() {
            let m = cargar_miembro(&env, id, &dir)?;
            out.push_back((dir, m));
        }
        Ok(out)
    }

    /// (ronda actual, fecha límite, quiénes ya pagaron)
    pub fn get_ronda(env: Env, id: u32) -> Result<(u32, u64, Vec<Address>), Error> {
        let t = cargar_tanda(&env, id)?;
        let mut pagaron = Vec::new(&env);
        for dir in cargar_miembros(&env, id).iter() {
            if env
                .storage()
                .persistent()
                .has(&DataKey::Pagado(id, t.ronda_actual, dir.clone()))
            {
                pagaron.push_back(dir);
            }
        }
        Ok((t.ronda_actual, t.inicio_ronda + t.periodo_seg, pagaron))
    }

    /// Cuántas tandas se han creado (los ids van de 1 a este número).
    pub fn total_tandas(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Contador)
            .unwrap_or(0)
    }

    /// Colateral que pagaría el próximo en unirse (para mostrarlo antes de firmar).
    pub fn colateral_siguiente(env: Env, id: u32) -> Result<i128, Error> {
        let t = cargar_tanda(&env, id)?;
        let pos = posicion_al_unirse(&env, &t, &cargar_miembros(&env, id));
        if pos >= t.n_miembros {
            return Err(Error::TandaLlena);
        }
        Ok(colateral_para(&t, pos))
    }
}
