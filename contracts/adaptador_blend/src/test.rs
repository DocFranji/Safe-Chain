//! Pruebas del adaptador contra un pool de Blend SIMULADO que imita a Blend v2
//! (código de referencia: blend-capital/blend-contracts-v2, `pool/src/pool/actions.rs` y
//! `reserve.rs`):
//! - b_rate con 12 decimales que sube con el tiempo (y que BAJA si hay deuda incobrable),
//! - supply redondea los bTokens hacia ABAJO, withdraw los quema redondeando hacia ARRIBA,
//! - withdraw de más NO falla: se recorta a los bTokens del usuario,
//! - withdraw falla si deja la reserva al 100 % de utilización (error 1207),
//! - supply falla si el pool está congelado (1206), la reserva deshabilitada (1223),
//!   se pasa del tope (1220) o acuñaría 0 bTokens (1216),
//! - get_reserve devuelve la estructura completa con los mismos campos que vimos en testnet.
//!
//! Las pruebas de la auditoría (docs/blend.md) están en `test_auditoria.rs`.
#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, Map, Vec,
};
use tanda::{Estado, TandaContract, TandaContractClient};

// ---------------------------------------------------------------------------
// Pool de Blend simulado (campos copiados del get_reserve real de TestnetV2)
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct ReserveConfig {
    pub c_factor: u32,
    pub decimals: u32,
    pub enabled: bool,
    pub index: u32,
    pub l_factor: u32,
    pub max_util: u32,
    pub r_base: u32,
    pub r_one: u32,
    pub r_three: u32,
    pub r_two: u32,
    pub reactivity: u32,
    pub supply_cap: i128,
    pub util: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct ReserveData {
    pub b_rate: i128,
    pub b_supply: i128,
    pub backstop_credit: i128,
    pub d_rate: i128,
    pub d_supply: i128,
    pub ir_mod: i128,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Reserve {
    pub asset: Address,
    pub config: ReserveConfig,
    pub data: ReserveData,
    pub scalar: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Positions {
    pub collateral: Map<u32, i128>,
    pub liabilities: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

/// Los mismos códigos que `PoolError` de Blend v2 (`pool/src/errors.rs`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ErrorPool {
    InvalidPoolStatus = 1206,
    InvalidUtilRate = 1207,
    InvalidBTokenMintAmount = 1216,
    InvalidBTokenBurnAmount = 1217,
    ExceededSupplyCap = 1220,
    ReserveDisabled = 1223,
}

#[contracttype]
#[derive(Clone)]
enum K {
    Asset,
    B0,
    Sube,
    T0,
    Pos(Address),
    BSupply,
    /// Tokens prestados (pasivos de la reserva).
    Deuda,
    /// Estado del pool: 0-1 activo, 2-3 "on ice", 4-5 congelado, 6 configuración.
    Estado,
    Habilitada,
    Tope,
    /// Lo que el b_rate perdió por deuda incobrable (se resta).
    Perdida,
    /// SOLO para la prueba de defensa: b_rate extra que usa `submit` y no `get_reserve`.
    Desfase,
}

/// Los mismos eventos que emite Blend v2 al depositar y retirar (`pool/src/events.rs`):
/// tópicos `["supply"|"withdraw", activo, desde]` y datos `[monto, b_tokens]`. Así las pruebas miden el
/// tamaño de los eventos de una transacción igual que la red (límite de 16 KiB por transacción).
#[contractevent(topics = ["supply"], data_format = "vec")]
pub struct EvSupplyBlend {
    #[topic]
    pub asset: Address,
    #[topic]
    pub from: Address,
    pub tokens_in: i128,
    pub b_tokens_minted: i128,
}

#[contractevent(topics = ["withdraw"], data_format = "vec")]
pub struct EvWithdrawBlend {
    #[topic]
    pub asset: Address,
    #[topic]
    pub from: Address,
    pub tokens_out: i128,
    pub b_tokens_burnt: i128,
}

#[contract]
pub struct PoolSimulado;

#[contractimpl]
impl PoolSimulado {
    /// `sube_por_seg`: cuánto aumenta el b_rate cada segundo (12 decimales).
    pub fn __constructor(env: Env, asset: Address, b_rate_inicial: i128, sube_por_seg: i128) {
        let s = env.storage().instance();
        s.set(&K::Asset, &asset);
        s.set(&K::B0, &b_rate_inicial);
        s.set(&K::Sube, &sube_por_seg);
        s.set(&K::T0, &env.ledger().timestamp());
        s.set(&K::Estado, &1u32);
        s.set(&K::Habilitada, &true);
        s.set(&K::Tope, &i128::MAX);
    }

    fn leer<T: soroban_sdk::TryFromVal<Env, Val>>(env: &Env, k: &K, defecto: T) -> T {
        env.storage().instance().get(k).unwrap_or(defecto)
    }

    fn rate(env: &Env) -> i128 {
        let b0: i128 = Self::leer(env, &K::B0, 0);
        let sube: i128 = Self::leer(env, &K::Sube, 0);
        let t0: u64 = Self::leer(env, &K::T0, 0);
        let perdida: i128 = Self::leer(env, &K::Perdida, 0);
        b0 + sube * (env.ledger().timestamp() - t0) as i128 - perdida
    }

    fn total_supply(b_supply: i128, rate: i128) -> i128 {
        b_supply * rate / SCALAR_12
    }

    // --- Palancas para las pruebas (no existen en Blend) ---

    /// Un prestatario (`hacia`) se lleva `monto` del pool: baja la liquidez libre.
    pub fn prestar(env: Env, hacia: Address, monto: i128) {
        let asset: Address = Self::leer(&env, &K::Asset, env.current_contract_address());
        token::Client::new(&env, &asset).transfer(&env.current_contract_address(), &hacia, &monto);
        let d: i128 = Self::leer(&env, &K::Deuda, 0);
        env.storage().instance().set(&K::Deuda, &(d + monto));
    }

    /// Un prestatario devuelve `monto` (los tokens salen de `desde`).
    pub fn devolver(env: Env, desde: Address, monto: i128) {
        desde.require_auth();
        let asset: Address = Self::leer(&env, &K::Asset, env.current_contract_address());
        token::Client::new(&env, &asset).transfer(&desde, env.current_contract_address(), &monto);
        let d: i128 = Self::leer(&env, &K::Deuda, 0);
        env.storage().instance().set(&K::Deuda, &(d - monto));
    }

    /// Deuda incobrable: se perdona `monto` de deuda y los depositantes pierden
    /// (el b_rate baja, como `default_liabilities` de Blend v2).
    pub fn incobrable(env: Env, monto: i128) {
        let s = env.storage().instance();
        let d: i128 = Self::leer(&env, &K::Deuda, 0);
        let bs: i128 = Self::leer(&env, &K::BSupply, 0);
        let p: i128 = Self::leer(&env, &K::Perdida, 0);
        s.set(&K::Deuda, &(d - monto));
        s.set(&K::Perdida, &(p + (monto * SCALAR_12 + bs - 1) / bs));
    }

    pub fn set_estado(env: Env, estado: u32) {
        env.storage().instance().set(&K::Estado, &estado);
    }

    pub fn set_habilitada(env: Env, habilitada: bool) {
        env.storage().instance().set(&K::Habilitada, &habilitada);
    }

    pub fn set_tope(env: Env, tope: i128) {
        env.storage().instance().set(&K::Tope, &tope);
    }

    pub fn set_desfase(env: Env, desfase: i128) {
        env.storage().instance().set(&K::Desfase, &desfase);
    }

    /// Tokens que se pueden retirar hoy sin llegar al 100 % de utilización.
    pub fn liquidez(env: Env) -> i128 {
        let bs: i128 = Self::leer(&env, &K::BSupply, 0);
        let d: i128 = Self::leer(&env, &K::Deuda, 0);
        Self::total_supply(bs, Self::rate(&env)) - d
    }

    // --- La interfaz de Blend v2 que usa el adaptador ---

    pub fn get_reserve(env: Env, asset: Address) -> Reserve {
        let bs: i128 = Self::leer(&env, &K::BSupply, 0);
        let d: i128 = Self::leer(&env, &K::Deuda, 0);
        let rate = Self::rate(&env);
        let supply = Self::total_supply(bs, rate);
        Reserve {
            asset,
            config: ReserveConfig {
                c_factor: 9_000_000,
                decimals: 7,
                enabled: Self::leer(&env, &K::Habilitada, true),
                index: 0,
                l_factor: 9_000_000,
                max_util: 9_500_000,
                r_base: 5_000,
                r_one: 300_000,
                r_three: 10_000_000,
                r_two: 2_000_000,
                reactivity: 50,
                supply_cap: Self::leer(&env, &K::Tope, i128::MAX),
                util: if supply > 0 {
                    (d * 10_000_000 / supply) as u32
                } else {
                    0
                },
            },
            data: ReserveData {
                b_rate: rate,
                b_supply: bs,
                backstop_credit: 0,
                d_rate: SCALAR_12,
                d_supply: d,
                ir_mod: 100_000_000,
                last_time: env.ledger().timestamp(),
            },
            scalar: 10_000_000,
        }
    }

    pub fn get_positions(env: Env, address: Address) -> Positions {
        env.storage()
            .persistent()
            .get(&K::Pos(address))
            .unwrap_or(Positions {
                collateral: Map::new(&env),
                liabilities: Map::new(&env),
                supply: Map::new(&env),
            })
    }

    pub fn submit_with_allowance(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions {
        Self::procesar(env, from, spender, to, requests, true)
    }

    pub fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
    ) -> Positions {
        Self::procesar(env, from, spender, to, requests, false)
    }

    fn procesar(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: Vec<Request>,
        allowance: bool,
    ) -> Positions {
        spender.require_auth();
        if spender != from {
            from.require_auth();
        }
        let s = env.storage().instance();
        let asset: Address = Self::leer(&env, &K::Asset, env.current_contract_address());
        let tok = token::Client::new(&env, &asset);
        let yo = env.current_contract_address();
        let mut pos = Self::get_positions(env.clone(), from.clone());
        let desfase: i128 = Self::leer(&env, &K::Desfase, 0);
        let rate = Self::rate(&env) + desfase;
        let estado: u32 = Self::leer(&env, &K::Estado, 1);
        for r in requests.iter() {
            assert_eq!(r.address, asset, "reserva desconocida");
            let actual = pos.supply.get(0).unwrap_or(0);
            let mut bs: i128 = Self::leer(&env, &K::BSupply, 0);
            match r.request_type {
                SUPPLY => {
                    if estado > 3 {
                        panic_with_error!(&env, ErrorPool::InvalidPoolStatus);
                    }
                    if !Self::leer(&env, &K::Habilitada, true) {
                        panic_with_error!(&env, ErrorPool::ReserveDisabled);
                    }
                    let bt = r.amount * SCALAR_12 / rate; // hacia abajo
                    if bt <= 0 {
                        panic_with_error!(&env, ErrorPool::InvalidBTokenMintAmount);
                    }
                    pos.supply.set(0, actual + bt);
                    bs += bt;
                    if Self::total_supply(bs, rate) > Self::leer(&env, &K::Tope, i128::MAX) {
                        panic_with_error!(&env, ErrorPool::ExceededSupplyCap);
                    }
                    if allowance {
                        tok.transfer_from(&yo, &spender, &yo, &r.amount);
                    } else {
                        tok.transfer(&spender, &yo, &r.amount);
                    }
                    EvSupplyBlend {
                        asset: asset.clone(),
                        from: from.clone(),
                        tokens_in: r.amount,
                        b_tokens_minted: bt,
                    }
                    .publish(&env);
                }
                WITHDRAW => {
                    let mut bt = (r.amount * SCALAR_12 + rate - 1) / rate; // hacia arriba
                    let mut sale = r.amount;
                    if bt > actual {
                        // Blend recorta al saldo del usuario en vez de fallar.
                        bt = actual;
                        sale = actual * rate / SCALAR_12;
                    }
                    if bt <= 0 {
                        panic_with_error!(&env, ErrorPool::InvalidBTokenBurnAmount);
                    }
                    if actual - bt == 0 {
                        pos.supply.remove(0);
                    } else {
                        pos.supply.set(0, actual - bt);
                    }
                    bs -= bt;
                    let deuda: i128 = Self::leer(&env, &K::Deuda, 0);
                    if deuda > 0 && deuda >= Self::total_supply(bs, rate) {
                        panic_with_error!(&env, ErrorPool::InvalidUtilRate);
                    }
                    tok.transfer(&yo, &to, &sale);
                    EvWithdrawBlend {
                        asset: asset.clone(),
                        from: from.clone(),
                        tokens_out: sale,
                        b_tokens_burnt: bt,
                    }
                    .publish(&env);
                }
                _ => panic!("tipo no soportado en el simulador"),
            }
            s.set(&K::BSupply, &bs);
        }
        env.storage().persistent().set(&K::Pos(from), &pos);
        pos
    }
}

// ---------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------

pub(crate) const U: i128 = 10_000_000; // 1 XLM
pub(crate) const B_RATE_INICIAL: i128 = 2_194_332_011_155; // el real de TestnetV2 al 1 oct 2026
pub(crate) const SUBE: i128 = 50_000_000; // ~ +0.00005 por segundo: rendimiento visible en pruebas
pub(crate) const FONDOS_POOL: i128 = 100_000 * U;

pub(crate) struct Ctx {
    pub(crate) env: Env,
    pub(crate) token: TokenClient<'static>,
    pub(crate) sac: StellarAssetClient<'static>,
    pub(crate) pool: Address,
    pub(crate) adaptador: AdaptadorBlendClient<'static>,
}

pub(crate) fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = 1_000;
        l.sequence_number = 100;
    });
    let sac_c = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = TokenClient::new(&env, &sac_c.address());
    let sac = StellarAssetClient::new(&env, &sac_c.address());
    let pool = env.register(PoolSimulado, (sac_c.address(), B_RATE_INICIAL, SUBE));
    sac.mint(&pool, &FONDOS_POOL); // liquidez del pool (lo que pagan los prestatarios)
    let ad = env.register(AdaptadorBlend, (pool.clone(), sac_c.address()));
    let adaptador = AdaptadorBlendClient::new(&env, &ad);
    Ctx {
        env,
        token,
        sac,
        pool,
        adaptador,
    }
}

