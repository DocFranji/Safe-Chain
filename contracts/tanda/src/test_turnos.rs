//! Pruebas de la misión M3 (mecanismos de turnos). Ya está declarado en `lib.rs`.
//! Usa los helpers compartidos (`setup`, `Ctx`, `assert_conservacion`, ...) de `test.rs`.
//!
//! Cada modo tiene una tanda completa de punta a punta con conservación del dinero, sus casos de
//! error y su combinación con impagos y morosos. Las de 12 miembros miden el presupuesto.
#![allow(unused_imports)]
extern crate std;

use crate::test::*;
use crate::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    token::StellarAssetClient,
    vec, Address, Bytes, BytesN, Env, Map, Vec,
};
use std::vec::Vec as SVec;

// ===========================================================================
// Helpers de este archivo
// ===========================================================================

fn opciones(modo: ModoTurnos) -> OpcionesTanda {
    OpcionesTanda {
        modo,
        permitir_intercambio: false,
        prima_max_bps: 0,
        descuento_max_bps: 0,
        primeros_con_historial: 0,
        puntaje_primeros: 0,
        ofertas_selladas: false,
    }
}

/// Subasta con ofertas selladas (comprometer y revelar).
fn sellada(descuento_max_bps: u32) -> OpcionesTanda {
    OpcionesTanda {
        ofertas_selladas: true,
        ..subasta(descuento_max_bps)
    }
}

/// sello = sha256(descuento_bps en 4 bytes big-endian ‖ sal), igual que `revelar_oferta` y la web.
fn sello(env: &Env, descuento_bps: u32, sal: &BytesN<32>) -> BytesN<32> {
    let mut d = Bytes::from_array(env, &descuento_bps.to_be_bytes());
    d.append(&Bytes::from(sal.clone()));
    env.crypto().sha256(&d).to_bytes()
}

fn sal(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

/// Los primeros `k` turnos piden `puntaje` de historial (M2).
fn primeros(o: OpcionesTanda, k: u32, puntaje: u32) -> OpcionesTanda {
    OpcionesTanda {
        primeros_con_historial: k,
        puntaje_primeros: puntaje,
        ..o
    }
}

fn con_intercambio(mut o: OpcionesTanda) -> OpcionesTanda {
    o.permitir_intercambio = true;
    o
}

fn precio(prima_max_bps: u32) -> OpcionesTanda {
    OpcionesTanda {
        prima_max_bps,
        ..opciones(ModoTurnos::PrecioPorTurno)
    }
}

fn subasta(descuento_max_bps: u32) -> OpcionesTanda {
    OpcionesTanda {
        descuento_max_bps,
        ..opciones(ModoTurnos::Subasta)
    }
}

impl Ctx {
    /// Tanda con opciones de turnos: cuota 100, multa 10 %.
    fn crear_con(&self, n: u32, cobertura_bps: u32, o: &OpcionesTanda) -> u32 {
        self.tanda.crear_tanda_avanzada(
            &self.creador,
            &self.token.address,
            &CUOTA,
            &n,
            &PERIODO,
            &1_000,
            &cobertura_bps,
            o,
        )
    }

    /// Ana, Beto, Carla y, si hacen falta más, personas nuevas. Con más de 3, todos reciben
    /// además una reserva (con 12 personas, las cuotas y la garantía pasan de 1 000 TUSD).
    fn personas(&self, n: usize) -> SVec<Address> {
        let mut v = std::vec![self.ana.clone(), self.beto.clone(), self.carla.clone()];
        let sac = StellarAssetClient::new(&self.env, &self.token.address);
        while v.len() < n {
            let p = Address::generate(&self.env);
            sac.mint(&p, &SALDO_INICIAL);
            v.push(p);
        }
        v.truncate(n);
        if n > 3 && self.saldo(&self.ana) == SALDO_INICIAL {
            for p in &v {
                sac.mint(p, &RESERVA);
            }
        }
        v
    }

    /// Conservación con cualquier número de personas (las tres de siempre incluidas).
    fn conservacion(&self, personas: &[Address]) {
        let mut total = self.saldo(&self.boveda) + self.saldo(&self.tanda_addr);
        for p in personas {
            total += self.saldo(p);
        }
        let n = personas.len().max(3);
        assert_eq!(
            total,
            n as i128 * inicial(n) + FONDEO_BOVEDA,
            "el dinero no cuadra"
        );
    }

    fn turno(&self, id: u32, p: &Address) -> u32 {
        self.miembro(id, p).posicion
    }

    /// Quién cobra en la ronda `r` (según los turnos ya asignados).
    fn duenio(&self, id: u32, personas: &[Address], r: u32) -> Address {
        personas
            .iter()
            .find(|p| self.turno(id, p) == r)
            .expect("nadie tiene ese turno")
            .clone()
    }

    fn pagan_todos(&self, id: u32, personas: &[Address]) {
        for p in personas {
            self.tanda.pagar_cuota(&id, p);
        }
    }

    fn cerrar(&self, id: u32) {
        self.avanzar(PERIODO);
        self.tanda.cerrar_ronda(&id);
    }

    fn al_final(&self, id: u32, personas: &[Address]) {
        assert_eq!(self.tanda.get_tanda(&id).estado, Estado::PorLiquidar);
        self.tanda.finalizar(&id);
        assert_eq!(
            self.saldo(&self.tanda_addr),
            0,
            "no debe quedar dinero en el contrato"
        );
        self.conservacion(personas);
    }
}

/// Reserva extra por persona en las tandas de más de 3 (ver `Ctx::personas`).
const RESERVA: i128 = 10_000 * U;

/// Saldo con el que empieza cada persona en una tanda de `n`.
fn inicial(n: usize) -> i128 {
    SALDO_INICIAL + if n > 3 { RESERVA } else { 0 }
}

/// Instrucciones de CPU de la última llamada (con el código nativo de las pruebas; en WASM son más).
fn costo(c: &Ctx) -> i64 {
    c.env.cost_estimate().resources().instructions
}

// ===========================================================================
// Paridad y opciones
// ===========================================================================

/// Una tanda con `crear_tanda_avanzada(Llegada)` termina con los mismos saldos que una con
/// `crear_tanda`, en el escenario de la demo (Ana cobra y desaparece; Beto paga tarde).
#[test]
fn paridad_llegada_con_opciones_igual_que_crear_tanda() {
    let mut resultados = SVec::new();
    for con_opciones in [false, true] {
        let c = setup();
        let id = if con_opciones {
            c.crear_con(3, 10_000, &opciones(ModoTurnos::Llegada))
        } else {
            c.crear(10_000)
        };
        for p in [&c.ana, &c.beto, &c.carla] {
            c.tanda.unirse(&id, p);
        }
        c.pagan_todos(id, &c.personas(3));
        c.cerrar(id);
        c.tanda.pagar_cuota(&id, &c.beto);
        c.tanda.pagar_cuota(&id, &c.carla);
        c.cerrar(id);
        c.tanda.pagar_cuota(&id, &c.carla);
        c.avanzar(PERIODO + 10);
        c.tanda.pagar_cuota(&id, &c.beto);
        c.tanda.cerrar_ronda(&id);
        c.tanda.finalizar(&id);
        c.assert_conservacion();
        resultados.push([c.saldo(&c.ana), c.saldo(&c.beto), c.saldo(&c.carla)]);
    }
    assert_eq!(resultados[0], resultados[1]);
    // Mismo resultado que la prueba de la demo: Ana 0, Beto −10 de multa, Carla +10 de premio.
    assert_eq!(
        resultados[0],
        [
            SALDO_INICIAL,
            SALDO_INICIAL - 10 * U,
            SALDO_INICIAL + 10 * U
        ]
    );
}

#[test]
fn tanda_sin_opciones_no_usa_turnos_nuevos() {
    let c = setup();
    let id = c.crear(10_000);
    assert_eq!(c.tanda.get_opciones(&id), opciones(ModoTurnos::Llegada));
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id, &c.ana, &1),
        Err(Ok(Error::ModoNoPermite))
    );
    c.tanda.unirse(&id, &c.ana);
    assert_eq!(c.turno(id, &c.ana), 0);
    // En llegada con opciones tampoco se elige turno.
    let id2 = c.crear_con(3, 10_000, &opciones(ModoTurnos::Llegada));
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id2, &c.ana, &2),
        Err(Ok(Error::ModoNoPermite))
    );
    let e = c.tanda.get_estado_turnos(&id);
    assert_eq!(e.mejor_postor, None);
    assert_eq!(e.fondo_primas, 0);
}

#[test]
fn opciones_invalidas_se_rechazan() {
    let c = setup();
    let malas = [
        precio(0),
        precio(2_001),
        subasta(0),
        subasta(5_001),
        con_intercambio(subasta(1_000)),
        OpcionesTanda {
            prima_max_bps: 100,
            ..opciones(ModoTurnos::Llegada)
        },
        OpcionesTanda {
            descuento_max_bps: 100,
            ..opciones(ModoTurnos::Sorteo)
        },
        OpcionesTanda {
            descuento_max_bps: 100,
            ..precio(1_000)
        },
    ];
    for o in malas {
        assert_eq!(
            c.tanda.try_crear_tanda_avanzada(
                &c.creador,
                &c.token.address,
                &CUOTA,
                &3,
                &PERIODO,
                &1_000,
                &10_000,
                &o
            ),
            Err(Ok(Error::OpcionesInvalidas)),
            "{o:?}"
        );
    }
    // Las validaciones de siempre se heredan de `crear_tanda`.
    assert_eq!(
        c.tanda.try_crear_tanda_avanzada(
            &c.creador,
            &c.token.address,
            &CUOTA,
            &13,
            &PERIODO,
            &1_000,
            &10_000,
            &opciones(ModoTurnos::Sorteo)
        ),
        Err(Ok(Error::ParametroInvalido))
    );
    let id = c.crear_con(3, 10_000, &precio(800));
    assert_eq!(c.tanda.get_opciones(&id), precio(800));
}

