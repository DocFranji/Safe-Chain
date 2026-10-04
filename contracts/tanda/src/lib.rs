//! # Contrato de Tanda On-Chain (MVP para el hackathon)
//!
//! Un solo contrato maneja muchas tandas, cada una identificada por un número (`id`).
//!
//! Idea central:
//! 1. Al unirse, cada miembro deposita un **colateral escalonado**: quien cobra antes
//!    pone más garantía (porque después de cobrar todavía debe más cuotas).
//! 2. El colateral se guarda en una **bóveda** que genera rendimiento.
//! 3. Cada ronda todos pagan una cuota y el miembro de turno recibe la bolsa.
//! 4. Si alguien no paga, **su colateral cubre su cuota**: el beneficiario cobra completo.
//! 5. Al final, cada uno recupera su colateral sobrante + rendimiento, y las multas se
//!    reparten entre quienes nunca se atrasaron.
//!
//! Convenciones:
//! - Montos en `i128`, en la unidad mínima del token (7 decimales: 100 TUSD = 1_000_000_000).
//! - Porcentajes en puntos básicos (bps): 10_000 = 100%.
//!
//! ## Cómo está organizado (para trabajar en paralelo sin pisarse)
//! - `lib.rs`: límites, interfaz de la bóveda y el flujo principal (crear, unirse, pagar,
//!   cerrar ronda, finalizar, cancelar).
//! - `tipos.rs`: datos guardados (`Tanda`, `Miembro`, `DataKey`) y códigos de `Error`.
//! - `eventos.rs`: avisos que publica el contrato.
//! - `consultas.rs`: funciones de solo lectura (`get_*`).
//! - `turnos.rs`: QUIÉN cobra y CUÁNTO colateral deja cada turno (misión de turnos).
//! - `ganchos.rs`: avisos internos de lo que pasa (misión de historial crediticio).
//! - `almacenamiento.rs`: leer/guardar datos y renovar su vida (TTL) (misión de tiempos).
#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{contract, contractclient, contractimpl, token, Address, Env, Vec};

mod almacenamiento;
mod consultas;
mod eventos;
mod ganchos;
mod tipos;
mod turnos;

// Archivos reservados por misión (ver agentes/PROTOCOLO.md). Empiezan vacíos para que
// agregar código no choque en este archivo.
mod deudas; // M1
mod requisitos; // M2
mod tiempos; // M1
mod turnos_acciones; // M3

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_blend; // M4
#[cfg(test)]
mod test_deudas; // M1
#[cfg(test)]
mod test_historial; // M2
#[cfg(test)]
mod test_tiempos; // M1
#[cfg(test)]
mod test_turnos; // M3

pub use eventos::*;
pub use tipos::*;

use almacenamiento::*;

// ---------------------------------------------------------------------------
// Constantes: límites de los parámetros (sección "Parámetros y estado" de la spec)
// ---------------------------------------------------------------------------

const BPS: i128 = 10_000;
const MIN_MIEMBROS: u32 = 3;
/// Máximo 12 para que los bucles de `cerrar_ronda` y `finalizar` no excedan el
/// presupuesto de cómputo que Stellar permite por transacción.
const MAX_MIEMBROS: u32 = 12;
const MIN_PERIODO_SEG: u64 = 60;
/// (M1) Ronda más larga: 90 días (3 meses). Así una ronda cabe holgada en la vida máxima de un dato
/// en la red (~180 días) y los datos de la tanda se renuevan al menos una vez por ronda.
const MAX_PERIODO_SEG: u64 = 90 * 86_400;
const MAX_PENALIDAD_BPS: u32 = 5_000;
const MAX_COBERTURA_BPS: u32 = 10_000;

// ---------------------------------------------------------------------------
// Interfaz de la bóveda. La tanda solo conoce estas 4 funciones, así que la bóveda
// simulada y un futuro adaptador a Blend son intercambiables.
// ---------------------------------------------------------------------------

#[contractclient(name = "BovedaClient")]
pub trait Boveda {
    fn depositar(env: Env, desde: Address, monto: i128) -> i128;
    fn retirar(env: Env, hacia: Address, shares: i128) -> i128;
    fn retirar_monto(env: Env, hacia: Address, monto: i128) -> i128;
    fn valor(env: Env, shares: i128) -> i128;
}