impl Ctx {
    pub(crate) fn avanzar(&self, s: u64) {
        self.env.ledger().with_mut(|l| {
            l.timestamp += s;
            l.sequence_number += 1;
        });
    }
    pub(crate) fn pool(&self) -> PoolSimuladoClient<'static> {
        PoolSimuladoClient::new(&self.env, &self.pool)
    }
    pub(crate) fn btokens_adaptador(&self) -> i128 {
        PoolSimuladoClient::new(&self.env, &self.pool)
            .get_positions(&self.adaptador.address)
            .supply
            .get(0)
            .unwrap_or(0)
    }
    /// Quien deposita en el adaptador: le damos tokens y el permiso, como hace la tanda.
    pub(crate) fn depositar(&self, quien: &Address, monto: i128) -> i128 {
        self.sac.mint(quien, &monto);
        self.token
            .approve(quien, &self.adaptador.address, &monto, &1000);
        self.adaptador.depositar(quien, &monto)
    }
}

// ---------------------------------------------------------------------------
// Pruebas del adaptador
// ---------------------------------------------------------------------------

#[test]
fn deposito_y_retiro_con_rendimiento() {
    let c = setup();
    let t = Address::generate(&c.env);
    let shares = c.depositar(&t, 100 * U);
    // Igual que en testnet: 100 XLM / 2.194332 = ~45.57 bTokens.
    assert_eq!(shares, 100 * U * SCALAR_12 / B_RATE_INICIAL);
    assert_eq!(c.adaptador.shares_de(&t), shares);
    assert_eq!(c.btokens_adaptador(), shares);
    assert_eq!(c.token.balance(&c.adaptador.address), 0); // nada queda suelto en el adaptador

    c.avanzar(600);
    let valor = c.adaptador.valor(&shares);
    assert!(valor > 100 * U, "debe haber rendimiento");
    let recibido = c.adaptador.retirar(&t, &shares);
    assert_eq!(recibido, valor);
    assert_eq!(c.token.balance(&t), valor);
    assert_eq!(c.adaptador.shares_de(&t), 0);
    std::println!(
        "Rendimiento en 10 min (simulado): {} XLM",
        (valor - 100 * U) as f64 / U as f64
    );
}