// ===========================================================================
// Sorteo
// ===========================================================================

#[test]
fn sorteo_asigna_un_orden_valido_y_la_garantia_se_completa_al_cobrar() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &opciones(ModoTurnos::Sorteo));
    let gente = c.personas(3);
    for p in &gente {
        assert_eq!(c.tanda.colateral_siguiente(&id), CUOTA);
        c.tanda.unirse(&id, p);
    }
    // Antes de llenarse nadie tiene turno; al llenarse, los turnos son una permutación de 0..3.
    let mut turnos: SVec<u32> = gente.iter().map(|p| c.turno(id, p)).collect();
    turnos.sort();
    assert_eq!(turnos, std::vec![0, 1, 2]);
    for p in &gente {
        assert_eq!(c.miembro(id, p).colateral, CUOTA); // todos dejaron una cuota
    }

    for r in 0..3u32 {
        let quien = c.duenio(id, &gente, r);
        let antes = c.saldo(&quien);
        c.pagan_todos(id, &gente);
        c.cerrar(id);
        // Garantía del turno: 200, 100, 100. Al primero se le apartan 100 de su bolsa.
        let apartado = if r == 0 { 100 * U } else { 0 };
        assert_eq!(c.saldo(&quien), antes - CUOTA + 300 * U - apartado);
        assert_eq!(
            c.miembro(id, &quien).colateral,
            if r == 0 { 200 * U } else { CUOTA }
        );
    }
    c.al_final(id, &gente);
    for p in &gente {
        assert_eq!(c.saldo(p), SALDO_INICIAL); // sin rendimiento ni multas: todos quedan igual
    }
    c.assert_conservacion();
}

#[test]
fn sorteo_cambia_con_la_semilla() {
    let mut ordenes = SVec::new();
    for semilla in [1u8, 2, 3] {
        let c = setup();
        c.env.host().set_base_prng_seed([semilla; 32]).unwrap();
        let id = c.crear_con(12, 10_000, &opciones(ModoTurnos::Sorteo));
        let gente = c.personas(12);
        for p in &gente {
            c.tanda.unirse(&id, p);
        }
        let orden: SVec<u32> = gente.iter().map(|p| c.turno(id, p)).collect();
        let mut ordenado = orden.clone();
        ordenado.sort();
        assert_eq!(
            ordenado,
            (0..12).collect::<SVec<u32>>(),
            "debe ser una permutación"
        );
        ordenes.push(orden);
    }
    assert!(
        ordenes[0] != ordenes[1] || ordenes[1] != ordenes[2],
        "el orden debería cambiar con la semilla"
    );
}

/// Quien gana el primer turno del sorteo cobra y desaparece: la garantía apartada de su bolsa
/// cubre lo que debía y el grupo no pierde nada (como Ana en la demo).
#[test]
fn sorteo_quien_cobra_y_huye_no_gana_nada() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &opciones(ModoTurnos::Sorteo));
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let huye = c.duenio(id, &gente, 0);
    let resto: SVec<Address> = gente.iter().filter(|p| **p != huye).cloned().collect();
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    for r in 1..3u32 {
        let quien = c.duenio(id, &gente, r);
        let antes = c.saldo(&quien);
        c.pagan_todos(id, &resto);
        c.cerrar(id);
        assert_eq!(c.saldo(&quien), antes - CUOTA + 300 * U, "bolsa completa");
    }
    assert_eq!(c.miembro(id, &huye).colateral, 0);
    assert!(!c.miembro(id, &huye).moroso);
    c.al_final(id, &gente);
    assert_eq!(c.saldo(&huye), SALDO_INICIAL); // huir no le dio nada
    c.assert_conservacion();
}

/// Quien deja de pagar ANTES de su turno cae en mora y su bolsa se retiene: se reparte al final.
#[test]
fn sorteo_moroso_antes_de_su_turno_pierde_su_bolsa() {
    let c = setup();
    c.env.host().set_base_prng_seed([9; 32]).unwrap();
    let id = c.crear_con(3, 10_000, &opciones(ModoTurnos::Sorteo));
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let ultimo = c.duenio(id, &gente, 2);
    let cumplen: SVec<Address> = gente.iter().filter(|p| **p != ultimo).cloned().collect();
    for _ in 0..3 {
        c.pagan_todos(id, &cumplen);
        c.cerrar(id);
    }
    let m = c.miembro(id, &ultimo);
    assert!(m.moroso && !m.cobro);
    assert_eq!(m.deuda, 200 * U); // las cuotas de las rondas 2 y 3 que su garantía no cubrió
    assert_eq!(c.tanda.get_tanda(&id).retenido, 200 * U);
    c.al_final(id, &gente);
    assert_eq!(c.saldo(&ultimo), SALDO_INICIAL - CUOTA); // pierde su garantía
    c.assert_conservacion();
}

#[test]
fn sorteo_no_deja_elegir_turno() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &opciones(ModoTurnos::Sorteo));
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id, &c.ana, &0),
        Err(Ok(Error::ModoNoPermite))
    );
    c.tanda.unirse(&id, &c.ana);
    assert_eq!(c.turno(id, &c.ana), SIN_TURNO);
}

/// Peor caso: el último `unirse` de un sorteo de 12 baraja y reescribe a los 12 miembros.
#[test]
fn sorteo_12_miembros_presupuesto() {
    let c = setup();
    let id = c.crear_con(12, 10_000, &opciones(ModoTurnos::Sorteo));
    let gente = c.personas(12);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let r = c.env.cost_estimate().resources();
    std::println!(
        "sorteo, ultimo unirse (12): {} instrucciones, {} escrituras",
        r.instructions,
        r.write_entries
    );
    assert!(
        r.instructions < 100_000_000,
        "demasiado caro: {}",
        r.instructions
    );
    assert!(r.contract_events_size_bytes <= 16_384);
    for _ in 0..12 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
    for p in &gente {
        assert_eq!(c.saldo(p), inicial(12));
    }
}

// ===========================================================================
// Elegir turno y precio por turno
// ===========================================================================

/// 3 personas, bolsa 300, prima máxima 8 %: el turno 1 cobra 276, el 2 cobra 300 y el 3 cobra 324.
#[test]
fn precio_por_turno_quien_tiene_prisa_paga_y_quien_espera_gana() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &precio(800));
    assert_eq!(c.tanda.cotizar_turno(&id, &c.beto, &0), (200 * U, 24 * U));
    assert_eq!(c.tanda.cotizar_turno(&id, &c.beto, &1), (CUOTA, 0));
    assert_eq!(c.tanda.cotizar_turno(&id, &c.beto, &2), (CUOTA, -24 * U));
    c.tanda.unirse_en_turno(&id, &c.ana, &2);
    c.tanda.unirse_en_turno(&id, &c.beto, &0);
    c.tanda.unirse_en_turno(&id, &c.carla, &1);
    assert_eq!(c.miembro(id, &c.beto).colateral, 200 * U);
    assert_eq!(c.miembro(id, &c.ana).colateral, CUOTA);
    let gente = c.personas(3);

    let esperado = [(&c.beto, 276 * U), (&c.carla, 300 * U), (&c.ana, 324 * U)];
    for (r, (quien, recibe)) in esperado.iter().enumerate() {
        let antes = c.saldo(quien);
        c.pagan_todos(id, &gente);
        c.cerrar(id);
        assert_eq!(c.saldo(quien), antes - CUOTA + recibe, "ronda {r}");
    }
    assert_eq!(c.tanda.get_estado_turnos(&id).fondo_primas, 0);
    c.al_final(id, &gente);
    assert_eq!(c.saldo(&c.beto), SALDO_INICIAL - 24 * U);
    assert_eq!(c.saldo(&c.carla), SALDO_INICIAL);
    assert_eq!(c.saldo(&c.ana), SALDO_INICIAL + 24 * U);
    c.assert_conservacion();
}

#[test]
fn elegir_turno_errores_y_turno_libre_mas_bajo() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &con_intercambio(opciones(ModoTurnos::Eleccion)));
    c.tanda.unirse_en_turno(&id, &c.ana, &1);
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id, &c.beto, &1),
        Err(Ok(Error::TurnoOcupado))
    );
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id, &c.beto, &3),
        Err(Ok(Error::TurnoInvalido))
    );
    assert_eq!(
        c.tanda.try_cotizar_turno(&id, &c.beto, &3),
        Err(Ok(Error::TurnoInvalido))
    );
    // Sin elegir: el turno libre más bajo (0), con su garantía.
    assert_eq!(c.tanda.colateral_siguiente(&id), 200 * U);
    c.tanda.unirse(&id, &c.beto);
    assert_eq!(c.turno(id, &c.beto), 0);
    assert_eq!(c.tanda.colateral_siguiente(&id), CUOTA);
    c.tanda.unirse_en_turno(&id, &c.carla, &2);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Activa);
    // Elegir es gratis: sin prima.
    assert_eq!(c.tanda.cotizar_turno(&id, &c.ana, &0), (200 * U, 0));
    let gente = c.personas(3);
    for _ in 0..3 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
    for p in &gente {
        assert_eq!(c.saldo(p), SALDO_INICIAL);
    }
}

