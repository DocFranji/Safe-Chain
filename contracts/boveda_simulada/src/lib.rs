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
//!
//! ## Nunca promete más de lo que tiene (misión M1)
//! El precio de una participación nunca supera `saldo / participaciones`. Con eso:
//! 1. La bóveda **siempre** puede pagarle a todos: ningún retiro falla por falta de fondos.
//! 2. El precio **nunca baja**: nadie retira menos de lo que depositó.
//!
//! Si se acaba el dinero para intereses, el rendimiento simplemente se detiene. Antes, con el
//! acelerador de la demo y tandas de meses, la bóveda debía más de lo que tenía y la tanda quedaba
//! trabada al finalizar.
//!
//! ## Acelerador
//! Para la demo se despliega una bóveda *rápida* (por ejemplo ×52 560: 1 minuto ≈ 36,5 días) que
//! solo usan las tandas de prueba (rondas de hasta 10 minutos). Las tandas reales usan una bóveda
//! con `acelerador = 1` (interés real del 5 % anual). Ver `docs/tiempos-y-deudas.md`.
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

/// 1.0 expresado con 7 decimales (los tokens de Stellar usan 7 decimales).
pub const ESCALA: i128 = 10_000_000;
const SEGUNDOS_POR_ANIO: i128 = 31_536_000;

// Vida de los datos (en ledgers, ~5 s cada uno): la instancia y las participaciones de cada dueño
// viven lo máximo que permite la red (~180 días en testnet) y se renuevan como mucho una vez al día.
// La tanda, además, renueva la instancia y el código de su bóveda en cada operación.
const DIA_LEDGERS: u32 = 17_280;

/// Unidades mínimas de participación que la bóveda pone de su bolsillo por redondeo (ver `retirar_monto`).
const TOLERANCIA_REDONDEO: i128 = 100;

#[contracttype]
#[derive(Clone)]
enum Clave {
    Token,
    AprBps,
    Acelerador,
    Inicio,
    Shares(Address),
    /// Suma de las participaciones de todos (para el tope de solvencia del precio).
    TotalShares,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ErrorBoveda {
    // Códigos dentro del rango de M1 (14–19) para que la web no los confunda con los de la tanda:
    // cuando una llamada a la bóveda falla, la transacción muestra el código de la bóveda.
    MontoInvalido = 17,
    SharesInsuficientes = 18,
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
        Self::extender_instancia(&env);
    }

    /// Precio de una participación hoy, con 7 decimales (10 000 000 = 1.0).
    /// precio(t) = min(1 + apr * (t - inicio) * acelerador / segundos_por_año,  saldo / participaciones)
    /// El segundo término es el tope de solvencia: la bóveda nunca promete más de lo que tiene.
    pub fn precio(env: Env) -> i128 {
        let s = env.storage().instance();
        let apr: u32 = s.get(&Clave::AprBps).unwrap();
        let acel: u32 = s.get(&Clave::Acelerador).unwrap();
        let inicio: u64 = s.get(&Clave::Inicio).unwrap();
        let transcurrido = (env.ledger().timestamp() - inicio) as i128;
        let lineal = ESCALA
            + ESCALA * apr as i128 * transcurrido * acel as i128 / (10_000 * SEGUNDOS_POR_ANIO);
        let total = Self::total_shares(env.clone());
        if total <= 0 {
            return lineal;
        }
        let saldo = Self::token(&env).balance(&env.current_contract_address());
        // Redondeado hacia abajo (a favor de la bóveda) y nunca 0 (se divide por el precio).
        lineal.min(saldo * ESCALA / total).max(1)
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
        // El precio se calcula ANTES de quemar las participaciones (el tope usa el total actual).
        let monto = shares * Self::precio(env.clone()) / ESCALA;
        Self::sumar_shares(&env, &hacia, -shares)?;
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
        let mut shares = (monto * ESCALA + precio - 1) / precio; // división redondeando hacia arriba
                                                                 // Redondeo: si el precio no cambió desde que se depositó (por ejemplo, bóveda sin acelerar y
                                                                 // pocos segundos), sacar justo todo lo depositado puede pedir unas unidades mínimas más de las
                                                                 // que hay. La bóveda pone esa fracción (centésimas de centavo) para que una tanda nunca se
                                                                 // trabe por redondeo.
        let tiene = Self::shares_de(env.clone(), hacia.clone());
        if tiene > 0 && shares > tiene && shares - tiene <= TOLERANCIA_REDONDEO {
            shares = tiene;
        }
        Self::sumar_shares(&env, &hacia, -shares)?;
        Self::token(&env).transfer(&env.current_contract_address(), &hacia, &monto);
        Ok(shares)
    }

    /// Cuántos tokens valen hoy `shares` participaciones.
    pub fn valor(env: Env, shares: i128) -> i128 {
        shares * Self::precio(env) / ESCALA
    }

    /// Renueva la vida de las participaciones de `duenio` y de la bóveda. No pide firma ni mueve
    /// dinero. La tanda la llama en cada ronda para que nada se archive aunque nadie retire en meses.
    pub fn renovar(env: Env, duenio: Address) {
        let clave = Clave::Shares(duenio);
        let p = env.storage().persistent();
        if p.has(&clave) {
            let max = env.storage().max_ttl();
            p.extend_ttl(&clave, max.saturating_sub(DIA_LEDGERS), max);
        }
        Self::extender_instancia(&env);
    }

    /// Participaciones que tiene `duenio`.
    pub fn shares_de(env: Env, duenio: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Clave::Shares(duenio))
            .unwrap_or(0)
    }

    /// Cuántas veces más rápido corre el tiempo para los intereses (1 = como en la vida real).
    /// La web lo usa para decir si el rendimiento es acelerado (de demostración) o real.
    pub fn acelerador(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&Clave::Acelerador)
            .unwrap_or(1)
    }

    /// Participaciones de todos juntos.
    pub fn total_shares(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&Clave::TotalShares)
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
        let max = env.storage().max_ttl();
        p.extend_ttl(&clave, max.saturating_sub(DIA_LEDGERS), max);
        let total = Self::total_shares(env.clone()) + delta;
        env.storage().instance().set(&Clave::TotalShares, &total);
        Self::extender_instancia(env);
        Ok(())
    }

    fn extender_instancia(env: &Env) {
        let max = env.storage().max_ttl();
        env.storage()
            .instance()
            .extend_ttl(max.saturating_sub(DIA_LEDGERS), max);
    }
}
