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
//! ## Regla de oro (ver docs/blend.md)
//! La suma de las participaciones de todos los dueños nunca supera los bTokens que el
//! adaptador tiene en Blend. Por eso cada operación MIDE los bTokens que Blend acuñó o quemó
//! (posiciones antes y después) en vez de suponerlos, y se revierte si Blend quemó más de lo
//! que le corresponde al dueño.
//!
//! Probado en testnet contra el pool `TestnetV2` (1 y 3 oct 2026): supply (request_type 0)
//! y withdraw (request_type 1) funcionan con XLM y con el USDC de prueba de Blend.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, vec, Address,
    Env, IntoVal, Map, Symbol, Val, Vec,
};

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_auditoria;

/// El b_rate de Blend v2 usa 12 decimales.
pub const SCALAR_12: i128 = 1_000_000_000_000;
pub const SUPPLY: u32 = 0;
pub const WITHDRAW: u32 = 1;

/// Un día en ledgers (~5 s cada uno). Política de TTL acordada con M1: los datos se renuevan
/// al máximo que permite la red (`max_ttl()`, hoy ~180 días), como mucho una vez al día.
const DIA_LEDGERS: u32 = 17_280;

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
    /// Índice de la reserva del token dentro del pool. Blend nunca lo cambia.
    Indice,
}

/// Códigos en el rango de M4 (50–59; ver agentes/PROTOCOLO.md §6.1) para que la web los
/// distinga de los de la tanda: los errores del adaptador llegan tal cual a quien firma.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ErrorAdaptador {
    MontoInvalido = 50,
    SharesInsuficientes = 51,
    ReservaNoEncontrada = 52,
    /// Blend quemó más bTokens de los que el dueño tenía derecho a gastar (no debería pasar
    /// nunca; si pasa, se revierte todo para no tocar el dinero de otra tanda).
    QuemaInesperada = 53,
}

#[contract]
pub struct AdaptadorBlend;

#[contractimpl]
impl AdaptadorBlend {
    /// - `pool`: el pool de Blend (en testnet: TestnetV2).
    /// - `token`: el activo que se deposita. Debe ser una reserva del pool (por ejemplo XLM)
    ///   y el MISMO token que usa la tanda. Si no lo es, el despliegue falla.
    pub fn __constructor(env: Env, pool: Address, token: Address) {
        let s = env.storage().instance();
        s.set(&Clave::Pool, &pool);
        s.set(&Clave::Token, &token);
        let indice = match Self::reserva(&env) {
            Ok((indice, _)) => indice,
            Err(e) => panic_with_error!(&env, e),
        };
        s.set(&Clave::Indice, &indice);
        Self::extender_instancia(&env);
    }

    /// Recibe `monto` de `desde` (que antes hizo `approve` a este adaptador) y lo deposita
    /// en Blend. Devuelve los bTokens que quedan a nombre de `desde`.
    pub fn depositar(env: Env, desde: Address, monto: i128) -> Result<i128, ErrorAdaptador> {
        desde.require_auth();
        if monto <= 0 {
            return Err(ErrorAdaptador::MontoInvalido);
        }
        let (pool, tok) = (Self::pool_dir(&env), Self::token_dir(&env));
        let yo = env.current_contract_address();
        let t = token::Client::new(&env, &tok);

        // 1) Traer los tokens desde la tanda (usa el permiso que nos dio).
        t.transfer_from(&yo, &desde, &yo, &monto);

        // 2) Darle permiso al pool y pedirle que los "jale" (submit_with_allowance).
        //    Así el pool mueve los tokens con su propia autorización.
        t.approve(&yo, &pool, &monto, &(env.ledger().sequence() + 100));
        let antes = Self::btokens_propios(&env);
        let despues = Self::submit(&env, "submit_with_allowance", &yo, SUPPLY, monto);

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
        // redondeando hacia ARRIBA, así que nunca se gasta más de `shares` bTokens.
        let monto = shares * Self::b_rate(&env)? / SCALAR_12;
        if monto > 0 {
            let antes = Self::btokens_propios(&env);
            let despues = Self::submit(&env, "submit", &hacia, WITHDRAW, monto);
            // Defensa: si Blend usara otro b_rate que el que leímos, podría quemar bTokens
            // de otra tanda. Lo medimos y, si pasa, se revierte todo.
            if antes - despues > shares {
                return Err(ErrorAdaptador::QuemaInesperada);
            }
        }
        Ok(monto)
    }

    /// Entrega exactamente `monto` tokens a `hacia` y devuelve cuántos bTokens se quemaron.
    pub fn retirar_monto(env: Env, hacia: Address, monto: i128) -> Result<i128, ErrorAdaptador> {
        hacia.require_auth();
        if monto <= 0 {
            return Err(ErrorAdaptador::MontoInvalido);
        }
        let antes = Self::btokens_propios(&env);
        let despues = Self::submit(&env, "submit", &hacia, WITHDRAW, monto);
        // Blend NO falla si se pide más de lo que hay: recorta el retiro a todos los bTokens del
        // adaptador y entrega menos. Solo puede pasar si quedó en cero; en ese caso comprobamos
        // que lo entregado alcanzó para `monto` (si no, se revierte todo).
        if despues == 0 && antes * Self::b_rate(&env)? / SCALAR_12 < monto {
            return Err(ErrorAdaptador::SharesInsuficientes);
        }
        let quemadas = antes - despues;
        // Si `hacia` no tenía suficientes, esto falla y se revierte TODA la transacción.
        Self::sumar_shares(&env, &hacia, -quemadas)?;
        Ok(quemadas)
    }