/// La prima se aparta aunque la bolsa se retenga, y el fondo siempre cuadra.
#[test]
fn precio_por_turno_con_moroso_el_fondo_cuadra() {
    let c = setup();
    let id = c.crear_con(3, 0, &precio(1_000)); // cobertura 0: todos dejan una cuota
    c.tanda.unirse_en_turno(&id, &c.ana, &0);
    c.tanda.unirse_en_turno(&id, &c.beto, &1);
    c.tanda.unirse_en_turno(&id, &c.carla, &2);
    let cumplen = [c.ana.clone(), c.beto.clone()];
    // Ronda 1: Carla no paga (su garantía cubre). Ana cobra 300 − 30 de prima.
    let ana0 = c.saldo(&c.ana);
    c.pagan_todos(id, &cumplen);
    c.cerrar(id);
    assert_eq!(c.saldo(&c.ana), ana0 - CUOTA + 270 * U);
    assert_eq!(c.tanda.get_estado_turnos(&id).fondo_primas, 30 * U);
    // Ronda 2: Carla no paga y cae en mora: Beto cobra 200.
    c.pagan_todos(id, &cumplen);
    c.cerrar(id);
    assert!(c.miembro(id, &c.carla).moroso);
    // Ronda 3: le tocaba a Carla (en mora): su bolsa (200 + 30 de bonificación) se retiene.
    c.pagan_todos(id, &cumplen);
    c.cerrar(id);
    let e = c.tanda.get_estado_turnos(&id);
    assert_eq!(e.fondo_primas, 0);
    assert_eq!(c.tanda.get_tanda(&id).retenido, 230 * U);
    c.al_final(id, &c.personas(3));
    c.assert_conservacion();
    // Lo retenido se reparte entre Ana y Beto (nunca se atrasaron).
    assert_eq!(c.saldo(&c.carla), SALDO_INICIAL - CUOTA);
}

/// Peor caso: 12 miembros, prima máxima 20 %, cada uno elige su turno (al revés de su llegada).
#[test]
fn precio_por_turno_12_miembros_suma_cero_y_presupuesto() {
    let c = setup();
    let id = c.crear_con(12, 10_000, &precio(2_000));
    let gente = c.personas(12);
    let mut suma_primas = 0i128;
    for (i, p) in gente.iter().enumerate() {
        let turno = 11 - i as u32;
        suma_primas += c.tanda.cotizar_turno(&id, p, &turno).1;
        c.tanda.unirse_en_turno(&id, p, &turno);
    }
    assert_eq!(suma_primas, 0, "las primas suman cero");
    let mut peor = 0;
    for _ in 0..12 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
        peor = peor.max(costo(&c));
    }
    std::println!("precio por turno, cerrar_ronda (12): {peor} instrucciones como máximo");
    assert!(peor < 100_000_000);
    assert_eq!(c.tanda.get_estado_turnos(&id).fondo_primas, 0);
    c.al_final(id, &gente);
    // Turno 1 (llegó último) pagó 20 % de la bolsa (240); turno 12 (llegó primero) ganó 240.
    assert_eq!(c.saldo(&gente[11]), inicial(12) - 240 * U);
    assert_eq!(c.saldo(&gente[0]), inicial(12) + 240 * U);
}

// ===========================================================================
// Subasta
// ===========================================================================

/// Carla ofrece el mayor descuento (10 % = 30): cobra 270, de los que se apartan 100 para su
/// garantía; Ana y Beto reciben 15 cada uno en su garantía.
#[test]
fn subasta_gana_el_mayor_descuento_y_reparte_dividendos() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &subasta(3_000));
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let respaldo = c.tanda.get_estado_turnos(&id).respaldo;
    assert_eq!(
        respaldo.len(),
        3,
        "el orden de respaldo se sortea al llenarse"
    );

    c.tanda.ofertar(&id, &c.beto, &500);
    c.tanda.ofertar(&id, &c.carla, &1_000);
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.ana, &1_000),
        Err(Ok(Error::OfertaInvalida)) // igualar no alcanza: gana la más temprana
    );
    let e = c.tanda.get_estado_turnos(&id);
    assert_eq!(e.mejor_postor, Some(c.carla.clone()));
    assert_eq!(e.mejor_oferta_bps, 1_000);

    let carla0 = c.saldo(&c.carla);
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    assert_eq!(c.turno(id, &c.carla), 0);
    assert_eq!(c.saldo(&c.carla), carla0 - CUOTA + 170 * U);
    assert_eq!(c.miembro(id, &c.carla).colateral, 200 * U);
    assert_eq!(c.miembro(id, &c.ana).colateral, 115 * U);
    assert_eq!(c.miembro(id, &c.beto).colateral, 115 * U);
    assert_eq!(c.tanda.get_estado_turnos(&id).mejor_postor, None);

    // Ronda 2: nadie oferta. Cobra el primero del respaldo que aún no tiene turno.
    let siguiente = respaldo.iter().find(|p| *p != c.carla).unwrap();
    let antes = c.saldo(&siguiente);
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    assert_eq!(c.turno(id, &siguiente), 1);
    assert_eq!(c.saldo(&siguiente), antes - CUOTA + 300 * U);
    // Ronda 3 (última): no hay subasta.
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.ana, &100),
        Err(Ok(Error::SinSubasta))
    );
    c.pagan_todos(id, &gente);
    c.cerrar(id);

    c.al_final(id, &gente);
    assert_eq!(c.saldo(&c.carla), SALDO_INICIAL - 30 * U);
    assert_eq!(c.saldo(&c.ana), SALDO_INICIAL + 15 * U);
    assert_eq!(c.saldo(&c.beto), SALDO_INICIAL + 15 * U);
    c.assert_conservacion();
}

#[test]
fn subasta_errores() {
    let c = setup();
    let otra = c.crear_con(3, 10_000, &opciones(ModoTurnos::Sorteo));
    assert_eq!(
        c.tanda.try_ofertar(&otra, &c.ana, &100),
        Err(Ok(Error::ModoNoPermite))
    );
    let id = c.crear_con(3, 10_000, &subasta(2_000));
    c.tanda.unirse(&id, &c.ana);
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.ana, &100),
        Err(Ok(Error::EstadoInvalido)) // todavía no arranca
    );
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id, &c.beto, &1),
        Err(Ok(Error::ModoNoPermite))
    );
    c.tanda.unirse(&id, &c.beto);
    c.tanda.unirse(&id, &c.carla);
    let extrano = Address::generate(&c.env);
    assert_eq!(
        c.tanda.try_ofertar(&id, &extrano, &100),
        Err(Ok(Error::NoEsMiembro))
    );
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.ana, &0),
        Err(Ok(Error::OfertaInvalida))
    );
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.ana, &2_001),
        Err(Ok(Error::OfertaInvalida))
    );
    c.tanda.ofertar(&id, &c.ana, &2_000);
    // Ya no se puede superar el máximo.
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.beto, &2_000),
        Err(Ok(Error::OfertaInvalida))
    );
    // Después del vencimiento ya no se aceptan ofertas (la subasta cierra con la ronda).
    c.avanzar(PERIODO + 1);
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.beto, &100),
        Err(Ok(Error::SinSubasta))
    );
    let gente = c.personas(3);
    c.tanda.cerrar_ronda(&id); // nadie pagó: las garantías cubren
    assert_eq!(c.turno(id, &c.ana), 0);
    // Quien ya tiene turno no puede volver a ofertar.
    assert_eq!(
        c.tanda.try_ofertar(&id, &c.ana, &100),
        Err(Ok(Error::NoPuedeOfertar))
    );
    let _ = gente;
}

/// Ana deja de pagar, oferta igual y cae en mora al cerrar: su oferta no vale y la bolsa va al
/// orden de respaldo. En la última ronda le toca a ella (en mora): su bolsa se retiene.
#[test]
fn subasta_no_le_da_la_bolsa_a_un_moroso() {
    let c = setup();
    let id = c.crear_con(3, 0, &subasta(3_000)); // cobertura 0: todos dejan una cuota
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let cumplen = [c.beto.clone(), c.carla.clone()];
    // Ronda 1: Beto gana con 5 %. Ana no paga: su garantía (100) la cubre.
    c.tanda.ofertar(&id, &c.beto, &500);
    c.pagan_todos(id, &cumplen);
    c.cerrar(id);
    assert_eq!(c.turno(id, &c.beto), 0);
    assert_eq!(c.miembro(id, &c.ana).colateral, 7_5 * U / 10); // solo su dividendo (7,5)
    assert!(!c.miembro(id, &c.ana).moroso);
    // Ronda 2: Ana oferta 20 % pero no paga. Su dividendo no alcanza: cae en mora y su oferta no vale.
    c.tanda.ofertar(&id, &c.ana, &2_000);
    let carla0 = c.saldo(&c.carla);
    c.pagan_todos(id, &cumplen);
    c.cerrar(id);
    assert!(c.miembro(id, &c.ana).moroso);
    assert_eq!(c.turno(id, &c.carla), 1, "la bolsa no va a la morosa");
    // Bolsa: 200 pagados + 7,5 de la garantía de Ana = 207,5; Carla no tenía nada que apartar.
    assert_eq!(c.saldo(&c.carla), carla0 - CUOTA + 2075 * U / 10);
    // Ronda 3: solo queda Ana (en mora): su bolsa se retiene y se reparte al final.
    c.pagan_todos(id, &cumplen);
    c.cerrar(id);
    assert_eq!(c.turno(id, &c.ana), 2);
    assert_eq!(c.tanda.get_tanda(&id).retenido, 200 * U);
    c.al_final(id, &gente);
    c.assert_conservacion();
}

