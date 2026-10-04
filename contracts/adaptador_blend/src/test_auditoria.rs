//! Pruebas de la auditoría del adaptador (fase 0 de M4). Cada sección responde una pregunta
//! de `docs/blend.md`. Usan el pool simulado fiel a Blend v2 de `test.rs`.
#![cfg(test)]
extern crate std;

use crate::test::*;
use crate::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, InvokeError,
};
use tanda::{Error as ErrorTanda, Estado, TandaContract, TandaContractClient};

/// Un contrato de tanda que usa el adaptador del contexto, con `n` miembros con saldo.
struct ConTanda {
    tanda: TandaContractClient<'static>,
    token: Address,
    miembros: std::vec::Vec<Address>,
}

fn tanda_con_blend(c: &Ctx, n: usize) -> ConTanda {
    let env = &c.env;
    let addr = env.register(TandaContract, ());
    let tanda = TandaContractClient::new(env, &addr);
    tanda.inicializar(&Address::generate(env), &c.adaptador.address, &None);
    let miembros: std::vec::Vec<Address> = (0..n).map(|_| Address::generate(env)).collect();
    for m in &miembros {
        c.sac.mint(m, &(10_000 * U));
    }
    ConTanda {
        tanda,
        token: c.token.address.clone(),
        miembros,
    }
}

impl ConTanda {
    fn crear(&self, cuota: i128, n: u32) -> u32 {
        let env = &self.tanda.env;
        self.tanda.crear_tanda(
            &Address::generate(env),
            &self.token,
            &cuota,
            &n,
            &120,
            &1000,
            &10_000,
        )
    }
    fn crear_y_llenar(&self, cuota: i128) -> u32 {
        self.crear_y_llenar_con(cuota, &self.miembros)
    }
    fn crear_y_llenar_con(&self, cuota: i128, miembros: &[Address]) -> u32 {
        let id = self.crear(cuota, miembros.len() as u32);
        for m in miembros {
            self.tanda.unirse(&id, m);
        }
        id
    }
    fn todos_pagan(&self, id: u32, miembros: &[Address]) {
        for m in miembros {
            self.tanda.pagar_cuota(&id, m);
        }
    }
}

/// Pool con b_rate FIJO (reserva sin préstamos: Blend no acumula interés si la utilización es 0).
fn setup_sin_interes() -> Ctx {
    let c = setup();
    let pool = c.env.register(
        PoolSimulado,
        (c.token.address.clone(), B_RATE_INICIAL, 0i128),
    );
    c.sac.mint(&pool, &FONDOS_POOL);
    let ad = c
        .env
        .register(AdaptadorBlend, (pool.clone(), c.token.address.clone()));
    Ctx {
        env: c.env.clone(),
        token: c.token,
        sac: c.sac,
        pool,
        adaptador: AdaptadorBlendClient::new(&c.env, &ad),
    }
}

/// Código de error de OTRO contrato (Blend o el adaptador) que llegó a través de la tanda.
fn error_contrato<T: core::fmt::Debug>(
    r: Result<Result<T, soroban_sdk::ConversionError>, Result<ErrorTanda, InvokeError>>,
) -> u32 {
    match r {
        Err(Err(InvokeError::Contract(code))) => code,
        Err(Ok(e)) => panic!("error del contrato llamado: {e:?}"),
        otro => panic!("se esperaba un error de otro contrato y vino {otro:?}"),
    }
}

// ===========================================================================
// 1. Redondeo: ¿puede un retiro gastar bTokens de otro dueño?
// ===========================================================================

