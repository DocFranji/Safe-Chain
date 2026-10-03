//! # Adaptador de Blend
//!
//! Conecta la tanda con un pool REAL de Blend (protocolo de préstamos de Stellar), para que
//! el colateral gane intereses de verdad en lugar de simulados.
//!
//! Tiene exactamente la misma interfaz que `boveda_simulada`
//! (`depositar`, `retirar`, `retirar_monto`, `valor`), así que el contrato de la tanda
//! no cambia: solo se inicializa una tanda nueva con este adaptador como `boveda`.
//!
//! ## Cómo funciona
//! - El ADAPTADOR es el "usuario" de Blend: todo el dinero queda depositado a su nombre.
//! - Blend le entrega "bTokens" por lo que deposita. Cada bToken vale `b_rate` tokens
//!   (con 12 decimales), y el `b_rate` sube con el tiempo: ese es el interés.
//! - Las "participaciones" (shares) que le devolvemos a la tanda son esos mismos bTokens.
//!   Llevamos la cuenta de cuántos bTokens le pertenecen a cada dueño, para que varias
//!   tandas puedan compartir el adaptador sin mezclar su dinero.
//!
//! Probado en testnet a mano (1 oct 2026) contra el pool `TestnetV2`:
//! supply (request_type 0) y withdraw (request_type 1) funcionan con XLM.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec, Address, Env, IntoVal, Map,
    Symbol, Val, Vec,
};

#[cfg(test)]
mod test;

/// El b_rate de Blend v2 usa 12 decimales.
pub const SCALAR_12: i128 = 1_000_000_000_000;
pub const SUPPLY: u32 = 0;
pub const WITHDRAW: u32 = 1;

const TTL_UMBRAL: u32 = 17_280;
const TTL_EXTENDER: u32 = 518_400;

/// Un pedido para el pool de Blend. Mismos nombres de campos que en Blend,
/// para que se codifique igual.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request {
    pub address: Address,
    pub amount: i128,
    pub request_type: u32,
}