/// Peor caso: 12 miembros, una oferta en cada ronda: dividendos para 11 personas en cada cierre.
#[test]
fn subasta_12_miembros_presupuesto() {
    let c = setup();
    let id = c.crear_con(12, 10_000, &subasta(5_000));
    let gente = c.personas(12);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let mut peor = 0;
    for r in 0..12u32 {
        if r < 11 {
            // Oferta quien llegó en la posición r (todavía no tiene turno).
            c.tanda.ofertar(&id, &gente[r as usize], &(100 * (r + 1)));
        }
        c.pagan_todos(id, &gente);
        c.cerrar(id);
        peor = peor.max(costo(&c));
        assert_eq!(c.turno(id, &gente[r as usize]), r);
    }
    std::println!("subasta, cerrar_ronda (12): {peor} instrucciones como máximo");
    assert!(peor < 100_000_000);
    c.al_final(id, &gente);
}

// ===========================================================================
// Intercambio
// ===========================================================================

/// 4 personas (garantías 300, 200, 100, 100). Dani (turno 4) le paga 20 a Beto (turno 2) por
/// cambiar de turno. Al cobrar en la ronda 2, a Dani se le aparta lo que le falta (100).
#[test]
fn intercambio_con_compensacion_y_garantia_al_cobrar() {
    let c = setup();
    let id = c.crear_con(4, 10_000, &con_intercambio(opciones(ModoTurnos::Eleccion)));
    let gente = c.personas(4);
    let dani = gente[3].clone();
    for p in &gente {
        c.tanda.unirse(&id, p); // turnos 0, 1, 2, 3 en orden de llegada
    }
    assert_eq!(c.turno(id, &dani), 3);
    let dani0 = c.saldo(&dani);
    c.tanda.proponer_intercambio(&id, &dani, &c.beto, &(20 * U));
    assert_eq!(c.saldo(&dani), dani0 - 20 * U); // queda guardada en el contrato
    assert_eq!(c.tanda.get_estado_turnos(&id).propuestas.len(), 1);
    let beto0 = c.saldo(&c.beto);
    c.tanda.aceptar_intercambio(&id, &c.beto, &dani);
    assert_eq!(c.saldo(&c.beto), beto0 + 20 * U);
    assert_eq!(c.turno(id, &dani), 1);
    assert_eq!(c.turno(id, &c.beto), 3);
    assert_eq!(c.tanda.get_estado_turnos(&id).propuestas.len(), 0);

    c.pagan_todos(id, &gente);
    c.cerrar(id); // ronda 1: Ana
    let dani1 = c.saldo(&dani);
    c.pagan_todos(id, &gente);
    c.cerrar(id); // ronda 2: Dani cobra 400, se le apartan 100 (su garantía pasa de 100 a 200)
    assert_eq!(c.saldo(&dani), dani1 - CUOTA + 300 * U);
    assert_eq!(c.miembro(id, &dani).colateral, 200 * U);
    for _ in 0..2 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
    assert_eq!(c.saldo(&dani), inicial(4) - 20 * U);
    assert_eq!(c.saldo(&c.beto), inicial(4) + 20 * U);
}

/// Compensación negativa: quien acepta paga. Funciona también después de un sorteo.
#[test]
fn intercambio_despues_del_sorteo_y_compensacion_negativa() {
    let c = setup();
    let id = c.crear_con(4, 10_000, &con_intercambio(opciones(ModoTurnos::Sorteo)));
    let gente = c.personas(4);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let t1 = c.duenio(id, &gente, 1);
    let t3 = c.duenio(id, &gente, 3);
    // El del turno 2 (índice 1) quiere esperar: el del turno 4 le paga 15 por adelantarse.
    let (a0, b0) = (c.saldo(&t1), c.saldo(&t3));
    c.tanda.proponer_intercambio(&id, &t1, &t3, &(-15 * U));
    assert_eq!(c.saldo(&t1), a0); // nada guardado: paga quien acepta
    c.tanda.aceptar_intercambio(&id, &t3, &t1);
    assert_eq!(c.saldo(&t1), a0 + 15 * U);
    assert_eq!(c.saldo(&t3), b0 - 15 * U);
    assert_eq!((c.turno(id, &t1), c.turno(id, &t3)), (3, 1));
    for _ in 0..4 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
    assert_eq!(c.saldo(&t1), inicial(4) + 15 * U);
    assert_eq!(c.saldo(&t3), inicial(4) - 15 * U);
}

#[test]
fn intercambio_errores() {
    let c = setup();
    let sin = c.crear_con(3, 10_000, &opciones(ModoTurnos::Eleccion));
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&sin, p);
    }
    assert_eq!(
        c.tanda
            .try_proponer_intercambio(&sin, &c.beto, &c.carla, &0),
        Err(Ok(Error::ModoNoPermite))
    );

    let id = c.crear_con(3, 10_000, &con_intercambio(opciones(ModoTurnos::Llegada)));
    c.tanda.unirse(&id, &c.ana);
    c.tanda.unirse(&id, &c.beto);
    assert_eq!(
        c.tanda.try_proponer_intercambio(&id, &c.ana, &c.beto, &0),
        Err(Ok(Error::EstadoInvalido)) // todavía no arranca
    );
    c.tanda.unirse(&id, &c.carla);
    // Con uno mismo, o con quien cobra esta ronda (Ana, turno 0): no.
    assert_eq!(
        c.tanda.try_proponer_intercambio(&id, &c.beto, &c.beto, &0),
        Err(Ok(Error::IntercambioInvalido))
    );
    assert_eq!(
        c.tanda.try_proponer_intercambio(&id, &c.beto, &c.ana, &0),
        Err(Ok(Error::IntercambioInvalido))
    );
    c.tanda
        .proponer_intercambio(&id, &c.beto, &c.carla, &(5 * U));
    assert_eq!(
        c.tanda.try_proponer_intercambio(&id, &c.beto, &c.carla, &0),
        Err(Ok(Error::PropuestaExistente))
    );
    // Solo `con` acepta, y solo la propuesta que existe.
    assert_eq!(
        c.tanda.try_aceptar_intercambio(&id, &c.ana, &c.beto),
        Err(Ok(Error::SinPropuesta))
    );
    assert_eq!(
        c.tanda.try_cancelar_propuesta(&id, &c.carla, &c.carla),
        Err(Ok(Error::SinPropuesta))
    );
    assert_eq!(
        c.tanda.try_cancelar_propuesta(&id, &c.beto, &c.ana),
        Err(Ok(Error::NoAutorizado))
    );
    // Carla la rechaza: los 5 vuelven a Beto.
    let beto0 = c.saldo(&c.beto);
    c.tanda.cancelar_propuesta(&id, &c.beto, &c.carla);
    assert_eq!(c.saldo(&c.beto), beto0 + 5 * U);
    // Después de que Beto cobra, ya no puede intercambiar.
    for _ in 0..2 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    assert_eq!(
        c.tanda.try_proponer_intercambio(&id, &c.beto, &c.carla, &0),
        Err(Ok(Error::IntercambioInvalido))
    );
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    c.al_final(id, &gente);
}

/// Una propuesta que nadie acepta se retira sola cuando llega uno de los turnos, y lo guardado
/// vuelve a quien propuso: al final no queda dinero atrapado en el contrato.
#[test]
fn propuesta_vencida_se_devuelve_sola() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &con_intercambio(precio(500)));
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p); // turnos 0, 1, 2
    }
    let carla0 = c.saldo(&c.carla);
    c.tanda
        .proponer_intercambio(&id, &c.carla, &c.beto, &(10 * U));
    assert_eq!(c.saldo(&c.carla), carla0 - 10 * U);
    c.pagan_todos(id, &gente);
    c.cerrar(id); // ronda 1: el turno de Beto pasa a ser el actual: la propuesta ya no vale
    assert_eq!(c.saldo(&c.carla), carla0 - CUOTA); // le volvieron los 10
    assert_eq!(c.tanda.get_estado_turnos(&id).propuestas.len(), 0);
    for _ in 0..2 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
}

/// Sin la firma de `de` no se propone; sin la de `con` no se acepta.
#[test]
fn intercambio_pide_las_firmas_correctas() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &con_intercambio(opciones(ModoTurnos::Eleccion)));
    for p in &c.personas(3) {
        c.tanda.unirse(&id, p);
    }
    c.tanda.proponer_intercambio(&id, &c.beto, &c.carla, &0);
    c.env.set_auths(&[]);
    assert!(c
        .tanda
        .try_proponer_intercambio(&id, &c.carla, &c.beto, &0)
        .is_err());
    assert!(c
        .tanda
        .try_aceptar_intercambio(&id, &c.carla, &c.beto)
        .is_err());
    assert!(c.tanda.try_ofertar(&id, &c.beto, &100).is_err());
    assert!(c.tanda.try_unirse_en_turno(&id, &c.beto, &1).is_err());
}

// ===========================================================================
// Subasta con ofertas selladas (comprometer y revelar)
// ===========================================================================

/// El mismo vector que usa la web (`web/src/lib/turnos.test.ts`), calculado aparte con Python:
/// sha256(800 en 4 bytes big-endian ‖ 32 bytes de 7).
#[test]
fn subasta_sellada_vector_de_prueba() {
    let env = Env::default();
    let h = sello(&env, 800, &sal(&env, 7));
    let esperado: [u8; 32] = [
        0xec, 0x61, 0x67, 0xdf, 0x08, 0xb2, 0x66, 0x99, 0x6e, 0x12, 0x47, 0x44, 0x0f, 0x69, 0xa0,
        0x20, 0x76, 0x68, 0x7c, 0xea, 0x91, 0x11, 0x55, 0x30, 0x5c, 0x6f, 0xee, 0xc3, 0xc5, 0xba,
        0x88, 0xd7,
    ];
    assert_eq!(h.to_array(), esperado);
}