/// Prueba matemática (sin contratos) de la regla que usa `retirar`:
/// monto = floor(shares × r) y Blend quema ceil(monto / r) ≤ shares, para cualquier b_rate ≥ 1.
#[test]
fn redondeo_de_retirar_nunca_quema_de_mas() {
    let tasas = [
        SCALAR_12,
        SCALAR_12 + 1,
        1_057_090_226_439, // USDC TestnetV2, 3 oct 2026
        B_RATE_INICIAL,
        2_214_779_545_628, // XLM TestnetV2, 3 oct 2026
        3_581_468_036_186,
        999_999_999_999_999,
    ];
    for r in tasas {
        for s in (1..20_000i128).chain([10i128.pow(15), 10i128.pow(15) + 7]) {
            let monto = s * r / SCALAR_12;
            let quema = (monto * SCALAR_12 + r - 1) / r;
            assert!(quema <= s, "r={r} s={s}: quema {quema}");
        }
    }
}

/// Dos dueños con operaciones "aleatorias" (montos y tiempos raros): después de CADA operación,
/// la suma de sus participaciones no supera los bTokens del adaptador, y al final los dos
/// pueden salir con todo lo suyo.
#[test]
fn dos_duenios_operaciones_aleatorias_nunca_se_cruzan() {
    let c = setup();
    let duenios = [Address::generate(&c.env), Address::generate(&c.env)];
    let mut semilla: u64 = 0x5eed_1234;
    let mut azar = |max: i128| -> i128 {
        semilla = semilla
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        ((semilla >> 33) as i128) % max
    };
    for paso in 0..120 {
        let d = &duenios[(paso % 2) as usize];
        match azar(3) {
            0 => {
                c.depositar(d, 1 + azar(500 * U));
            }
            1 => {
                let valor = c.adaptador.valor(&c.adaptador.shares_de(d));
                if valor > 1 {
                    c.adaptador.retirar_monto(d, &(1 + azar(valor - 1)));
                }
            }
            _ => {
                let s = c.adaptador.shares_de(d);
                if s > 1 {
                    c.adaptador.retirar(d, &(1 + azar(s - 1)));
                }
            }
        }
        c.avanzar(1 + azar(97) as u64);
        let suma = c.adaptador.shares_de(&duenios[0]) + c.adaptador.shares_de(&duenios[1]);
        assert!(suma <= c.btokens_adaptador(), "paso {paso}");
    }
    for d in &duenios {
        let s = c.adaptador.shares_de(d);
        if s > 0 {
            c.adaptador.retirar(d, &s);
        }
        assert_eq!(c.adaptador.shares_de(d), 0);
    }
    // Solo queda polvo de redondeo (como mucho 1 bToken por retiro), que no es de nadie.
    std::println!("polvo final: {} bTokens", c.btokens_adaptador());
    assert!(c.btokens_adaptador() >= 0 && c.btokens_adaptador() < 120);
}

/// Defensa: si algún día Blend quemara con otro b_rate que el que leímos, el adaptador
/// lo detecta y revierte en lugar de gastar bTokens de otro dueño.
#[test]
fn si_blend_quemara_de_mas_se_revierte() {
    let c = setup();
    let (t1, t2) = (Address::generate(&c.env), Address::generate(&c.env));
    let s1 = c.depositar(&t1, 100 * U);
    let s2 = c.depositar(&t2, 100 * U);
    c.pool().set_desfase(&-1_000_000_000); // submit usa un b_rate 0,001 más bajo
    assert_eq!(
        c.adaptador.try_retirar(&t1, &s1),
        Err(Ok(ErrorAdaptador::QuemaInesperada))
    );
    assert_eq!(c.adaptador.shares_de(&t1), s1, "se revirtió todo");
    assert_eq!(c.adaptador.shares_de(&t2), s2);
}

/// Blend NO falla cuando se pide más de lo que hay: entrega menos. Antes el adaptador lo
/// aceptaba y la tanda creía haber recibido el monto completo.
#[test]
fn retiro_recortado_por_blend_se_detecta() {
    let c = setup();
    let t = Address::generate(&c.env);
    let s = c.depositar(&t, 100 * U);
    let pedido = c.adaptador.valor(&s) + 1;
    assert_eq!(
        c.adaptador.try_retirar_monto(&t, &pedido),
        Err(Ok(ErrorAdaptador::SharesInsuficientes))
    );
    assert_eq!(c.adaptador.shares_de(&t), s);
    assert_eq!(c.token.balance(&t), 0);
}