#[contracttype]
#[derive(Clone)]
enum Clave {
    Pool,
    Token,
    Shares(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ErrorAdaptador {
    MontoInvalido = 1,
    SharesInsuficientes = 2,
    ReservaNoEncontrada = 3,
}

#[contract]
pub struct AdaptadorBlend;

#[contractimpl]
impl AdaptadorBlend {
    /// - `pool`: el pool de Blend (en testnet: TestnetV2).
    /// - `token`: el activo que se deposita. Debe ser una reserva del pool (por ejemplo XLM)
    ///   y el MISMO token que usa la tanda.
    pub fn __constructor(env: Env, pool: Address, token: Address) {
        env.storage().instance().set(&Clave::Pool, &pool);
        env.storage().instance().set(&Clave::Token, &token);
    }

    /// Recibe `monto` de `desde` (que antes hizo `approve` a este adaptador) y lo deposita
    /// en Blend. Devuelve los bTokens que quedan a nombre de `desde`.
    pub fn depositar(env: Env, desde: Address, monto: i128) -> Result<i128, ErrorAdaptador> {
        desde.require_auth();
        if monto <= 0 {
            return Err(ErrorAdaptador::MontoInvalido);
        }
        let (pool, tok) = (Self::pool(&env), Self::token_dir(&env));
        let yo = env.current_contract_address();
        let t = token::Client::new(&env, &tok);

        // 1) Traer los tokens desde la tanda (usa el permiso que nos dio).
        t.transfer_from(&yo, &desde, &yo, &monto);

        // 2) Darle permiso al pool y pedirle que los "jale" (submit_with_allowance).
        //    Así el pool mueve los tokens con su propia autorización.
        t.approve(&yo, &pool, &monto, &(env.ledger().sequence() + 100));
        let antes = Self::btokens_propios(&env)?;
        Self::submit(&env, "submit_with_allowance", &yo, SUPPLY, monto);
        let despues = Self::btokens_propios(&env)?;

        let recibidas = despues - antes;
        Self::sumar_shares(&env, &desde, recibidas)?;
        Ok(recibidas)
    }

    /// Quema `shares` bTokens de `hacia` y le entrega lo que valen hoy.
    pub fn retirar(env: Env, hacia: Address, shares: i128) -> Result<i128, ErrorAdaptador> {
        hacia.require_auth();
        if shares <= 0 {
            return Err(ErrorAdaptador::MontoInvalido);
        }
        // Le quitamos las participaciones completas antes de mover dinero.
        Self::sumar_shares(&env, &hacia, -shares)?;
        // Monto = shares × b_rate, redondeado hacia ABAJO. Blend quema
        // redondeando hacia ARRIBA, así que nunca se gasta más de `shares` bTokens:
        // ninguna tanda puede tocar bTokens de otra.
        let monto = shares * Self::b_rate(&env)? / SCALAR_12;
        if monto > 0 {
            Self::submit(&env, "submit", &hacia, WITHDRAW, monto);
        }
        Ok(monto)
    }

    /// Entrega exactamente `monto` tokens a `hacia` y devuelve cuántos bTokens se quemaron.
    pub fn retirar_monto(env: Env, hacia: Address, monto: i128) -> Result<i128, ErrorAdaptador> {
        hacia.require_auth();
        if monto <= 0 {
            return Err(ErrorAdaptador::MontoInvalido);
        }
        let antes = Self::btokens_propios(&env)?;
        Self::submit(&env, "submit", &hacia, WITHDRAW, monto);
        let despues = Self::btokens_propios(&env)?;
        let quemadas = antes - despues;
        // Si `hacia` no tenía suficientes, esto falla y se revierte TODA la transacción.
        Self::sumar_shares(&env, &hacia, -quemadas)?;
        Ok(quemadas)
    }

    /// Cuántos tokens valen hoy `shares` bTokens.
    pub fn valor(env: Env, shares: i128) -> Result<i128, ErrorAdaptador> {
        Ok(shares * Self::b_rate(&env)? / SCALAR_12)
    }

    pub fn shares_de(env: Env, duenio: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Clave::Shares(duenio))
            .unwrap_or(0)
    }

    // ----- internas -----

    fn pool(env: &Env) -> Address {
        env.storage().instance().get(&Clave::Pool).unwrap()
    }

    fn token_dir(env: &Env) -> Address {
        env.storage().instance().get(&Clave::Token).unwrap()
    }

    /// Llama a `submit` o `submit_with_allowance` del pool con un solo pedido.
    /// from = spender = el adaptador; `to` = quien recibe (en retiros, la tanda).
    fn submit(env: &Env, funcion: &str, to: &Address, tipo: u32, monto: i128) {
        let yo = env.current_contract_address();
        let pedidos: Vec<Request> = vec![
            env,
            Request {
                address: Self::token_dir(env),
                amount: monto,
                request_type: tipo,
            },
        ];
        let args: Vec<Val> = vec![
            env,
            yo.clone().into_val(env),
            yo.into_val(env),
            to.clone().into_val(env),
            pedidos.into_val(env),
        ];
        // Blend devuelve las posiciones nuevas; no las necesitamos aquí.
        let _: Val = env.invoke_contract(&Self::pool(env), &Symbol::new(env, funcion), args);
    }

    /// Lee la reserva del pool como un mapa genérico (campo por campo), así no
    /// dependemos de la estructura exacta de Blend.
    fn reserva(env: &Env) -> Result<(u32, i128), ErrorAdaptador> {
        let args: Vec<Val> = vec![env, Self::token_dir(env).into_val(env)];
        let r: Map<Symbol, Val> =
            env.invoke_contract(&Self::pool(env), &Symbol::new(env, "get_reserve"), args);
        let config: Map<Symbol, Val> = r
            .get(Symbol::new(env, "config"))
            .ok_or(ErrorAdaptador::ReservaNoEncontrada)?
            .into_val(env);
        let data: Map<Symbol, Val> = r
            .get(Symbol::new(env, "data"))
            .ok_or(ErrorAdaptador::ReservaNoEncontrada)?
            .into_val(env);
        let indice: u32 = config
            .get(Symbol::new(env, "index"))
            .ok_or(ErrorAdaptador::ReservaNoEncontrada)?
            .into_val(env);
        let b_rate: i128 = data
            .get(Symbol::new(env, "b_rate"))
            .ok_or(ErrorAdaptador::ReservaNoEncontrada)?
            .into_val(env);
        Ok((indice, b_rate))
    }

    fn b_rate(env: &Env) -> Result<i128, ErrorAdaptador> {
        Ok(Self::reserva(env)?.1)
    }

    /// bTokens que el adaptador tiene en Blend para nuestra reserva.
    fn btokens_propios(env: &Env) -> Result<i128, ErrorAdaptador> {
        let indice = Self::reserva(env)?.0;
        let args: Vec<Val> = vec![env, env.current_contract_address().into_val(env)];
        let pos: Map<Symbol, Val> =
            env.invoke_contract(&Self::pool(env), &Symbol::new(env, "get_positions"), args);
        let supply: Map<u32, i128> = match pos.get(Symbol::new(env, "supply")) {
            Some(v) => v.into_val(env),
            None => Map::new(env),
        };
        Ok(supply.get(indice).unwrap_or(0))
    }

    fn sumar_shares(env: &Env, duenio: &Address, delta: i128) -> Result<(), ErrorAdaptador> {
        let clave = Clave::Shares(duenio.clone());
        let p = env.storage().persistent();
        let nuevo = p.get::<_, i128>(&clave).unwrap_or(0) + delta;
        if nuevo < 0 {
            return Err(ErrorAdaptador::SharesInsuficientes);
        }
        p.set(&clave, &nuevo);
        p.extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
        env.storage()
            .instance()
            .extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
        Ok(())
    }
}