#[test]
fn retirar_monto_exacto_quema_lo_justo() {
    let c = setup();
    let t = Address::generate(&c.env);
    let shares = c.depositar(&t, 300 * U);
    c.avanzar(120);
    let quemadas = c.adaptador.retirar_monto(&t, &(100 * U));
    assert_eq!(c.token.balance(&t), 100 * U);
    assert_eq!(c.adaptador.shares_de(&t), shares - quemadas);
    // El adaptador nunca promete más bTokens de los que tiene en Blend.
    assert!(c.btokens_adaptador() >= c.adaptador.shares_de(&t));
}

#[test]
fn dos_duenios_no_se_mezclan() {
    let c = setup();
    let (t1, t2) = (Address::generate(&c.env), Address::generate(&c.env));
    let s1 = c.depositar(&t1, 200 * U);
    c.avanzar(300);
    let s2 = c.depositar(&t2, 200 * U);
    assert!(
        s2 < s1,
        "quien entra después recibe menos bTokens por lo mismo"
    );
    c.avanzar(300);
    let r1 = c.adaptador.retirar(&t1, &s1);
    let r2 = c.adaptador.retirar(&t2, &s2);
    assert!(r1 > r2, "quien depositó antes gana más interés");
    // Lo que queda en Blend a nombre del adaptador (polvo de redondeo) nunca es negativo.
    assert!(c.btokens_adaptador() >= 0);
}

