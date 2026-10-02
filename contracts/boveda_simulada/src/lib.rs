//! # Bóveda simulada
//!
//! Guarda tokens y los hace "crecer" con un interés simulado, para la demo del hackathon.
//! Tiene la misma interfaz que usaría un adaptador a Blend, así que el contrato de la
//! tanda no nota la diferencia si mañana la cambian por Blend.
//!
//! ## Cómo funciona: "participaciones" (shares)
//! Cuando alguien deposita, no se anota "depositó 100 tokens", sino "tiene X
//! participaciones". Cada participación vale más con el tiempo (su `precio` sube).
//! Al retirar, sus participaciones valen más tokens que al depositar: esa diferencia
//! es el rendimiento. Blend usa la misma idea (sus "b-tokens"), por eso lo copiamos.
//!
//! IMPORTANTE: para que pueda pagar intereses, alguien debe transferirle tokens de
//! prueba de antemano (por ejemplo 10 000 TUSD). Solo para testnet: no es un producto real.
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

/// 1.0 expresado con 7 decimales (los tokens de Stellar usan 7 decimales).
pub const ESCALA: i128 = 10_000_000;
const SEGUNDOS_POR_ANIO: i128 = 31_536_000;

// Cuánto tiempo (en ledgers, ~5 s cada uno) se mantiene viva cada entrada guardada.
// Si no se "extiende", Stellar archiva el dato y el contrato deja de verlo.
const TTL_UMBRAL: u32 = 17_280; // ~1 día
const TTL_EXTENDER: u32 = 518_400; // ~30 días

#[contracttype]
#[derive(Clone)]
enum Clave {
    Token,
    AprBps,
    Acelerador,
    Inicio,
    Shares(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ErrorBoveda {
    MontoInvalido = 1,
    SharesInsuficientes = 2,
}

#[contract]
pub struct BovedaSimulada;

#[contractimpl]
impl BovedaSimulada {
    /// Se ejecuta una sola vez, al desplegar.
    /// - `apr_bps`: interés anual en puntos básicos (500 = 5%).
    /// - `acelerador`: multiplica el paso del tiempo SOLO para la demo
    ///   (con 1 el rendimiento de 10 minutos sería invisible).
    pub fn __constructor(env: Env, token: Address, apr_bps: u32, acelerador: u32) {
        let s = env.storage().instance();
        s.set(&Clave::Token, &token);
        s.set(&Clave::AprBps, &apr_bps);
        s.set(&Clave::Acelerador, &acelerador);
        s.set(&Clave::Inicio, &env.ledger().timestamp());
    }

    /// Precio de una participación hoy, con 7 decimales (10 000 000 = 1.0).
    /// precio(t) = 1 + apr * (t - inicio) * acelerador / segundos_por_año
    pub fn precio(env: Env) -> i128 {
        let s = env.storage().instance();
        let apr: u32 = s.get(&Clave::AprBps).unwrap();
        let acel: u32 = s.get(&Clave::Acelerador).unwrap();
        let inicio: u64 = s.get(&Clave::Inicio).unwrap();
        let transcurrido = (env.ledger().timestamp() - inicio) as i128;
        ESCALA + ESCALA * apr as i128 * transcurrido * acel as i128 / (10_000 * SEGUNDOS_POR_ANIO)
    }

    /// Deposita `monto` tokens de `desde` y le devuelve cuántas participaciones recibió.
    /// Antes de llamar, `desde` debe haber hecho `approve` a esta bóveda por `monto`
    /// (así funciona también Blend: "submit_with_allowance").
    pub fn depositar(env: Env, desde: Address, monto: i128) -> Result<i128, ErrorBoveda> {
        desde.require_auth();
        if monto <= 0 {
            return Err(ErrorBoveda::MontoInvalido);
        }
        let shares = monto * ESCALA / Self::precio(env.clone());
        let yo = env.current_contract_address();
        // La bóveda "jala" los tokens usando el permiso (allowance) que le dieron.
        Self::token(&env).transfer_from(&yo, &desde, &yo, &monto);
        Self::sumar_shares(&env, &desde, shares)?;
        Ok(shares)
    }

    /// Quema `shares` participaciones de `hacia` y le entrega los tokens que valen hoy.
    pub fn retirar(env: Env, hacia: Address, shares: i128) -> Result<i128, ErrorBoveda> {
        hacia.require_auth();
        if shares <= 0 {
            return Err(ErrorBoveda::MontoInvalido);
        }
        Self::sumar_shares(&env, &hacia, -shares)?;
        let monto = shares * Self::precio(env.clone()) / ESCALA;
        Self::token(&env).transfer(&env.current_contract_address(), &hacia, &monto);
        Ok(monto)
    }

    /// Entrega exactamente `monto` tokens a `hacia` y devuelve cuántas participaciones quemó.
    /// Redondea las participaciones hacia ARRIBA para que la bóveda nunca regale centavos.
    pub fn retirar_monto(env: Env, hacia: Address, monto: i128) -> Result<i128, ErrorBoveda> {
        hacia.require_auth();
        if monto <= 0 {
            return Err(ErrorBoveda::MontoInvalido);
        }
        let precio = Self::precio(env.clone());
        let shares = (monto * ESCALA + precio - 1) / precio; // división redondeando hacia arriba
        Self::sumar_shares(&env, &hacia, -shares)?;
        Self::token(&env).transfer(&env.current_contract_address(), &hacia, &monto);
        Ok(shares)
    }

    /// Cuántos tokens valen hoy `shares` participaciones.
    pub fn valor(env: Env, shares: i128) -> i128 {
        shares * Self::precio(env) / ESCALA
    }

    /// Participaciones que tiene `duenio`.
    pub fn shares_de(env: Env, duenio: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Clave::Shares(duenio))
            .unwrap_or(0)
    }

    // ----- funciones internas (no se pueden llamar desde fuera) -----

    fn token(env: &Env) -> token::Client<'_> {
        let t: Address = env.storage().instance().get(&Clave::Token).unwrap();
        token::Client::new(env, &t)
    }

    fn sumar_shares(env: &Env, duenio: &Address, delta: i128) -> Result<(), ErrorBoveda> {
        let clave = Clave::Shares(duenio.clone());
        let p = env.storage().persistent();
        let actual: i128 = p.get(&clave).unwrap_or(0);
        let nuevo = actual + delta;
        if nuevo < 0 {
            return Err(ErrorBoveda::SharesInsuficientes);
        }
        p.set(&clave, &nuevo);
        p.extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
        env.storage()
            .instance()
            .extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
        Ok(())
    }
}
