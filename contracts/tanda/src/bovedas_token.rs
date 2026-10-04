//! Misión **M4**: una bóveda por token (`docs/blend.md` §6).
//!
//! - **TUSD** (el token de la bóveda general) sigue la regla de M1: bóveda rápida para las tandas de
//!   prueba y principal para las demás. Rendimiento simulado.
//! - **Otro token** usa la bóveda que el admin registre para él. Por ejemplo: USDC de prueba de Blend →
//!   adaptador de Blend (`contracts/adaptador_blend`): rendimiento real.
//!
//! Cada tanda guarda su bóveda al crearse (M1, `fijar_boveda`): cambiar o quitar un registro solo
//! afecta a las tandas nuevas y nunca mueve el dinero de las que ya existen.
use soroban_sdk::{contractimpl, Address, Env, Symbol, Vec};

use crate::almacenamiento::*;
use crate::{
    ClaveM4, DataKey, Error, EvBovedaToken, TandaContract, TandaContractArgs, TandaContractClient,
};

#[contractimpl]
impl TandaContract {
    /// (Solo el admin) Bóveda para las tandas nuevas en `token`. `None` quita el registro y el token
    /// vuelve a la regla general. Si la bóveda dice qué token guarda (el adaptador de Blend lo dice),
    /// tiene que ser `token`.
    pub fn registrar_boveda(
        env: Env,
        token: Address,
        boveda: Option<Address>,
    ) -> Result<(), Error> {
        let s = env.storage().instance();
        let admin: Address = s.get(&DataKey::Admin).ok_or(Error::NoInicializado)?;
        admin.require_auth();
        let clave = ClaveM4::BovedaToken(token.clone());
        match &boveda {
            Some(b) => {
                revisar_token(&env, b, &token).map_err(|_| Error::BovedaDeOtroToken)?;
                s.set(&clave, b);
            }
            None => s.remove(&clave),
        }
        extender_instancia(&env);
        EvBovedaToken { token, boveda }.publish(&env);
        Ok(())
    }

    /// La bóveda registrada para `token`, o `None` si ese token sigue la regla general.
    pub fn get_boveda_token(env: Env, token: Address) -> Option<Address> {
        boveda_registrada(&env, &token)
    }
}

pub(crate) fn boveda_registrada(env: &Env, token: &Address) -> Option<Address> {
    env.storage()
        .instance()
        .get(&ClaveM4::BovedaToken(token.clone()))
}

/// Si la bóveda responde `token()` (como el adaptador de Blend), tiene que guardar `token`.
/// Una bóveda que no lo responde (la simulada) se acepta, como hasta ahora.
pub(crate) fn revisar_token(env: &Env, boveda: &Address, token: &Address) -> Result<(), Error> {
    let r = env.try_invoke_contract::<Address, soroban_sdk::Error>(
        boveda,
        &Symbol::new(env, "token"),
        Vec::new(env),
    );
    match r {
        Ok(Ok(guardado)) if &guardado != token => Err(Error::TokenSinBoveda),
        _ => Ok(()),
    }
}