/// 4 personas, máximo 30 %. Primera mitad: Beto y Carla sellan 10 %, Dani 5 %; nadie ve montos.
/// Segunda mitad: revelan. Beto y Carla empatan: gana quien va antes en el orden de respaldo.
/// El resto es la subasta de siempre (dividendos, garantía) y el dinero cuadra.
#[test]
fn subasta_sellada_gana_la_mayor_y_el_empate_lo_decide_el_respaldo() {
    let c = setup();
    let id = c.crear_con(4, 10_000, &sellada(3_000));
    let gente = c.personas(4);
    let (ana, beto, carla, dani) = (&gente[0], &gente[1], &gente[2], &gente[3]);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let env = &c.env;
    c.tanda
        .ofertar_sellada(&id, beto, &sello(env, 1_000, &sal(env, 1)));
    c.tanda
        .ofertar_sellada(&id, carla, &sello(env, 1_000, &sal(env, 2)));
    c.tanda
        .ofertar_sellada(&id, dani, &sello(env, 500, &sal(env, 3)));
    let e = c.tanda.get_estado_turnos(&id);
    assert_eq!(e.sellos.len(), 3);
    assert_eq!((e.mejor_postor, e.mejor_oferta_bps), (None, 0));
    // Todavía no se puede revelar.
    assert_eq!(
        c.tanda.try_revelar_oferta(&id, beto, &1_000, &sal(env, 1)),
        Err(Ok(Error::FaseEquivocada))
    );

    c.avanzar(PERIODO / 2);
    // Ya no se puede sellar.
    assert_eq!(
        c.tanda
            .try_ofertar_sellada(&id, ana, &sello(env, 900, &sal(env, 4))),
        Err(Ok(Error::FaseEquivocada))
    );
    // Revelar con otra sal, u otro monto, no coincide con el sello.
    assert_eq!(
        c.tanda.try_revelar_oferta(&id, beto, &1_000, &sal(env, 9)),
        Err(Ok(Error::SelloInvalido))
    );
    assert_eq!(
        c.tanda.try_revelar_oferta(&id, beto, &1_500, &sal(env, 1)),
        Err(Ok(Error::SelloInvalido))
    );
    // Ana no selló nada.
    assert_eq!(
        c.tanda.try_revelar_oferta(&id, ana, &1_000, &sal(env, 1)),
        Err(Ok(Error::SelloInvalido))
    );
    c.tanda.revelar_oferta(&id, dani, &500, &sal(env, 3));
    c.tanda.revelar_oferta(&id, carla, &1_000, &sal(env, 2));
    c.tanda.revelar_oferta(&id, beto, &1_000, &sal(env, 1));
    // Revelada una vez, el sello ya no sirve.
    assert_eq!(
        c.tanda.try_revelar_oferta(&id, beto, &1_000, &sal(env, 1)),
        Err(Ok(Error::SelloInvalido))
    );
    let e = c.tanda.get_estado_turnos(&id);
    assert_eq!(e.sellos.len(), 0);
    let respaldo: SVec<Address> = e.respaldo.iter().collect();
    let pos = |p: &Address| respaldo.iter().position(|x| x == p).unwrap();
    let ganador = if pos(beto) < pos(carla) { beto } else { carla };
    assert_eq!(e.mejor_postor, Some(ganador.clone()));
    assert_eq!(e.mejor_oferta_bps, 1_000);

    // La ronda se cierra como cualquier subasta.
    c.pagan_todos(id, &gente);
    c.avanzar(PERIODO / 2);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.turno(id, ganador), 0);
    c.conservacion(&gente);
    for _ in 1..4 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
}

/// Sellos y nadie revela: la ronda la cobra el primero del orden de respaldo, como sin ofertas.
#[test]
fn subasta_sellada_sin_revelar_cobra_el_respaldo() {
    let c = setup();
    let id = c.crear_con(3, 10_000, &sellada(3_000));
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let env = &c.env;
    for (i, p) in gente.iter().enumerate() {
        c.tanda
            .ofertar_sellada(&id, p, &sello(env, 1_000, &sal(env, i as u8)));
    }
    let primero = c.tanda.get_estado_turnos(&id).respaldo.get(0).unwrap();
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    assert_eq!(c.turno(id, &primero), 0);
    for _ in 1..3 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
}

#[test]
fn subasta_sellada_errores() {
    let c = setup();
    let env = &c.env;
    // Solo en la subasta.
    for modo in [
        ModoTurnos::Llegada,
        ModoTurnos::Eleccion,
        ModoTurnos::Sorteo,
    ] {
        let o = OpcionesTanda {
            ofertas_selladas: true,
            ..opciones(modo)
        };
        assert_eq!(
            c.tanda.try_crear_tanda_avanzada(
                &c.creador,
                &c.token.address,
                &CUOTA,
                &3,
                &PERIODO,
                &1_000,
                &10_000,
                &o
            ),
            Err(Ok(Error::OpcionesInvalidas))
        );
    }
    // 4 personas con garantía mínima (una cuota): quien no paga dos veces cae en mora.
    let id = c.crear_con(4, 0, &sellada(3_000));
    let abierta = c.crear_con(4, 0, &subasta(3_000));
    let gente = c.personas(4);
    let (ana, beto, carla, dani) = (&gente[0], &gente[1], &gente[2], &gente[3]);
    for p in &gente {
        c.tanda.unirse(&id, p);
        c.tanda.unirse(&abierta, p);
    }
    // Cada subasta con su forma de ofertar.
    assert_eq!(
        c.tanda.try_ofertar(&id, ana, &500),
        Err(Ok(Error::ModoNoPermite))
    );
    assert_eq!(
        c.tanda
            .try_ofertar_sellada(&abierta, ana, &sello(env, 500, &sal(env, 1))),
        Err(Ok(Error::ModoNoPermite))
    );

    // Ronda 1. Anticopia: Beto no puede usar el sello de Ana; Ana sí puede cambiar el suyo.
    let de_ana = sello(env, 2_000, &sal(env, 1));
    c.tanda.ofertar_sellada(&id, ana, &de_ana);
    assert_eq!(
        c.tanda.try_ofertar_sellada(&id, beto, &de_ana),
        Err(Ok(Error::SelloRepetido))
    );
    c.tanda
        .ofertar_sellada(&id, ana, &sello(env, 9_000, &sal(env, 1)));
    c.tanda
        .ofertar_sellada(&id, beto, &sello(env, 1_000, &sal(env, 2)));
    c.avanzar(PERIODO / 2);
    // Se puede sellar cualquier número, pero al revelar tiene que estar dentro del máximo.
    assert_eq!(
        c.tanda.try_revelar_oferta(&id, ana, &9_000, &sal(env, 1)),
        Err(Ok(Error::OfertaInvalida))
    );
    c.tanda.revelar_oferta(&id, beto, &1_000, &sal(env, 2));
    // Carla no paga: su garantía la cubre.
    for p in [ana, beto, dani] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.avanzar(PERIODO / 2 + 1);
    // Vencida la ronda, ya no se revela.
    assert_eq!(
        c.tanda.try_revelar_oferta(&id, ana, &9_000, &sal(env, 1)),
        Err(Ok(Error::SinSubasta))
    );
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.turno(id, beto), 0);

    // Ronda 2: gana Ana; Carla vuelve a no pagar y cae en mora.
    c.tanda
        .ofertar_sellada(&id, ana, &sello(env, 500, &sal(env, 3)));
    c.avanzar(PERIODO / 2);
    c.tanda.revelar_oferta(&id, ana, &500, &sal(env, 3));
    for p in [ana, beto, dani] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.avanzar(PERIODO / 2 + 1);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.turno(id, ana), 1);
    assert!(c.miembro(id, carla).moroso);

    // Ronda 3: Carla, en mora, no puede sellar; Dani sí.
    assert_eq!(
        c.tanda
            .try_ofertar_sellada(&id, carla, &sello(env, 500, &sal(env, 4))),
        Err(Ok(Error::NoPuedeOfertar))
    );
    c.tanda
        .ofertar_sellada(&id, dani, &sello(env, 500, &sal(env, 5)));
    c.cerrar(id);
    // Ronda 4, la última: no hay subasta.
    assert_eq!(
        c.tanda
            .try_ofertar_sellada(&id, carla, &sello(env, 500, &sal(env, 6))),
        Err(Ok(Error::SinSubasta))
    );
}

/// Con rondas largas el calendario está anclado (M1): si una ronda se cierra muy tarde, la siguiente
/// ya "empezó" antes. El tiempo para sellar se cuenta desde que de verdad empezó, así no desaparece.
/// (Con rondas de hasta 3 días, como la demo, la ronda siguiente siempre empieza al cerrar.)
#[test]
fn subasta_sellada_cierre_tarde_no_quita_el_tiempo_de_sellar() {
    const DIA: u64 = 86_400;
    const SEMANA: u64 = 7 * DIA;
    let c = setup();
    let id = c.tanda.crear_tanda_avanzada(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &SEMANA,
        &1_000,
        &10_000,
        &sellada(3_000),
    );
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let t0 = c.tanda.get_tanda(&id).inicio_ronda;
    assert_eq!(c.tanda.get_estado_turnos(&id).fin_sellado, t0 + SEMANA / 2);
    c.pagan_todos(id, &gente);
    // Se cierra 5 días tarde. M1 ancla la ronda 2: empieza 1 día después del vencimiento y vence
    // dentro de 3 días. Su mitad "anclada" (4,5 días) ya pasó; la de verdad es dentro de 1,5 días.
    c.avanzar(SEMANA + 5 * DIA);
    c.tanda.cerrar_ronda(&id);
    let t = c.tanda.get_tanda(&id);
    let ahora = t0 + SEMANA + 5 * DIA;
    assert_eq!(t.inicio_ronda, t0 + SEMANA + DIA);
    assert!(t.inicio_ronda + SEMANA / 2 < ahora);
    let fin = c.tanda.get_estado_turnos(&id).fin_sellado;
    assert_eq!(fin, ahora + 3 * DIA / 2);
    // Se puede sellar ahora y revelar después de `fin`.
    let env = &c.env;
    let quien = gente
        .iter()
        .find(|p| c.miembro(id, p).posicion == SIN_TURNO)
        .unwrap()
        .clone();
    c.tanda
        .ofertar_sellada(&id, &quien, &sello(env, 800, &sal(env, 8)));
    c.avanzar(fin - ahora);
    c.tanda.revelar_oferta(&id, &quien, &800, &sal(env, 8));
    c.pagan_todos(id, &gente);
    c.avanzar(3 * DIA);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.turno(id, &quien), 1);
    c.pagan_todos(id, &gente);
    c.avanzar(SEMANA);
    c.tanda.cerrar_ronda(&id);
    c.al_final(id, &gente);
}