    /// Cuántos tokens valen hoy `shares` bTokens. `get_reserve` de Blend v2 calcula el
    /// interés hasta el ledger actual, así que el valor no está desactualizado.
    pub fn valor(env: Env, shares: i128) -> Result<i128, ErrorAdaptador> {
        Ok(shares * Self::b_rate(&env)? / SCALAR_12)
    }

    pub fn shares_de(env: Env, duenio: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Clave::Shares(duenio))
            .unwrap_or(0)
    }

    /// Renueva la vida de las participaciones de `duenio` y del adaptador. No pide firma ni mueve
    /// dinero (cualquiera puede pagar el "alquiler"). La tanda la llama en cada ronda, igual que con
    /// la bóveda simulada, para que nada se archive aunque nadie retire en meses.
    pub fn renovar(env: Env, duenio: Address) {
        let clave = Clave::Shares(duenio);
        if env.storage().persistent().has(&clave) {
            Self::extender(&env, &clave);
        }
        Self::extender_instancia(&env);
    }

    /// El pool de Blend donde está el colateral (la web lo usa para enlazar a stellar.expert).
    pub fn pool(env: Env) -> Address {
        Self::pool_dir(&env)
    }

    /// El activo que deposita este adaptador.
    pub fn token(env: Env) -> Address {
        Self::token_dir(&env)
    }

    // ----- internas -----

    fn pool_dir(env: &Env) -> Address {
        env.storage().instance().get(&Clave::Pool).unwrap()
    }

    fn token_dir(env: &Env) -> Address {
        env.storage().instance().get(&Clave::Token).unwrap()
    }

    fn indice(env: &Env) -> u32 {
        env.storage().instance().get(&Clave::Indice).unwrap()
    }

    /// Llama a `submit` o `submit_with_allowance` del pool con un solo pedido.
    /// from = spender = el adaptador; `to` = quien recibe (en retiros, la tanda).
    /// Devuelve los bTokens que el adaptador tiene en la reserva DESPUÉS del pedido
    /// (Blend devuelve las posiciones nuevas: nos ahorra otra consulta).
    fn submit(env: &Env, funcion: &str, to: &Address, tipo: u32, monto: i128) -> i128 {
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
        let pos: Map<Symbol, Val> =
            env.invoke_contract(&Self::pool_dir(env), &Symbol::new(env, funcion), args);
        Self::supply_de(env, &pos)
    }

    /// Lee la reserva del pool como un mapa genérico (campo por campo), así no
    /// dependemos de la estructura exacta de Blend.
    fn reserva(env: &Env) -> Result<(u32, i128), ErrorAdaptador> {
        let args: Vec<Val> = vec![env, Self::token_dir(env).into_val(env)];
        let r: Map<Symbol, Val> =
            env.invoke_contract(&Self::pool_dir(env), &Symbol::new(env, "get_reserve"), args);
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
    fn btokens_propios(env: &Env) -> i128 {
        let args: Vec<Val> = vec![env, env.current_contract_address().into_val(env)];
        let pos: Map<Symbol, Val> = env.invoke_contract(
            &Self::pool_dir(env),
            &Symbol::new(env, "get_positions"),
            args,
        );
        Self::supply_de(env, &pos)
    }

    /// Del struct `Positions` de Blend, los bTokens depositados (sin usar como garantía).
    fn supply_de(env: &Env, pos: &Map<Symbol, Val>) -> i128 {
        let supply: Map<u32, i128> = match pos.get(Symbol::new(env, "supply")) {
            Some(v) => v.into_val(env),
            None => Map::new(env),
        };
        supply.get(Self::indice(env)).unwrap_or(0)
    }

    fn sumar_shares(env: &Env, duenio: &Address, delta: i128) -> Result<(), ErrorAdaptador> {
        let clave = Clave::Shares(duenio.clone());
        let p = env.storage().persistent();
        let nuevo = p.get::<_, i128>(&clave).unwrap_or(0) + delta;
        if nuevo < 0 {
            return Err(ErrorAdaptador::SharesInsuficientes);
        }
        p.set(&clave, &nuevo);
        Self::extender(env, &clave);
        Self::extender_instancia(env);
        Ok(())
    }

    fn extender(env: &Env, clave: &Clave) {
        let max = env.storage().max_ttl();
        env.storage()
            .persistent()
            .extend_ttl(clave, max.saturating_sub(DIA_LEDGERS), max);
    }

    fn extender_instancia(env: &Env) {
        let max = env.storage().max_ttl();
        env.storage()
            .instance()
            .extend_ttl(max.saturating_sub(DIA_LEDGERS), max);
    }
}