/// HALLAZGO 1 (en la TANDA, no en el adaptador), ARREGLADO por M1 con `sacar_de_boveda`.
/// El adaptador lleva la cuenta por dueño, y el dueño es el CONTRATO de la tanda: todas sus tandas
/// comparten una sola cuenta. Antes, `cerrar_ronda` restaba `quemadas` de `t.shares_boveda` sin
/// revisar que alcanzaran: si se consumía todo el colateral de una tanda y el b_rate no subía lo
/// suficiente (reserva sin préstamos, o una pérdida en Blend), la tanda gastaba bTokens de OTRA
/// tanda (terminaba con -3) y la otra ya no podía finalizar.
///
/// Ahora una tanda nunca baja de 0 participaciones y las dos terminan, sin crear ni perder dinero.
#[test]
fn arreglado_una_tanda_nunca_gasta_btokens_de_otra() {
    let c = setup_sin_interes();
    let ct = tanda_con_blend(&c, 6);
    let cuota = 10 * U + 1; // un monto "raro": cuota / b_rate no es exacto
    let total = || {
        ct.miembros.iter().map(|m| c.token.balance(m)).sum::<i128>()
            + c.token.balance(&ct.tanda.address)
            + c.token.balance(&c.pool)
            + c.token.balance(&c.adaptador.address)
    };
    let inicial = total();
    // Tanda B: 3 miembros que pagan todo.
    let b = ct.crear_y_llenar_con(cuota, &ct.miembros[3..6]);
    // Tanda A: 3 miembros que no pagan nada; su colateral se gasta completo.
    let a = ct.crear_y_llenar_con(cuota, &ct.miembros[0..3]);
    for _ in 0..3 {
        ct.todos_pagan(b, &ct.miembros[3..6]);
        c.avanzar(120);
        ct.tanda.cerrar_ronda(&a);
        ct.tanda.cerrar_ronda(&b);
        assert!(ct.tanda.get_tanda(&a).shares_boveda >= 0);
    }
    ct.tanda.finalizar(&a);
    ct.tanda.finalizar(&b);
    assert_eq!(ct.tanda.get_tanda(&a).estado, Estado::Finalizada);
    assert_eq!(ct.tanda.get_tanda(&b).estado, Estado::Finalizada);
    // El adaptador no le debe nada a nadie: el contrato de la tanda quedó en 0 participaciones.
    assert_eq!(c.adaptador.shares_de(&ct.tanda.address), 0);
    assert!(c.btokens_adaptador() >= 0);
    assert_eq!(total(), inicial, "no se crea ni se pierde dinero");
}

/// Con interés normal (b_rate que sube), el rendimiento cubre el redondeo y el caso de arriba
/// no pasa: el mismo escenario termina bien.
#[test]
fn con_interes_el_mismo_escenario_termina_bien() {
    let c = setup();
    let ct = tanda_con_blend(&c, 6);
    let cuota = 10 * U + 1;
    let b = ct.crear_y_llenar_con(cuota, &ct.miembros[3..6]);
    let a = ct.crear_y_llenar_con(cuota, &ct.miembros[0..3]);
    for _ in 0..3 {
        ct.todos_pagan(b, &ct.miembros[3..6]);
        c.avanzar(120);
        ct.tanda.cerrar_ronda(&a);
        ct.tanda.cerrar_ronda(&b);
    }
    assert!(ct.tanda.get_tanda(&a).shares_boveda >= 0);
    ct.tanda.finalizar(&a);
    ct.tanda.finalizar(&b);
    assert_eq!(ct.tanda.get_tanda(&b).estado, Estado::Finalizada);
}