// ===========================================================================
// Historial mínimo para los primeros turnos (con el historial de M2)
// ===========================================================================

type Hist = historial::HistorialContractClient<'static>;

/// Conecta a la tanda un historial nuevo (nativo), con la tanda como emisor autorizado.
fn conectar_historial(c: &Ctx) -> Hist {
    let dir = c.env.register(historial::HistorialContract, ());
    let h = historial::HistorialContractClient::new(&c.env, &dir);
    h.inicializar(&Address::generate(&c.env));
    h.autorizar_emisor(&c.tanda_addr);
    c.tanda.configurar_historial(&Some(dir));
    h
}

/// `quien` suma 10 puntos por cuota, como si viniera de otras tandas (10 cuotas = Bronce).
fn dar_puntos(c: &Ctx, h: &Hist, quien: &Address, cuotas: u32) {
    let otra = Address::generate(&c.env);
    h.autorizar_emisor(&otra);
    let mut lote = Vec::new(&c.env);
    for _ in 0..cuotas {
        lote.push_back(historial::HechoMiembro {
            miembro: quien.clone(),
            hecho: historial::Hecho::CuotaATiempo,
            monto: CUOTA,
        });
    }
    h.registrar_lote(&otra, &1_000, &CUOTA, &lote);
}

/// `quien` queda en mora en otra tanda: pierde 100 puntos.
fn quitar_puntos(c: &Ctx, h: &Hist, quien: &Address) {
    let otra = Address::generate(&c.env);
    h.autorizar_emisor(&otra);
    let lote = vec![
        &c.env,
        historial::HechoMiembro {
            miembro: quien.clone(),
            hecho: historial::Hecho::Moroso,
            monto: CUOTA,
        },
    ];
    h.registrar_lote(&otra, &2_000, &CUOTA, &lote);
}

/// Precio por turno, 4 personas, los turnos 1 y 2 piden Bronce (100 puntos). Solo Ana lo tiene.
/// Elegir un turno protegido pide el puntaje; `unirse` sin elegir salta los protegidos; cuando
/// solo quedan protegidos, nadie sin historial entra. La tanda corre completa y el dinero cuadra.
#[test]
fn primeros_turnos_piden_historial() {
    let c = setup();
    let h = conectar_historial(&c);
    let id = c.crear_con(4, 10_000, &primeros(precio(1_000), 2, 100));
    let gente = c.personas(4);
    let (ana, beto, carla, dani) = (&gente[0], &gente[1], &gente[2], &gente[3]);
    dar_puntos(&c, &h, ana, 10);
    assert_eq!(h.puntaje(ana), 100);

    // Beto no tiene historial: los turnos 1 y 2 no son para él; el 4 sí.
    for turno in [0, 1] {
        assert_eq!(
            c.tanda.try_unirse_en_turno(&id, beto, &turno),
            Err(Ok(Error::TurnoExigeHistorial))
        );
    }
    c.tanda.unirse_en_turno(&id, beto, &3);
    c.tanda.unirse_en_turno(&id, ana, &0);
    // Sin elegir, `unirse` da el primer turno libre que no pide historial: el 3.
    assert_eq!(c.tanda.colateral_siguiente(&id), colateral_de(&c, id, 2));
    c.tanda.unirse(&id, carla);
    assert_eq!(c.turno(id, carla), 2);
    // Solo queda el turno 2, que pide historial: Dani no entra (ni eligiéndolo ni sin elegir).
    assert_eq!(
        c.tanda.try_unirse(&id, dani),
        Err(Ok(Error::TurnoExigeHistorial))
    );
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id, dani, &1),
        Err(Ok(Error::TurnoExigeHistorial))
    );
    assert_eq!(
        c.tanda.try_colateral_siguiente(&id),
        Err(Ok(Error::TurnoExigeHistorial))
    );
    // Con historial, entra.
    dar_puntos(&c, &h, dani, 10);
    c.tanda.unirse_en_turno(&id, dani, &1);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Activa);

    // De aquí en adelante, una tanda de precio por turno como cualquier otra.
    for _ in 0..4 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
        c.conservacion(&gente);
    }
    c.al_final(id, &gente);
}

/// Colateral de entrada del turno `posicion` (sin descuentos).
fn colateral_de(c: &Ctx, id: u32, posicion: u32) -> i128 {
    let t = c.tanda.get_tanda(&id);
    let restantes = (t.n_miembros - 1 - posicion) as i128;
    (t.cuota * restantes * t.cobertura_bps as i128 / 10_000).max(t.cuota)
}

/// Elegir + intercambio, 4 personas, los turnos 1 y 2 piden Bronce. Nadie llega por un intercambio
/// a un turno protegido sin el puntaje: se revisa al proponer y otra vez al aceptar.
#[test]
fn intercambio_no_salta_el_historial_minimo() {
    let c = setup();
    let h = conectar_historial(&c);
    let id = c.crear_con(
        4,
        10_000,
        &primeros(con_intercambio(opciones(ModoTurnos::Eleccion)), 2, 100),
    );
    let gente = c.personas(4);
    let (ana, beto, carla, dani) = (&gente[0], &gente[1], &gente[2], &gente[3]);
    dar_puntos(&c, &h, ana, 10);
    dar_puntos(&c, &h, beto, 10);
    for (p, turno) in [(ana, 0), (beto, 1), (carla, 2), (dani, 3)] {
        c.tanda.unirse_en_turno(&id, p, &turno);
    }
    // Ronda 1 en curso. Carla (sin historial) no puede pasar al turno 2 de Beto, ni proponiéndolo
    // ella ni aceptándolo como contraparte de Beto.
    assert_eq!(
        c.tanda.try_proponer_intercambio(&id, carla, beto, &0),
        Err(Ok(Error::TurnoExigeHistorial))
    );
    assert_eq!(
        c.tanda
            .try_proponer_intercambio(&id, beto, carla, &(10 * U)),
        Err(Ok(Error::TurnoExigeHistorial))
    );
    // Entre turnos que no piden historial, como siempre.
    c.tanda.proponer_intercambio(&id, dani, carla, &0);
    c.tanda.aceptar_intercambio(&id, carla, dani);
    assert_eq!((c.turno(id, carla), c.turno(id, dani)), (3, 2));
    // Dani consigue el historial y propone a Beto (con 10 de compensación guardada)...
    dar_puntos(&c, &h, dani, 10);
    c.tanda.proponer_intercambio(&id, dani, beto, &(10 * U));
    // ...pero cae en mora en otra tanda antes de que Beto acepte: ya no le alcanza.
    quitar_puntos(&c, &h, dani);
    assert_eq!(
        c.tanda.try_aceptar_intercambio(&id, beto, dani),
        Err(Ok(Error::TurnoExigeHistorial))
    );
    // Beto la rechaza y Dani recupera su compensación.
    let antes = c.saldo(dani);
    c.tanda.cancelar_propuesta(&id, dani, beto);
    assert_eq!(c.saldo(dani), antes + 10 * U);
    assert_eq!((c.turno(id, beto), c.turno(id, dani)), (1, 2));
    c.conservacion(&gente);
}

/// Las opciones del historial mínimo se validan al crear, y sin historial que responda no se puede
/// comprobar el puntaje: falla cerrado (como el requisito de M2).
#[test]
fn historial_minimo_opciones_y_falla_cerrado() {
    let c = setup();
    let crear = |o: &OpcionesTanda| {
        c.tanda.try_crear_tanda_avanzada(
            &c.creador,
            &c.token.address,
            &CUOTA,
            &3,
            &PERIODO,
            &1_000,
            &10_000,
            o,
        )
    };
    // Sin historial conectado no se puede pedir.
    assert_eq!(
        crear(&primeros(precio(1_000), 1, 100)),
        Err(Ok(Error::HistorialNoConfigurado))
    );
    let h = conectar_historial(&c);
    let malas = [
        primeros(opciones(ModoTurnos::Sorteo), 1, 100),
        primeros(subasta(1_000), 1, 100),
        primeros(opciones(ModoTurnos::Llegada), 1, 100),
        // Al menos un turno tiene que quedar para cualquiera.
        primeros(precio(1_000), 3, 100),
        // Los dos valores van juntos.
        primeros(precio(1_000), 1, 0),
        primeros(precio(1_000), 0, 100),
    ];
    for o in malas {
        assert_eq!(crear(&o), Err(Ok(Error::OpcionesInvalidas)), "{o:?}");
    }
    let id = c.crear_con(3, 10_000, &primeros(opciones(ModoTurnos::Eleccion), 1, 100));
    assert_eq!(c.tanda.get_opciones(&id).puntaje_primeros, 100);
    dar_puntos(&c, &h, &c.ana, 10);
    // El admin desconecta el historial: el turno protegido ya no se puede comprobar.
    c.tanda.configurar_historial(&None);
    assert_eq!(
        c.tanda.try_unirse_en_turno(&id, &c.ana, &0),
        Err(Ok(Error::HistorialNoConfigurado))
    );
    // Los demás turnos siguen abiertos.
    c.tanda.unirse_en_turno(&id, &c.beto, &1);
    assert_eq!(c.turno(id, &c.beto), 1);
}