#[test]
fn no_se_puede_retirar_mas_de_lo_propio() {
    let c = setup();
    let (t1, t2) = (Address::generate(&c.env), Address::generate(&c.env));
    let s1 = c.depositar(&t1, 100 * U);
    c.depositar(&t2, 100 * U);
    assert_eq!(
        c.adaptador.try_retirar(&t1, &(s1 + 1)),
        Err(Ok(ErrorAdaptador::SharesInsuficientes))
    );
    assert_eq!(
        c.adaptador.try_retirar_monto(&t1, &(150 * U)),
        Err(Ok(ErrorAdaptador::SharesInsuficientes))
    );
    assert_eq!(
        c.adaptador.try_depositar(&t1, &0),
        Err(Ok(ErrorAdaptador::MontoInvalido))
    );
}

// ---------------------------------------------------------------------------
// La tanda COMPLETA usando Blend (mismo escenario que la demo)
// ---------------------------------------------------------------------------

#[test]
fn tanda_completa_con_blend_ana_huye_beto_paga_tarde() {
    let c = setup();
    let env = &c.env;
    let cuota = 10 * U; // en XLM, para no gastar mucho de Friendbot
    let tanda_addr = env.register(TandaContract, ());
    let tanda = TandaContractClient::new(env, &tanda_addr);
    tanda.inicializar(&Address::generate(env), &c.adaptador.address, &None);

    let (ana, beto, carla) = (
        Address::generate(env),
        Address::generate(env),
        Address::generate(env),
    );
    let inicial = 1_000 * U;
    for p in [&ana, &beto, &carla] {
        c.sac.mint(p, &inicial);
    }
    let total_inicial = 3 * inicial + FONDOS_POOL;
    let total = || {
        c.token.balance(&ana)
            + c.token.balance(&beto)
            + c.token.balance(&carla)
            + c.token.balance(&c.pool)
            + c.token.balance(&tanda_addr)
            + c.token.balance(&c.adaptador.address)
    };

    let id = tanda.crear_tanda(
        &Address::generate(env),
        &c.token.address,
        &cuota,
        &3,
        &120,
        &1000,
        &10_000,
    );
    for p in [&ana, &beto, &carla] {
        tanda.unirse(&id, p);
    }
    // El colateral (20 + 10 + 10 XLM) está en Blend, a nombre del adaptador.
    assert_eq!(c.token.balance(&tanda_addr), 0);
    assert!(c.btokens_adaptador() > 0);

    // Ronda 1: todos pagan.
    for p in [&ana, &beto, &carla] {
        tanda.pagar_cuota(&id, p);
    }
    c.avanzar(120);
    tanda.cerrar_ronda(&id);
    // Ronda 2: Ana desaparece -> su colateral (retirado de Blend) cubre la cuota.
    tanda.pagar_cuota(&id, &beto);
    tanda.pagar_cuota(&id, &carla);
    c.avanzar(120);
    let beto_antes = c.token.balance(&beto);
    tanda.cerrar_ronda(&id);
    assert_eq!(
        c.token.balance(&beto),
        beto_antes + 3 * cuota,
        "Beto cobra completo"
    );
    // Ronda 3: Beto paga tarde.
    tanda.pagar_cuota(&id, &carla);
    c.avanzar(130);
    tanda.pagar_cuota(&id, &beto);
    tanda.cerrar_ronda(&id);
    assert_eq!(tanda.get_tanda(&id).estado, Estado::PorLiquidar);

    tanda.finalizar(&id);
    assert_eq!(tanda.get_tanda(&id).estado, Estado::Finalizada);
    assert_eq!(
        c.token.balance(&tanda_addr),
        0,
        "la tanda no se queda con nada"
    );
    assert_eq!(total(), total_inicial, "no se crea ni se pierde dinero");

    // Ana: huir no le dio nada (sin rendimiento: perdió su colateral cubriendo cuotas).
    assert_eq!(c.token.balance(&ana), inicial);
    // Beto: −1 XLM de multa + rendimiento real de Blend.
    let rb = c.token.balance(&beto) - (inicial - cuota / 10);
    // Carla: +1 XLM de premio + rendimiento real de Blend.
    let rc = c.token.balance(&carla) - (inicial + cuota / 10);
    assert!(rb > 0 && rc > 0, "los cumplidos ganan rendimiento de Blend");
    std::println!(
        "Tanda con Blend: rendimiento Beto {} XLM, Carla {} XLM",
        rb as f64 / U as f64,
        rc as f64 / U as f64
    );
}