// ===========================================================================
// 2. ¿`valor()` está desactualizado?
// ===========================================================================

/// `get_reserve` de Blend v2 llama `Reserve::load`, que acumula el interés hasta el ledger
/// actual (pool/src/pool/reserve.rs). Por eso `valor()` coincide con lo que paga `retirar`
/// en ese mismo momento, aunque nadie haya tocado la reserva en horas.
#[test]
fn valor_coincide_con_lo_que_paga_retirar() {
    let c = setup();
    let t = Address::generate(&c.env);
    let s = c.depositar(&t, 250 * U);
    c.avanzar(6 * 3600); // nadie toca la reserva en 6 horas
    let v = c.adaptador.valor(&s);
    assert!(v > 250 * U);
    assert_eq!(c.adaptador.retirar(&t, &s), v);
}

// ===========================================================================
// 3. Liquidez: pool muy prestado
// ===========================================================================

/// Si casi todo está prestado, un retiro que deja la reserva al 100 % falla (error 1207 de
/// Blend) y la tanda NO puede cerrar la ronda ni finalizar. No se pierde dinero: se revierte,
/// y en cuanto vuelve la liquidez, cualquiera puede reintentar y todo termina bien.
#[test]
fn sin_liquidez_la_tanda_se_traba_y_se_destraba() {
    let c = setup();
    let ct = tanda_con_blend(&c, 3);
    let cuota = 10 * U;
    let id = ct.crear_y_llenar(cuota);
    // Un prestatario se lleva casi todo: quedan libres menos de una cuota.
    let libre = c.pool().liquidez();
    let deudor = Address::generate(&c.env);
    c.pool().prestar(&deudor, &(libre - cuota / 2));

    // Ronda 0: nadie paga -> hay que sacar colateral de Blend -> falla por liquidez.
    c.avanzar(120);
    assert_eq!(error_contrato(ct.tanda.try_cerrar_ronda(&id)), 1207);
    assert_eq!(
        ct.tanda.get_tanda(&id).ronda_actual,
        0,
        "la ronda sigue abierta"
    );

    // Mientras tanto, los miembros todavía pueden pagar (tarde): no se toca Blend.
    ct.todos_pagan(id, &ct.miembros);
    ct.tanda.cerrar_ronda(&id); // ya no necesita Blend
    for _ in 1..3 {
        ct.todos_pagan(id, &ct.miembros);
        c.avanzar(120);
        ct.tanda.cerrar_ronda(&id);
    }
    // Finalizar saca TODO de Blend: falla mientras no haya liquidez...
    assert_eq!(error_contrato(ct.tanda.try_finalizar(&id)), 1207);
    // ...y funciona en cuanto el prestatario devuelve.
    c.pool().devolver(&deudor, &(libre - cuota / 2));
    ct.tanda.finalizar(&id);
    assert_eq!(ct.tanda.get_tanda(&id).estado, Estado::Finalizada);
}

// ===========================================================================
// 4. Estado del pool: congelado, reserva deshabilitada, tope de depósitos
// ===========================================================================

/// Blend v2 (`Pool::require_action_allowed`): con el pool congelado (estado 4 o 5) no se puede
/// DEPOSITAR, pero retirar siempre se puede. Resultado: nadie puede unirse a una tanda nueva,
/// y las tandas en curso siguen funcionando y terminan bien.
#[test]
fn pool_congelado_bloquea_unirse_pero_no_retirar() {
    let c = setup();
    let ct = tanda_con_blend(&c, 6);
    let cuota = 10 * U;
    let id = ct.crear_y_llenar_con(cuota, &ct.miembros[0..3]);
    let nueva = ct.crear(cuota, 3);
    c.pool().set_estado(&5);
    assert_eq!(
        error_contrato(ct.tanda.try_unirse(&nueva, &ct.miembros[3])),
        1206
    );
    // La tanda en curso: nadie paga en la ronda 0 (se RETIRA colateral de Blend) y luego
    // todos pagan.
    c.avanzar(120);
    ct.tanda.cerrar_ronda(&id);
    for _ in 1..3 {
        ct.todos_pagan(id, &ct.miembros[0..3]);
        c.avanzar(120);
        ct.tanda.cerrar_ronda(&id);
    }
    ct.tanda.finalizar(&id);
    assert_eq!(ct.tanda.get_tanda(&id).estado, Estado::Finalizada);

    // "On ice" (estado 2 o 3) solo bloquea pedir prestado: unirse sí funciona.
    c.pool().set_estado(&3);
    ct.tanda.unirse(&nueva, &ct.miembros[3]);
}