// ===========================================================================
// Peor caso con los contratos compilados a WASM (costo real de la VM)
// ===========================================================================

/// Peor caso de cada modo con 12 miembros y WASM real. Necesita `stellar contract build` antes, por
/// eso solo corre con `PEOR_CASO_WASM=1`:
/// `stellar contract build && PEOR_CASO_WASM=1 cargo test -p tanda peor_caso_turnos -- --nocapture`
#[test]
fn peor_caso_turnos_12_miembros_en_wasm() {
    if std::env::var("PEOR_CASO_WASM").is_err() {
        std::println!("(omitida: corre `stellar contract build` y luego con PEOR_CASO_WASM=1)");
        return;
    }
    let medir = |c: &Ctx, que: &str, peor: &mut (i64, u32, u32)| {
        let r = c.env.cost_estimate().resources();
        let lecturas = r.disk_read_entries + r.memory_read_entries;
        std::println!(
            "  {que:<44} {:>12} instrucciones · {:>3} lecturas · {:>3} escrituras",
            r.instructions,
            lecturas,
            r.write_entries
        );
        // La simulación no revisa el límite de eventos por transacción: la red rechaza lo que se pase.
        assert!(
            r.contract_events_size_bytes <= 16_384,
            "{que}: {} bytes de eventos",
            r.contract_events_size_bytes
        );
        peor.0 = peor.0.max(r.instructions);
        peor.1 = peor.1.max(lecturas);
        peor.2 = peor.2.max(r.write_entries);
    };
    let mut peor = (0i64, 0u32, 0u32);
    std::println!("Peor caso con 12 miembros (WASM real):");

    // Sorteo: el último `unirse` baraja y reescribe a los 12.
    let c = crate::test_tiempos::setup_wasm(0, 1);
    // El presupuesto del entorno se acumula en toda la prueba; cada llamada se mide sola con
    // `resources()` y el entorno aplica igual los límites de mainnet por invocación.
    c.env.cost_estimate().budget().reset_unlimited();
    let id = c.crear_con(12, 10_000, &opciones(ModoTurnos::Sorteo));
    let gente = c.personas(12);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    medir(&c, "sorteo: último unirse (baraja 12)", &mut peor);
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    medir(&c, "sorteo: cerrar_ronda 1 (aparta 1 000)", &mut peor);

    // Subasta: oferta en cada ronda y dividendos para 11; la mitad no paga (sus garantías cubren).
    let c = crate::test_tiempos::setup_wasm(0, 1);
    // El presupuesto del entorno se acumula en toda la prueba; cada llamada se mide sola con
    // `resources()` y el entorno aplica igual los límites de mainnet por invocación.
    c.env.cost_estimate().budget().reset_unlimited();
    let id = c.crear_con(12, 10_000, &subasta(5_000));
    let gente = c.personas(12);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    medir(&c, "subasta: último unirse (orden de respaldo)", &mut peor);
    c.tanda.ofertar(&id, &gente[0], &1_000);
    medir(&c, "subasta: ofertar", &mut peor);
    c.pagan_todos(id, &gente[..6]);
    c.cerrar(id);
    medir(
        &c,
        "subasta: cerrar_ronda (6 impagos, 11 dividendos)",
        &mut peor,
    );

    // Precio por turno: prima y garantía apartada al cobrar.
    let c = crate::test_tiempos::setup_wasm(0, 1);
    // El presupuesto del entorno se acumula en toda la prueba; cada llamada se mide sola con
    // `resources()` y el entorno aplica igual los límites de mainnet por invocación.
    c.env.cost_estimate().budget().reset_unlimited();
    let id = c.crear_con(12, 10_000, &con_intercambio(precio(2_000)));
    let gente = c.personas(12);
    for (i, p) in gente.iter().enumerate() {
        c.tanda.unirse_en_turno(&id, p, &(11 - i as u32));
    }
    medir(&c, "precio: último unirse_en_turno", &mut peor);
    c.tanda
        .proponer_intercambio(&id, &gente[0], &gente[1], &(10 * U));
    medir(&c, "precio: proponer_intercambio", &mut peor);
    c.tanda.aceptar_intercambio(&id, &gente[1], &gente[0]);
    medir(&c, "precio: aceptar_intercambio", &mut peor);
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    medir(&c, "precio: cerrar_ronda (prima)", &mut peor);

    // Subasta sellada: los 12 sellan (cada sello nuevo se compara con los demás) y revelan la misma
    // oferta (cada revelación desempata leyendo el orden de respaldo).
    let c = crate::test_tiempos::setup_wasm(0, 1);
    c.env.cost_estimate().budget().reset_unlimited();
    let id = c.crear_con(12, 10_000, &sellada(5_000));
    let gente = c.personas(12);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let env = &c.env;
    for (i, p) in gente.iter().enumerate() {
        c.tanda
            .ofertar_sellada(&id, p, &sello(env, 1_000, &sal(env, i as u8)));
    }
    medir(&c, "subasta sellada: sello 12 (compara con 11)", &mut peor);
    c.avanzar(PERIODO / 2);
    for (i, p) in gente.iter().enumerate() {
        c.tanda.revelar_oferta(&id, p, &1_000, &sal(env, i as u8));
    }
    medir(&c, "subasta sellada: revelación 12 (empate)", &mut peor);
    c.pagan_todos(id, &gente);
    c.cerrar(id);
    medir(&c, "subasta sellada: cerrar_ronda", &mut peor);

    // Precio por turno con historial mínimo en 11 de los 12 turnos (M2 en WASM): cada unirse y cada
    // intercambio a un turno protegido le pregunta el puntaje al historial.
    let c = crate::test_tiempos::setup_wasm(0, 1);
    c.env.cost_estimate().budget().reset_unlimited();
    let h = conectar_historial_wasm(&c);
    let id = c.crear_con(
        12,
        10_000,
        &primeros(con_intercambio(precio(2_000)), 11, 100),
    );
    let gente = c.personas(12);
    for p in &gente {
        dar_puntos(&c, &h, p, 10);
    }
    for (i, p) in gente.iter().enumerate() {
        c.tanda.unirse_en_turno(&id, p, &(11 - i as u32));
    }
    medir(
        &c,
        "precio + historial mínimo: último unirse_en_turno",
        &mut peor,
    );
    c.tanda
        .proponer_intercambio(&id, &gente[1], &gente[2], &(10 * U));
    medir(
        &c,
        "precio + historial mínimo: proponer_intercambio",
        &mut peor,
    );
    c.tanda.aceptar_intercambio(&id, &gente[2], &gente[1]);
    medir(
        &c,
        "precio + historial mínimo: aceptar_intercambio",
        &mut peor,
    );

    // Lo más pesado combinado con M1: subasta con garantía mínima donde casi nadie paga (deudas en
    // cada ronda), con una oferta y dividendos en cada cierre. Se mide sin y con el historial de M2
    // conectado (en WASM), que suma sus escrituras a cada cierre.
    for con_historial in [false, true] {
        let c = crate::test_tiempos::setup_wasm(0, 1);
        c.env.cost_estimate().budget().reset_unlimited();
        if con_historial {
            conectar_historial_wasm(&c);
        }
        let que = if con_historial {
            "subasta + M1 + M2: cerrar_ronda casi sin pagos"
        } else {
            "subasta + M1: cerrar_ronda casi sin pagos"
        };
        let id = c.crear_con(12, 0, &subasta(5_000));
        let gente = c.personas(12);
        for p in &gente {
            c.tanda.unirse(&id, p);
        }
        for r in 0..11usize {
            // Oferta quien todavía no tiene turno y está al día (el último de la lista que lo cumpla).
            if let Some(p) = gente.iter().rev().find(|p| {
                let m = c.miembro(id, p);
                m.posicion == SIN_TURNO && !m.moroso
            }) {
                c.tanda.ofertar(&id, p, &(100 * (r as u32 + 1)));
            }
            c.tanda.pagar_cuota(&id, &gente[11]);
            c.cerrar(id);
            medir(&c, que, &mut peor);
        }
        // Última ronda (sin subasta) y el reparto final.
        c.tanda.pagar_cuota(&id, &gente[11]);
        c.cerrar(id);
        c.tanda.finalizar(&id);
        medir(&c, "subasta: finalizar", &mut peor);
    }

    // Con el historial, lo que más escribe es que todos cumplan: cada cierre suma un hecho positivo
    // por persona. Subasta con oferta y dividendos para 11 en cada ronda, y el reparto final.
    let c = crate::test_tiempos::setup_wasm(0, 1);
    c.env.cost_estimate().budget().reset_unlimited();
    conectar_historial_wasm(&c);
    let id = c.crear_con(12, 10_000, &subasta(5_000));
    let gente = c.personas(12);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    for r in 0..12usize {
        if let Some(p) = gente
            .iter()
            .find(|p| c.miembro(id, p).posicion == SIN_TURNO)
            .filter(|_| r < 11)
        {
            c.tanda.ofertar(&id, p, &500);
        }
        c.pagan_todos(id, &gente);
        c.cerrar(id);
        medir(&c, "subasta + M2: cerrar_ronda, todos cumplen", &mut peor);
    }
    c.tanda.finalizar(&id);
    medir(&c, "subasta + M2: finalizar, 12 cumplidos", &mut peor);

    std::println!(
        "  Máximo: {} instrucciones · {} lecturas · {} escrituras",
        peor.0,
        peor.1,
        peor.2
    );
    // Límites de mainnet (más estrictos que testnet): 100 M instrucciones, 100 lecturas, 50 escrituras.
    assert!(peor.0 < 100_000_000 && peor.1 <= 100 && peor.2 <= 50);
}

