//! Misión **M1**: tiempos de la vida real.
//!
//! - **Calendario anclado** (`inicio_siguiente`): las fechas de pago no se corren aunque una ronda
//!   se cierre tarde.
//! - **Bóveda rápida** (`configurar_boveda_rapida`): una bóveda acelerada solo para tandas de prueba
//!   (rondas de hasta 10 minutos), para que el rendimiento se note en una demo. Las tandas reales
//!   usan la bóveda principal, sin acelerar. Cada tanda guarda su bóveda al crearse.
//!
//! Diseño y decisiones: `docs/tiempos-y-deudas.md`.
use soroban_sdk::{contractimpl, Address, Env};

use crate::almacenamiento::*;
use crate::{
    ClaveM1, DataKey, Error, EvBovedaRapida, Tanda, TandaContract, TandaContractArgs,
    TandaContractClient,
};

/// Si el cierre de una ronda se atrasa mucho, la siguiente igual deja al menos este tiempo para
/// pagar (o la ronda completa, si es más corta).
pub(crate) const GRACIA_MAX_SEG: u64 = 3 * 86_400;

/// Inicio de la ronda que sigue a la de `t` (la que se está cerrando), con calendario anclado:
///
/// `vence_siguiente = max(vence_anterior + periodo, ahora + min(periodo, 3 días))`
///
/// - Las fechas quedan fijas (cada `periodo`) aunque el cierre llegue tarde.
/// - Si el cierre se atrasó tanto que quedaría muy poco para pagar, se da al menos
///   `min(periodo, 3 días)`: nadie queda "tarde" por culpa de un cierre atrasado.
/// - Con rondas de hasta 3 días (por ejemplo, la demo de 1 minuto) da lo mismo que antes:
///   la ronda siguiente empieza al cerrar.
///
/// El resultado nunca está en el futuro (`<= ahora`), así que la ronda nueva ya está abierta.
pub(crate) fn inicio_siguiente(t: &Tanda, ahora: u64) -> u64 {
    let vence_anterior = t.inicio_ronda + t.periodo_seg;
    let gracia = t.periodo_seg.min(GRACIA_MAX_SEG);
    let vence = (vence_anterior + t.periodo_seg).max(ahora + gracia);
    vence - t.periodo_seg
}

#[contractimpl]
impl TandaContract {
    /// (Solo el admin) Bóveda rápida para tandas de prueba (rondas de hasta 10 minutos).
    /// `None` la quita. Solo afecta a las tandas que se creen después: cada tanda conserva la suya.
    pub fn configurar_boveda_rapida(env: Env, boveda: Option<Address>) -> Result<(), Error> {
        let s = env.storage().instance();
        let admin: Address = s.get(&DataKey::Admin).ok_or(Error::NoInicializado)?;
        admin.require_auth();
        match &boveda {
            Some(b) => s.set(&ClaveM1::BovedaRapida, b),
            None => s.remove(&ClaveM1::BovedaRapida),
        }
        extender_instancia(&env);
        EvBovedaRapida { boveda }.publish(&env);
        Ok(())
    }

    /// La bóveda donde está la garantía de la tanda `id` (la web la usa para mostrar el rendimiento).
    pub fn get_boveda(env: Env, id: u32) -> Result<Address, Error> {
        let t = cargar_tanda(&env, id)?;
        match env.storage().persistent().get(&ClaveM1::BovedaDe(id)) {
            Some(b) => Ok(b),
            None => elegir_boveda(&env, &t),
        }
    }
}