#[test]
fn reserva_deshabilitada_o_tope_lleno_bloquean_unirse() {
    let c = setup();
    let ct = tanda_con_blend(&c, 3);
    let id = ct.crear(10 * U, 3);
    c.pool().set_habilitada(&false);
    assert_eq!(
        error_contrato(ct.tanda.try_unirse(&id, &ct.miembros[0])),
        1223
    );
    c.pool().set_habilitada(&true);
    c.pool().set_tope(&(5 * U));
    assert_eq!(
        error_contrato(ct.tanda.try_unirse(&id, &ct.miembros[0])),
        1220
    );
}

/// HALLAZGO 2, ARREGLADO por M1 con `sacar_de_boveda`. Blend v2 puede BAJAR el b_rate si hay
/// deuda incobrable que el backstop no cubre (`User::default_liabilities`): la garantía vale menos
/// que lo anotado en la tanda. Antes, `cerrar_ronda` fallaba y la ronda quedaba trabada hasta que
/// los morosos pagaran. Ahora cubre con lo que de verdad queda en la bóveda, la tanda sigue y
/// termina, y la pérdida la asume la bóveda (no se anota como deuda de nadie).
#[test]
fn arreglado_perdida_en_blend_se_cubre_con_lo_que_hay() {
    let c = setup_sin_interes();
    let ct = tanda_con_blend(&c, 3);
    let cuota = 10 * U;
    let id = ct.crear_y_llenar(cuota); // 40 de colateral anotado (20 + 10 + 10)
                                       // Blend presta la mitad de lo depositado y ese préstamo se vuelve incobrable:
                                       // los depositantes pierden la mitad. El colateral anotado (40) vale ~20 en Blend.
    let deudor = Address::generate(&c.env);
    let mitad = c.pool().liquidez() / 2;
    c.pool().prestar(&deudor, &mitad);
    c.pool().incobrable(&mitad);
    let valor = c.adaptador.valor(&ct.tanda.get_tanda(&id).shares_boveda);
    assert!(valor < 21 * U);
    let total = || {
        ct.miembros.iter().map(|m| c.token.balance(m)).sum::<i128>()
            + c.token.balance(&ct.tanda.address)
            + c.token.balance(&c.pool)
            + c.token.balance(&c.adaptador.address)
            + c.token.balance(&deudor)
    };
    let inicial = total();

    // Nadie paga la ronda 0: hay que cubrir 3 cuotas (30) con algo que vale ~20.
    c.avanzar(120);
    ct.tanda.cerrar_ronda(&id);
    assert_eq!(ct.tanda.get_tanda(&id).ronda_actual, 1, "la ronda avanzó");
    assert_eq!(
        ct.tanda.get_tanda(&id).shares_boveda,
        0,
        "se usó todo lo que había"
    );
    for _ in 1..3 {
        c.avanzar(120);
        ct.tanda.cerrar_ronda(&id);
    }
    ct.tanda.finalizar(&id);
    assert_eq!(ct.tanda.get_tanda(&id).estado, Estado::Finalizada);
    assert_eq!(c.adaptador.shares_de(&ct.tanda.address), 0);
    assert_eq!(total(), inicial, "no se crea ni se pierde dinero");
}