/// (M2) Conecta el historial compilado a WASM, como en testnet.
fn conectar_historial_wasm(c: &Ctx) -> Hist {
    let ruta = std::format!(
        "{}/../../target/wasm32v1-none/release/historial.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let wasm = std::fs::read(&ruta).unwrap_or_else(|_| panic!("falta {ruta}"));
    let dir = c.env.register(wasm.as_slice(), ());
    let h = historial::HistorialContractClient::new(&c.env, &dir);
    h.inicializar(&Address::generate(&c.env));
    h.autorizar_emisor(&c.tanda_addr);
    c.tanda.configurar_historial(&Some(dir));
    h
}

// ===========================================================================
// Casos borde, incluidos los que cruzan con las deudas de M1
// ===========================================================================

/// 4 personas, garantía mínima. Ronda 1: Ana gana con 6 %. Ronda 2: Beto, Carla y Dani caen en mora;
/// nadie puede cobrar al día, así que el turno es de Beto (en mora) y su bolsa se retiene. Carla salda
/// su deuda (M1) y vuelve a poder ofertar: en la ronda 3 gana, y como todos los demás están en mora,
/// su descuento no tiene a quién ir como dividendo y pasa al retenido que se reparte al final.
#[test]
fn subasta_moroso_que_salda_vuelve_a_ofertar_y_dividendo_sin_receptores() {
    let c = setup();
    let id = c.crear_con(4, 0, &subasta(3_000));
    let gente = c.personas(4);
    let (ana, beto, carla, dani) = (&gente[0], &gente[1], &gente[2], &gente[3]);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    // Ronda 1: Ana oferta 6 % y paga; los demás no (sus garantías cubren).
    c.tanda.ofertar(&id, ana, &600);
    c.tanda.pagar_cuota(&id, ana);
    c.cerrar(id);
    assert_eq!(c.turno(id, ana), 0);
    for p in [beto, carla, dani] {
        assert_eq!(c.miembro(id, p).colateral, 8 * U); // solo su dividendo (24 / 3)
    }
    // Ronda 2: nadie paga. Beto, Carla y Dani caen en mora; el turno es de Beto y se retiene.
    c.cerrar(id);
    for p in [beto, carla, dani] {
        assert!(c.miembro(id, p).moroso);
    }
    assert_eq!(c.turno(id, beto), 1);
    let retenido = c.tanda.get_tanda(&id).retenido;
    assert!(retenido > 0);
    // Carla salda su deuda y vuelve a estar al día.
    let deuda = c.miembro(id, carla).deuda;
    c.tanda.pagar_deuda(&id, carla, carla, &deuda);
    assert!(!c.miembro(id, carla).moroso);
    // Ronda 3: Carla oferta 10 % y paga; Ana deja de pagar y cae en mora. Carla gana y su descuento
    // (10 % de 100) no tiene receptores al día: va al retenido.
    c.tanda.ofertar(&id, carla, &1_000);
    c.tanda.pagar_cuota(&id, carla);
    let antes = c.tanda.get_tanda(&id).retenido;
    c.cerrar(id);
    assert!(c.miembro(id, ana).moroso);
    assert_eq!(c.turno(id, carla), 2);
    assert_eq!(c.tanda.get_tanda(&id).retenido, antes + 10 * U);
    // Ronda 4: solo queda Dani (en mora). Carla, que ya saldó, paga: así hay a quién repartirle lo
    // retenido al final (si todos terminaran en mora, `finalizar` lo deja sin repartir, como siempre).
    c.tanda.pagar_cuota(&id, carla);
    c.cerrar(id);
    assert_eq!(c.turno(id, dani), 3);
    let retenido = c.tanda.get_tanda(&id).retenido;
    let carla_antes = c.saldo(carla);
    c.al_final(id, &gente);
    // Carla es la única al día: recibe todo lo retenido (más su garantía, menos su multa).
    assert!(c.saldo(carla) >= carla_antes + retenido);
}

/// 3 personas, garantía mínima. Beto gana la ronda 1; Ana y Carla caen en mora en la ronda 2 y el
/// turno es de Ana (en mora): su bolsa se retiene. Ana salda (M1) y recupera su bolsa, de la que
/// primero se repone su garantía para la cuota que aún debe. Todo cuadra al final.
#[test]
fn subasta_todos_en_mora_bolsa_retenida_y_recuperada_al_saldar() {
    let c = setup();
    let id = c.crear_con(3, 0, &subasta(3_000));
    let gente = c.personas(3);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    c.tanda.ofertar(&id, &c.beto, &500);
    c.tanda.pagar_cuota(&id, &c.beto);
    c.cerrar(id);
    assert_eq!(c.turno(id, &c.beto), 0);
    // Ronda 2: solo Beto paga. Ana y Carla quedan en mora y nadie puede cobrar al día.
    c.tanda.pagar_cuota(&id, &c.beto);
    c.cerrar(id);
    assert!(c.miembro(id, &c.ana).moroso && c.miembro(id, &c.carla).moroso);
    assert_eq!(
        c.turno(id, &c.ana),
        1,
        "el primero sin turno, aunque esté en mora"
    );
    assert!(!c.miembro(id, &c.ana).cobro);
    let retenido = c.tanda.get_tanda(&id).retenido;
    assert!(retenido > 0);
    // Ana salda y recupera su bolsa retenida (M1).
    let deuda = c.miembro(id, &c.ana).deuda;
    c.tanda.pagar_deuda(&id, &c.ana, &c.ana, &deuda);
    let ma = c.miembro(id, &c.ana);
    assert!(!ma.moroso && ma.cobro);
    assert!(c.tanda.get_tanda(&id).retenido < retenido);
    // Ronda 3: Carla (en mora) es la última sin turno: su bolsa se retiene.
    c.tanda.pagar_cuota(&id, &c.ana);
    c.tanda.pagar_cuota(&id, &c.beto);
    c.cerrar(id);
    assert_eq!(c.turno(id, &c.carla), 2);
    c.al_final(id, &gente);
    c.assert_conservacion();
}

/// 12 personas, prima del 20 %, garantía mínima: desde la ronda 2 solo paga el turno 1, así que las
/// bolsas son más chicas que las primas. La prima se cobra solo hasta lo que hay, las bonificaciones
/// solo hasta lo que hay en el fondo, y todo termina en cero sin dinero atrapado.
#[test]
fn precio_por_turno_primas_mayores_que_la_bolsa() {
    let c = setup();
    // 12 personas × 12 rondas: el presupuesto del entorno de pruebas se acumula en toda la prueba.
    c.env.cost_estimate().budget().reset_unlimited();
    let id = c.crear_con(12, 0, &precio(2_000));
    let gente = c.personas(12);
    for p in &gente {
        c.tanda.unirse(&id, p); // turnos 0..11 en orden de llegada (el libre más bajo)
    }
    for p in &gente {
        assert_eq!(
            c.turno(id, p),
            gente.iter().position(|x| x == p).unwrap() as u32
        );
    }
    for _ in 0..12 {
        c.tanda.pagar_cuota(&id, &gente[0]);
        c.cerrar(id);
        let e = c.tanda.get_estado_turnos(&id);
        assert!(e.fondo_primas >= 0);
    }
    assert_eq!(c.tanda.get_estado_turnos(&id).fondo_primas, 0);
    for p in &gente[1..] {
        assert!(c.miembro(id, p).moroso);
    }
    c.al_final(id, &gente);
    // El único que cumplió termina ganando: se lleva lo retenido de todos los demás.
    assert!(c.saldo(&gente[0]) > inicial(12));
}

/// En el sorteo no se puede proponer un intercambio antes de que se sortee (tanda abierta), y una
/// propuesta se puede retirar aunque la tanda ya haya terminado.
#[test]
fn intercambio_en_sorteo_solo_despues_del_sorteo() {
    let c = setup();
    let id = c.crear_con(4, 10_000, &con_intercambio(opciones(ModoTurnos::Sorteo)));
    let gente = c.personas(4);
    for p in &gente[..3] {
        c.tanda.unirse(&id, p);
    }
    assert_eq!(
        c.tanda
            .try_proponer_intercambio(&id, &gente[1], &gente[2], &0),
        Err(Ok(Error::EstadoInvalido))
    );
    c.tanda.unirse(&id, &gente[3]);
    // Ya hay turnos. Los dueños de los turnos 3 y 4 cambian, con 5 TUSD de por medio.
    let (t2, t3) = (c.duenio(id, &gente, 2), c.duenio(id, &gente, 3));
    c.tanda.proponer_intercambio(&id, &t2, &t3, &(5 * U));
    c.tanda.aceptar_intercambio(&id, &t3, &t2);
    assert_eq!((c.turno(id, &t2), c.turno(id, &t3)), (3, 2));
    for _ in 0..4 {
        c.pagan_todos(id, &gente);
        c.cerrar(id);
    }
    c.al_final(id, &gente);
    assert_eq!(
        c.tanda.try_cancelar_propuesta(&id, &t2, &t2),
        Err(Ok(Error::SinPropuesta))
    );
}