// ---------------------------------------------------------------------------
// El contrato
// ---------------------------------------------------------------------------

#[contract]
pub struct TandaContract;

#[contractimpl]
impl TandaContract {
    /// Configura el contrato una sola vez: quién es el admin, qué bóveda usar y,
    /// opcionalmente, quién puede marcar direcciones como verificadas (gancho SUGEF).
    pub fn inicializar(
        env: Env,
        admin: Address,
        boveda: Address,
        verificador: Option<Address>,
    ) -> Result<(), Error> {
        let s = env.storage().instance();
        if s.has(&DataKey::Admin) {
            return Err(Error::YaInicializado);
        }
        admin.require_auth();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Boveda, &boveda);
        if let Some(v) = verificador {
            s.set(&DataKey::Verificador, &v);
        }
        s.set(&DataKey::Contador, &0u32);
        extender_instancia(&env);
        Ok(())
    }

    /// (P2) El verificador marca una dirección como verificada (KYC hecho fuera de la cadena).
    pub fn marcar_verificado(env: Env, miembro: Address, verificado: bool) -> Result<(), Error> {
        let v: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verificador)
            .ok_or(Error::NoAutorizado)?;
        v.require_auth();
        let clave = DataKey::Verificado(miembro);
        env.storage().persistent().set(&clave, &verificado);
        extender(&env, &clave);
        Ok(())
    }

    /// Crea una tanda nueva en estado `Abierta` y devuelve su id.
    /// El creador NO queda como miembro: si quiere participar, llama `unirse`.
    pub fn crear_tanda(
        env: Env,
        creador: Address,
        token: Address,
        cuota: i128,
        n_miembros: u32,
        periodo_seg: u64,
        penalidad_bps: u32,
        cobertura_bps: u32,
    ) -> Result<u32, Error> {
        creador.require_auth();
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NoInicializado);
        }
        if cuota <= 0
            || !(MIN_MIEMBROS..=MAX_MIEMBROS).contains(&n_miembros)
            || !(MIN_PERIODO_SEG..=MAX_PERIODO_SEG).contains(&periodo_seg)
            || penalidad_bps > MAX_PENALIDAD_BPS
            || cobertura_bps > MAX_COBERTURA_BPS
        {
            return Err(Error::ParametroInvalido);
        }

        let s = env.storage().instance();
        let id: u32 = s.get::<_, u32>(&DataKey::Contador).unwrap_or(0) + 1;
        s.set(&DataKey::Contador, &id);
        extender_instancia(&env);

        let tanda = Tanda {
            creador: creador.clone(),
            token,
            cuota,
            n_miembros,
            periodo_seg,
            penalidad_bps,
            cobertura_bps,
            estado: Estado::Abierta,
            ronda_actual: 0,
            inicio_ronda: 0,
            shares_boveda: 0,
            fondo_premios: 0,
            retenido: 0,
        };
        fijar_boveda(&env, id, &tanda)?; // M1: cada tanda guarda su bóveda al crearse
        guardar_tanda(&env, id, &tanda);
        guardar_miembros(&env, id, &Vec::new(&env));

        EvCreada {
            id,
            creador,
            cuota,
            n_miembros,
        }
        .publish(&env);
        Ok(id)
    }

    /// Unirse a una tanda abierta: paga el colateral, que va directo a la bóveda.
    /// El orden de llegada define el turno (salvo que la tanda use otro modo de turnos,
    /// ver `turnos.rs`). Cuando entra el último, la tanda arranca.
    pub fn unirse(env: Env, id: u32, miembro: Address) -> Result<(), Error> {
        Self::unirse_en(env, id, miembro, None)
    }

    /// (M3) Cuerpo compartido por `unirse` y `unirse_en_turno` (`turnos_acciones.rs`): `turno` es
    /// el turno que eligió quien se une, si la tanda lo permite. No se exporta (no es `pub`).
    pub(crate) fn unirse_en(
        env: Env,
        id: u32,
        miembro: Address,
        turno: Option<u32>,
    ) -> Result<(), Error> {
        miembro.require_auth();
        let mut t = cargar_tanda(&env, id)?;
        match t.estado {
            Estado::Abierta => {}
            Estado::Cancelada => return Err(Error::EstadoInvalido),
            _ => return Err(Error::TandaLlena),
        }
        // (P2) Si hay verificador configurado, solo entran direcciones verificadas.
        if env.storage().instance().has(&DataKey::Verificador) {
            let ok: bool = env
                .storage()
                .persistent()
                .get(&DataKey::Verificado(miembro.clone()))
                .unwrap_or(false);
            if !ok {
                return Err(Error::NoVerificado);
            }
        }
        let clave_m = DataKey::Miembro(id, miembro.clone());
        if env.storage().persistent().has(&clave_m) {
            return Err(Error::YaEsMiembro);
        }

        ganchos::puede_unirse(&env, &t, id, &miembro)?;

        let mut miembros = cargar_miembros(&env, id);
        let posicion = turnos::posicion_al_unirse(&env, &t, id, &miembros, turno)?;
        let colateral = ganchos::ajustar_colateral(
            &env,
            &t,
            id,
            &miembro,
            turnos::colateral_al_unirse(&t, posicion),
        );

        // 1) El miembro le pasa el colateral al contrato.
        let yo = env.current_contract_address();
        let tok = token::Client::new(&env, &t.token);
        tok.transfer(&miembro, &yo, &colateral);

        // 2) El contrato le da permiso a la bóveda por ese monto y deposita.
        let boveda = boveda_de(&env, id, &t)?;
        tok.approve(&yo, &boveda, &colateral, &(env.ledger().sequence() + 100));
        let shares = BovedaClient::new(&env, &boveda).depositar(&yo, &colateral);
        t.shares_boveda += shares;

        let m = Miembro {
            posicion,
            colateral_inicial: colateral,
            colateral,
            atrasos: 0,
            multas_pendientes: 0,
            deuda: 0,
            moroso: false,
            cobro: false,
        };
        guardar_miembro(&env, id, &miembro, &m);
        miembros.push_back(miembro.clone());
        guardar_miembros(&env, id, &miembros);
        turnos::al_unirse(&env, &t, id, &miembro, posicion);
        ganchos::al_unirse(&env, &t, id, &miembro, posicion, colateral);
        EvUnido {
            id,
            miembro,
            posicion,
            colateral,
        }
        .publish(&env);

        // 3) ¿Se llenó? Entonces arranca la ronda 0.
        if miembros.len() == t.n_miembros {
            t.estado = Estado::Activa;
            t.ronda_actual = 0;
            t.inicio_ronda = env.ledger().timestamp();
            turnos::al_llenarse(&env, &t, id, &miembros)?;
            EvIniciada {
                id,
                inicio_ronda: t.inicio_ronda,
            }
            .publish(&env);
        }
        guardar_tanda(&env, id, &t);
        Ok(())
    }

    /// Paga la cuota de la ronda ACTUAL. Si ya venció el plazo, cuenta como pago tarde:
    /// suma un atraso y una multa pendiente (que se cobra del colateral al final).
    pub fn pagar_cuota(env: Env, id: u32, miembro: Address) -> Result<(), Error> {
        miembro.require_auth();
        let t = cargar_tanda(&env, id)?;
        if t.estado != Estado::Activa {
            return Err(Error::EstadoInvalido);
        }
        let mut m = cargar_miembro(&env, id, &miembro)?;
        if m.moroso {
            return Err(Error::MiembroMoroso);
        }
        let clave_pago = DataKey::Pagado(id, t.ronda_actual, miembro.clone());
        if env.storage().persistent().has(&clave_pago) {
            return Err(Error::YaPago);
        }

        token::Client::new(&env, &t.token).transfer(
            &miembro,
            env.current_contract_address(),
            &t.cuota,
        );

        let tarde = env.ledger().timestamp() > t.inicio_ronda + t.periodo_seg;
        if tarde {
            m.atrasos += 1;
            m.multas_pendientes += multa(&t);
            guardar_miembro(&env, id, &miembro, &m);
        }
        env.storage().persistent().set(&clave_pago, &true);
        // M1: el pago vive hasta que se cierre la ronda. `pagar_cuota` solo toca lo de quien paga (la
        // tanda y su registro se renuevan con el piso al leerse); todo lo demás lo renueva
        // `cerrar_ronda` (vía `guardar_tanda`), que pasa al menos una vez por ronda.
        renovar(&env, &clave_pago, vida_ronda(&env, &t));
        ganchos::al_pagar(&env, &t, id, &miembro, t.ronda_actual, tarde);

        EvPago {
            id,
            miembro,
            ronda: t.ronda_actual,
            tarde,
        }
        .publish(&env);
        Ok(())
    }

    /// Cierra la ronda vencida. CUALQUIERA puede llamarla (así nadie bloquea la tanda).
    /// - Quien no pagó: su colateral cubre la cuota. Si no alcanza, queda moroso.
    /// - El beneficiario de turno recibe la bolsa (o se retiene si es moroso).
    pub fn cerrar_ronda(env: Env, id: u32) -> Result<(), Error> {
        let mut t = cargar_tanda(&env, id)?;
        if t.estado != Estado::Activa {
            return Err(Error::EstadoInvalido);
        }
        let ahora = env.ledger().timestamp();
        if ahora < t.inicio_ronda + t.periodo_seg {
            return Err(Error::RondaNoVencida);
        }

        let yo = env.current_contract_address();
        let boveda = BovedaClient::new(&env, &boveda_de(&env, id, &t)?);
        let miembros = cargar_miembros(&env, id);
        let ronda = t.ronda_actual;
        let mut bolsa: i128 = 0;
        // M1: lo que cada moroso no alcanzó a cubrir esta ronda (se le debe a quien cobra).
        let mut faltantes: Vec<(Address, i128)> = Vec::new(&env);

        for dir in miembros.iter() {
            if env
                .storage()
                .persistent()
                .has(&DataKey::Pagado(id, ronda, dir.clone()))
            {
                bolsa += t.cuota;
                continue;
            }
            // No pagó: el colateral responde.
            let mut m = cargar_miembro(&env, id, &dir)?;
            m.atrasos += 1;
            let cubierto = if m.colateral >= t.cuota {
                // Regla 1: alcanza. Se cubre la cuota y se anota la multa (se cobra al final).
                m.multas_pendientes += multa(&t);
                t.cuota
            } else {
                // Regla 2: no alcanza. Entra lo que queda y el miembro queda moroso.
                m.deuda += t.cuota - m.colateral;
                faltantes.push_back((dir.clone(), t.cuota - m.colateral)); // M1
                if !m.moroso {
                    m.moroso = true;
                    ganchos::al_quedar_moroso(&env, &t, id, &dir, m.deuda);
                    EvMoroso {
                        id,
                        miembro: dir.clone(),
                        deuda: m.deuda,
                    }
                    .publish(&env);
                }
                m.colateral
            };
            if cubierto > 0 {
                m.colateral -= cubierto;
                // Nunca gasta participaciones de otra tanda: si la bóveda vale menos de lo anotado,
                // entra lo que de verdad salió (M4/M1, ver `sacar_de_boveda`).
                bolsa += sacar_de_boveda(&env, &boveda, &mut t, cubierto);
                ganchos::al_cubrir(&env, &t, id, &dir, ronda, cubierto);
                EvCubierto {
                    id,
                    miembro: dir.clone(),
                    ronda,
                    monto: cubierto,
                }
                .publish(&env);
            }
            guardar_miembro(&env, id, &dir, &m);
        }

        // Regla 3: paga al beneficiario de turno (o retiene si es moroso).
        // (M3) `resolver_ronda` decide quién cobra y aplica la prima o el descuento del modo de
        // turnos; `completar_garantia` aparta de la bolsa la garantía que le falte a su turno.
        let (beneficiario, bolsa) =
            turnos::resolver_ronda(&env, &mut t, id, &miembros, ronda, bolsa)?;
        let mut mb = cargar_miembro(&env, id, &beneficiario)?;
        let monto_pagado = if mb.moroso {
            t.retenido += bolsa;
            0
        } else {
            let apartado =
                turnos::completar_garantia(&env, &mut t, id, &beneficiario, &mut mb, bolsa)?;
            let neto = bolsa - apartado;
            if neto > 0 {
                token::Client::new(&env, &t.token).transfer(&yo, &beneficiario, &neto);
            }
            mb.cobro = true;
            guardar_miembro(&env, id, &beneficiario, &mb);
            ganchos::al_cobrar(&env, &t, id, &beneficiario, ronda, neto);
            neto
        };
        // M1: anota a quién le debe cada moroso (y la bolsa retenida) para `pagar_deuda`.
        deudas::anotar_ronda(
            &env,
            &t,
            id,
            ronda,
            &beneficiario,
            &faltantes,
            // (M3) Solo la bolsa retenida por mora: con turnos, `monto_pagado` es el efectivo y no
            // incluye la garantía que se apartó de la bolsa, que tampoco está retenida.
            if mb.moroso { bolsa } else { 0 },
        );
        EvRonda {
            id,
            ronda,
            beneficiario,
            monto_pagado,
        }
        .publish(&env);

        // M1: calendario anclado. La siguiente ronda vence un periodo después de la anterior, aunque
        // el cierre llegue tarde; si llegó tardísimo, igual deja al menos min(periodo, 3 días) para
        // pagar, así nadie queda "tarde" por culpa de un cierre atrasado (ver `tiempos.rs`).
        t.ronda_actual += 1;
        t.inicio_ronda = tiempos::inicio_siguiente(&t, ahora);
        if t.ronda_actual == t.n_miembros {
            t.estado = Estado::PorLiquidar;
        }
        guardar_tanda(&env, id, &t);
        ganchos::al_fin_operacion(&env, &t, id); // M2: envía los hechos de esta ronda al historial
        Ok(())
    }

    /// Reparte todo al terminar las rondas. CUALQUIERA puede llamarla.
    /// Orden: retirar de la bóveda → cobrar multas → devolver colateral + rendimiento
    /// → repartir multas y retenido entre los cumplidos.
    pub fn finalizar(env: Env, id: u32) -> Result<(), Error> {
        let mut t = cargar_tanda(&env, id)?;
        if t.estado != Estado::PorLiquidar {
            return Err(Error::EstadoInvalido);
        }
        let yo = env.current_contract_address();
        let miembros = cargar_miembros(&env, id);
        let n = miembros.len();

        // 1) Retirar todo de la bóveda.
        let total = if t.shares_boveda > 0 {
            BovedaClient::new(&env, &boveda_de(&env, id, &t)?).retirar(&yo, &t.shares_boveda)
        } else {
            0
        };
        t.shares_boveda = 0;

        // Cargamos a todos los miembros en memoria para trabajar más simple.
        let mut datos: Vec<Miembro> = Vec::new(&env);
        let mut suma_colateral: i128 = 0;
        for dir in miembros.iter() {
            let m = cargar_miembro(&env, id, &dir)?;
            suma_colateral += m.colateral;
            datos.push_back(m);
        }
        // 2) Rendimiento = lo que devolvió la bóveda - el colateral que había.
        //    (Puede ser negativo si la bóveda perdió; se reparte igual, en proporción.)
        let rendimiento = total - suma_colateral;

        // 3) Cobrar multas del colateral sobrante.
        for i in 0..n {
            let mut m = datos.get(i).unwrap();
            let cobrar = m.multas_pendientes.min(m.colateral);
            m.colateral -= cobrar;
            m.multas_pendientes -= cobrar;
            t.fondo_premios += cobrar;
            datos.set(i, m);
        }

        // 4) Colateral + rendimiento, en proporción al colateral (ya sin multas).
        let mut pagos: Vec<i128> = Vec::new(&env);
        let mut suma_col2: i128 = 0;
        for i in 0..n {
            pagos.push_back(0);
            let m = datos.get(i).unwrap();
            if !m.moroso {
                suma_col2 += m.colateral;
            }
        }
        if suma_col2 > 0 {
            let mut repartido: i128 = 0;
            let mut ultimo: Option<u32> = None;
            for i in 0..n {
                let m = datos.get(i).unwrap();
                if !m.moroso && m.colateral > 0 {
                    let parte = rendimiento * m.colateral / suma_col2;
                    pagos.set(i, m.colateral + parte);
                    repartido += parte;
                    ultimo = Some(i);
                }
            }
            // El resto del redondeo va al último receptor: el saldo termina en 0 exacto.
            if let Some(u) = ultimo {
                pagos.set(u, pagos.get(u).unwrap() + (rendimiento - repartido));
            }
        } else {
            // Nadie tiene colateral: el rendimiento se suma al fondo de premios.
            t.fondo_premios += rendimiento;
        }

        // 5) Multas + retenido, en partes iguales entre quienes nunca se atrasaron.
        //    Si no hay ninguno, entre los no morosos. Si tampoco, queda sin repartir.
        let pozo = t.fondo_premios + t.retenido;
        let mut sin_repartir: i128 = 0;
        if pozo > 0 {
            let mut elegibles: Vec<u32> = Vec::new(&env);
            for i in 0..n {
                let m = datos.get(i).unwrap();
                if !m.moroso && m.atrasos == 0 {
                    elegibles.push_back(i);
                }
            }
            if elegibles.is_empty() {
                for i in 0..n {
                    if !datos.get(i).unwrap().moroso {
                        elegibles.push_back(i);
                    }
                }
            }
            let k = elegibles.len() as i128;
            if k == 0 {
                sin_repartir = pozo;
            } else {
                let parte = pozo / k;
                let resto = pozo - parte * k;
                for (j, i) in elegibles.iter().enumerate() {
                    let extra = if j as i128 == k - 1 { resto } else { 0 };
                    pagos.set(i, pagos.get(i).unwrap() + parte + extra);
                }
            }
        }

        // 6) Transferir y dejar registro.
        let tok = token::Client::new(&env, &t.token);
        for i in 0..n {
            let dir = miembros.get(i).unwrap();
            let monto = pagos.get(i).unwrap();
            if monto > 0 {
                tok.transfer(&yo, &dir, &monto);
            }
            let mut m = datos.get(i).unwrap();
            ganchos::al_terminar(&env, &t, id, &dir, &m, monto);
            m.colateral = 0;
            guardar_miembro(&env, id, &dir, &m);
            EvLiquidado {
                id,
                miembro: dir,
                monto,
            }
            .publish(&env);
        }

        t.estado = Estado::Finalizada;
        guardar_tanda(&env, id, &t);
        EvFinalizada {
            id,
            rendimiento,
            fondo_premios: t.fondo_premios,
            retenido: t.retenido,
            sin_repartir,
        }
        .publish(&env);
        ganchos::al_fin_operacion(&env, &t, id); // M2: envía los hechos finales al historial
        Ok(())
    }

    /// Solo el creador, y solo mientras la tanda está `Abierta` (no se llenó):
    /// devuelve a cada uno su colateral más su parte del rendimiento.
    pub fn cancelar(env: Env, id: u32) -> Result<(), Error> {
        let mut t = cargar_tanda(&env, id)?;
        t.creador.require_auth();
        if t.estado != Estado::Abierta {
            return Err(Error::EstadoInvalido);
        }
        let yo = env.current_contract_address();
        let miembros = cargar_miembros(&env, id);
        let total = if t.shares_boveda > 0 {
            BovedaClient::new(&env, &boveda_de(&env, id, &t)?).retirar(&yo, &t.shares_boveda)
        } else {
            0
        };
        t.shares_boveda = 0;

        let mut suma: i128 = 0;
        for dir in miembros.iter() {
            suma += cargar_miembro(&env, id, &dir)?.colateral;
        }
        let tok = token::Client::new(&env, &t.token);
        let mut repartido: i128 = 0;
        let n = miembros.len();
        for i in 0..n {
            let dir = miembros.get(i).unwrap();
            let mut m = cargar_miembro(&env, id, &dir)?;
            let monto = if i == n - 1 {
                total - repartido // el último se lleva el resto del redondeo
            } else {
                total * m.colateral / suma
            };
            repartido += monto;
            if monto > 0 {
                tok.transfer(&yo, &dir, &monto);
            }
            m.colateral = 0;
            guardar_miembro(&env, id, &dir, &m);
        }
        t.estado = Estado::Cancelada;
        guardar_tanda(&env, id, &t);
        EvCancelada { id }.publish(&env);
        Ok(())
    }
}

fn multa(t: &Tanda) -> i128 {
    t.cuota * t.penalidad_bps as i128 / BPS
}