// ===========================================================================
// 6. Permisos
// ===========================================================================

/// Sin firmas simuladas: nadie puede retirar las participaciones de otro dueño, ni depositar
/// a nombre de otro (aunque ese otro le haya dado permiso de gastar al adaptador).
#[test]
fn nadie_mueve_lo_de_otro_sin_su_firma() {
    let c = setup();
    let duenio = Address::generate(&c.env);
    let s = c.depositar(&duenio, 100 * U);
    c.env.set_auths(&[]);
    assert!(c.adaptador.try_retirar(&duenio, &s).is_err());
    assert!(c.adaptador.try_retirar_monto(&duenio, &U).is_err());
    assert!(c.adaptador.try_depositar(&duenio, &U).is_err());
    assert_eq!(c.adaptador.shares_de(&duenio), s);
}

// ===========================================================================
// Peor caso: 12 miembros, nadie paga (12 retiros de Blend en un solo cerrar_ronda)
// ===========================================================================

#[test]
fn peor_caso_12_miembros_nadie_paga() {
    let c = setup();
    let ct = tanda_con_blend(&c, 12);
    let id = ct.crear_y_llenar(10 * U);
    c.avanzar(120);
    c.env.cost_estimate().budget().reset_unlimited();
    ct.tanda.cerrar_ronda(&id);
    let cpu = c.env.cost_estimate().budget().cpu_instruction_cost();
    let mem = c.env.cost_estimate().budget().memory_bytes_cost();
    std::println!(
        "cerrar_ronda con 12 retiros de Blend (pool simulado): {cpu} instrucciones, {mem} bytes"
    );
    // El pool simulado es mucho más liviano que Blend: el costo real se mide en testnet.
    assert!(cpu < 100_000_000);
}

// ===========================================================================
// 5. TTL (política acordada con M1: máximo de la red, como mucho una vez al día)
// ===========================================================================

/// Las participaciones y el adaptador quedan con la vida máxima de la red en cada operación, y
/// `renovar` (sin firma) las vuelve a llevar al máximo aunque nadie deposite ni retire en meses.
#[test]
fn ttl_al_maximo_y_renovar_sin_firma() {
    use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
    let c = setup();
    let t = Address::generate(&c.env);
    c.depositar(&t, 100 * U);
    let max = c.env.storage().max_ttl();
    let ttl_shares = || {
        c.env.as_contract(&c.adaptador.address, || {
            c.env
                .storage()
                .persistent()
                .get_ttl(&Clave::Shares(t.clone()))
        })
    };
    let ttl_instancia = || {
        c.env.as_contract(&c.adaptador.address, || {
            c.env.storage().instance().get_ttl()
        })
    };
    assert_eq!(ttl_shares(), max);
    assert_eq!(ttl_instancia(), max);

    // Pasan 60 días sin que nadie toque el adaptador.
    c.env
        .ledger()
        .with_mut(|l| l.sequence_number += 60 * 17_280);
    assert_eq!(ttl_shares(), max - 60 * 17_280);
    c.env.set_auths(&[]); // renovar no pide firma
    c.adaptador.renovar(&t);
    assert_eq!(ttl_shares(), max);
    assert_eq!(ttl_instancia(), max);
    // Renovar a un dueño que no existe no crea nada ni falla.
    let nadie = Address::generate(&c.env);
    c.adaptador.renovar(&nadie);
    assert_eq!(c.adaptador.shares_de(&nadie), 0);
    // Lecturas para la web.
    assert_eq!(c.adaptador.pool(), c.pool);
    assert_eq!(c.adaptador.token(), c.token.address);
}

// ===========================================================================
// Bóveda por token (fase 2): el adaptador registrado para su token en la tanda
// ===========================================================================