/// Retiros SIN firmas simuladas: cerrar rondas y finalizar mueven dinero de Blend
/// (adaptador -> pool -> token) y deben funcionar solo con la autorización automática
/// de cada contrato, igual que en la red real.
#[test]
fn retiros_de_blend_funcionan_sin_firmas_simuladas() {
    let c = setup();
    let env = &c.env;
    let tanda_addr = env.register(TandaContract, ());
    let tanda = TandaContractClient::new(env, &tanda_addr);
    tanda.inicializar(&Address::generate(env), &c.adaptador.address, &None);
    let miembros = [
        Address::generate(env),
        Address::generate(env),
        Address::generate(env),
    ];
    for p in &miembros {
        c.sac.mint(p, &(1_000 * U));
    }
    let id = tanda.crear_tanda(
        &Address::generate(env),
        &c.token.address,
        &(10 * U),
        &3,
        &120,
        &1000,
        &10_000,
    );
    for p in &miembros {
        tanda.unirse(&id, p);
    }
    // Desde aquí nadie firma nada.
    env.set_auths(&[]);
    for _ in 0..3 {
        c.avanzar(120);
        tanda.cerrar_ronda(&id); // nadie pagó: el colateral sale de Blend para cubrir
    }
    tanda.finalizar(&id);
    assert_eq!(tanda.get_tanda(&id).estado, Estado::Finalizada);
}