/// La tanda registra el adaptador de Blend para su token (USDC → Blend). Como el adaptador dice qué
/// token guarda (`token()`), la tanda no deja registrarlo para otro token (56) ni crear tandas en un
/// token sin bóveda cuando la bóveda general es de otro (55). La tanda en el token registrado
/// funciona de punta a punta con rendimiento y el dinero cuadra.
#[test]
fn adaptador_registrado_por_token_en_la_tanda() {
    let c = setup(); // "XLM": el adaptador de este contexto es la bóveda general de la tanda
    let ct = tanda_con_blend(&c, 3);

    // Segunda moneda ("USDC") con su propio pool y su propio adaptador.
    let usdc = c
        .env
        .register_stellar_asset_contract_v2(Address::generate(&c.env));
    let usdc_sac = soroban_sdk::token::StellarAssetClient::new(&c.env, &usdc.address());
    let usdc_tok = soroban_sdk::token::TokenClient::new(&c.env, &usdc.address());
    let pool2 = c
        .env
        .register(PoolSimulado, (usdc.address(), 1_057_090_226_439i128, SUBE));
    usdc_sac.mint(&pool2, &FONDOS_POOL);
    let ad2 = c
        .env
        .register(AdaptadorBlend, (pool2.clone(), usdc.address()));
    for m in &ct.miembros {
        usdc_sac.mint(m, &(1_000 * U));
    }

    assert_eq!(
        ct.tanda
            .try_registrar_boveda(&usdc.address(), &Some(c.adaptador.address.clone())),
        Err(Ok(ErrorTanda::BovedaDeOtroToken))
    );
    let otra_moneda = Address::generate(&c.env);
    assert_eq!(
        ct.tanda.try_crear_tanda(
            &Address::generate(&c.env),
            &otra_moneda,
            &(10 * U),
            &3,
            &120,
            &1000,
            &10_000
        ),
        Err(Ok(ErrorTanda::TokenSinBoveda))
    );

    ct.tanda
        .registrar_boveda(&usdc.address(), &Some(ad2.clone()));
    let total = || {
        ct.miembros
            .iter()
            .map(|m| usdc_tok.balance(m))
            .sum::<i128>()
            + usdc_tok.balance(&ct.tanda.address)
            + usdc_tok.balance(&pool2)
            + usdc_tok.balance(&ad2)
    };
    let inicial = total();
    let id = ct.tanda.crear_tanda(
        &Address::generate(&c.env),
        &usdc.address(),
        &(10 * U),
        &3,
        &120,
        &1000,
        &10_000,
    );
    assert_eq!(ct.tanda.get_boveda(&id), ad2);
    for m in &ct.miembros {
        ct.tanda.unirse(&id, m);
    }
    assert!(AdaptadorBlendClient::new(&c.env, &ad2).shares_de(&ct.tanda.address) > 0);
    assert_eq!(
        c.adaptador.shares_de(&ct.tanda.address),
        0,
        "nada fue al adaptador de XLM"
    );
    // El primero no paga la ronda 1: su garantía sale de Blend (USDC).
    for r in 0..3 {
        for (i, m) in ct.miembros.iter().enumerate() {
            if !(r == 1 && i == 0) {
                ct.tanda.pagar_cuota(&id, m);
            }
        }
        c.avanzar(120);
        ct.tanda.cerrar_ronda(&id);
    }
    ct.tanda.finalizar(&id);
    assert_eq!(ct.tanda.get_tanda(&id).estado, Estado::Finalizada);
    assert_eq!(
        AdaptadorBlendClient::new(&c.env, &ad2).shares_de(&ct.tanda.address),
        0
    );
    assert_eq!(total(), inicial, "no se crea ni se pierde dinero");
    // Los dos que cumplieron ganaron rendimiento real (pool simulado) además de su premio.
    assert!(usdc_tok.balance(&ct.miembros[1]) > 1_000 * U);
    assert!(usdc_tok.balance(&ct.miembros[2]) > 1_000 * U);
}
