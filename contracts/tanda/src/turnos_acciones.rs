//! Acciones de turnos (misión **M3**): crear con opciones, unirse eligiendo turno, ofertar en la
//! subasta, intercambiar turnos y las consultas que usa la web. La lógica vive en `turnos.rs`.
//! Diseño y decisiones: `docs/turnos.md`.
use soroban_sdk::{contractimpl, token, Address, Bytes, BytesN, Env};

use crate::almacenamiento::*;
use crate::requisitos;
use crate::turnos::{self, colateral_al_unirse, colateral_para, prima_de_turno};
use crate::{
    ganchos, Error, Estado, EstadoTurnos, EvIntercambio, EvOferta, EvOpciones, EvPropuesta,
    EvPropuestaRetirada, EvSello, Miembro, ModoTurnos, Oferta, OpcionesTanda, Propuesta, Tanda,
    TandaContract, TandaContractArgs, TandaContractClient, BPS, SIN_TURNO,
};

#[contractimpl]
impl TandaContract {
    /// Igual que `crear_tanda` (mismas reglas y validaciones), pero el creador elige cómo se
    /// reparten los turnos: llegada, elección, precio por turno, sorteo o subasta, y si se
    /// pueden intercambiar.
    pub fn crear_tanda_avanzada(
        env: Env,
        creador: Address,
        token: Address,
        cuota: i128,
        n_miembros: u32,
        periodo_seg: u64,
        penalidad_bps: u32,
        cobertura_bps: u32,
        opciones: OpcionesTanda,
    ) -> Result<u32, Error> {
        turnos::validar_opciones(&opciones, n_miembros)?;
        // Los primeros turnos con historial necesitan el historial de M2 conectado.
        if opciones.primeros_con_historial > 0 && requisitos::direccion_historial(&env).is_none() {
            return Err(Error::HistorialNoConfigurado);
        }
        // Mismo código que `crear_tanda` (pide la firma del creador y valida los parámetros).
        let id = Self::crear_tanda(
            env.clone(),
            creador,
            token,
            cuota,
            n_miembros,
            periodo_seg,
            penalidad_bps,
            cobertura_bps,
        )?;
        let t = cargar_tanda(&env, id)?;
        turnos::guardar_opciones(&env, &t, id, &opciones);
        EvOpciones {
            id,
            modo: opciones.modo,
            permitir_intercambio: opciones.permitir_intercambio,
            prima_max_bps: opciones.prima_max_bps,
            descuento_max_bps: opciones.descuento_max_bps,
            primeros_con_historial: opciones.primeros_con_historial,
            puntaje_primeros: opciones.puntaje_primeros,
            ofertas_selladas: opciones.ofertas_selladas,
        }
        .publish(&env);
        Ok(id)
    }

    /// Unirse eligiendo un turno libre (modos `Eleccion` y `PrecioPorTurno`). Mismo camino que
    /// `unirse`: verificación, ganchos del historial, colateral a la bóveda y arranque al llenarse.
    /// Si es de los primeros turnos que piden historial, se revisa el puntaje de quien se une.
    pub fn unirse_en_turno(
        env: Env,
        id: u32,
        miembro: Address,
        posicion: u32,
    ) -> Result<(), Error> {
        let t = cargar_tanda(&env, id)?;
        if let Some(o) = turnos::opciones(&env, &t, id) {
            turnos::revisar_historial_turno(&env, &o, &miembro, posicion)?;
        }
        Self::unirse_en(env, id, miembro, Some(posicion))
    }

    /// Subasta: ofrecer recibir `descuento_bps` menos de la bolsa para cobrar en la ronda en
    /// curso. Debe superar la mejor oferta y se acepta solo hasta que vence la ronda.
    pub fn ofertar(env: Env, id: u32, miembro: Address, descuento_bps: u32) -> Result<(), Error> {
        miembro.require_auth();
        let (t, o, _) = subasta_abierta_para(&env, id, &miembro, false)?;
        let mejor = turnos::oferta_vigente(&env, &t, id, t.ronda_actual)
            .map(|of| of.descuento_bps)
            .unwrap_or(0);
        if descuento_bps <= mejor || descuento_bps > o.descuento_max_bps {
            return Err(Error::OfertaInvalida);
        }
        let oferta = Oferta {
            ronda: t.ronda_actual,
            miembro: miembro.clone(),
            descuento_bps,
        };
        turnos::guardar_oferta(&env, &t, id, &oferta);
        EvOferta {
            id,
            ronda: t.ronda_actual,
            miembro,
            descuento_bps,
            descuento: t.cuota * t.n_miembros as i128 * descuento_bps as i128 / BPS,
        }
        .publish(&env);
        Ok(())
    }

    /// Subasta sellada, primera mitad de la ronda: `miembro` sella su oferta. `sello` =
    /// sha256(descuento_bps en 4 bytes big-endian ‖ sal de 32 bytes). Se puede cambiar mientras dure
    /// esta mitad. Un sello no se puede repetir en la ronda: nadie copia el de otro.
    pub fn ofertar_sellada(
        env: Env,
        id: u32,
        miembro: Address,
        sello: BytesN<32>,
    ) -> Result<(), Error> {
        miembro.require_auth();
        let (t, _, _) = subasta_abierta_para(&env, id, &miembro, true)?;
        if env.ledger().timestamp() >= turnos::mitad_de_ronda(&env, &t, id) {
            return Err(Error::FaseEquivocada);
        }
        let mut sellos = turnos::sellos_vigentes(&env, &t, id);
        if sellos
            .iter()
            .any(|(quien, s)| s == sello && quien != miembro)
        {
            return Err(Error::SelloRepetido);
        }
        sellos.set(miembro.clone(), sello);
        turnos::guardar_sellos(&env, &t, id, sellos);
        EvSello {
            id,
            ronda: t.ronda_actual,
            miembro,
        }
        .publish(&env);
        Ok(())
    }

    /// Subasta sellada, segunda mitad de la ronda (hasta que vence): `miembro` revela la oferta que
    /// selló. Gana el mayor descuento; en empate, quien va antes en el orden de respaldo.
    pub fn revelar_oferta(
        env: Env,
        id: u32,
        miembro: Address,
        descuento_bps: u32,
        sal: BytesN<32>,
    ) -> Result<(), Error> {
        miembro.require_auth();
        let (t, o, _) = subasta_abierta_para(&env, id, &miembro, true)?;
        if env.ledger().timestamp() < turnos::mitad_de_ronda(&env, &t, id) {
            return Err(Error::FaseEquivocada);
        }
        let mut sellos = turnos::sellos_vigentes(&env, &t, id);
        let sello = sellos.get(miembro.clone()).ok_or(Error::SelloInvalido)?;
        let mut datos = Bytes::from_array(&env, &descuento_bps.to_be_bytes());
        datos.append(&sal.into());
        if env.crypto().sha256(&datos).to_bytes() != sello {
            return Err(Error::SelloInvalido);
        }
        if descuento_bps == 0 || descuento_bps > o.descuento_max_bps {
            return Err(Error::OfertaInvalida);
        }
        // Revelada: el sello ya no sirve para otra vez.
        sellos.remove(miembro.clone());
        turnos::guardar_sellos(&env, &t, id, sellos);
        let gana = match turnos::oferta_vigente(&env, &t, id, t.ronda_actual) {
            None => true,
            Some(mejor) => {
                descuento_bps > mejor.descuento_bps
                    || (descuento_bps == mejor.descuento_bps
                        && antes_en_respaldo(
                            &turnos::respaldo(&env, &t, id),
                            &miembro,
                            &mejor.miembro,
                        ))
            }
        };
        if gana {
            let oferta = Oferta {
                ronda: t.ronda_actual,
                miembro: miembro.clone(),
                descuento_bps,
            };
            turnos::guardar_oferta(&env, &t, id, &oferta);
        }
        EvOferta {
            id,
            ronda: t.ronda_actual,
            miembro,
            descuento_bps,
            descuento: t.cuota * t.n_miembros as i128 * descuento_bps as i128 / BPS,
        }
        .publish(&env);
        Ok(())
    }

    /// `de` propone cambiar su turno por el de `con`. Si `compensacion` > 0, `de` la deja ahora en
    /// el contrato y `con` la recibe al aceptar; si es < 0, `con` le paga a `de` al aceptar.
    pub fn proponer_intercambio(
        env: Env,
        id: u32,
        de: Address,
        con: Address,
        compensacion: i128,
    ) -> Result<(), Error> {
        de.require_auth();
        let t = cargar_tanda(&env, id)?;
        let o = turnos::opciones(&env, &t, id)
            .filter(|o| o.permitir_intercambio)
            .ok_or(Error::ModoNoPermite)?;
        if t.estado != Estado::Activa {
            return Err(Error::EstadoInvalido);
        }
        let a = cargar_miembro(&env, id, &de)?;
        let b = cargar_miembro(&env, id, &con)?;
        if de == con
            || !turnos::intercambiable(&a, t.ronda_actual)
            || !turnos::intercambiable(&b, t.ronda_actual)
        {
            return Err(Error::IntercambioInvalido);
        }
        // Nadie llega por un intercambio a un turno que pide más historial del que tiene.
        turnos::revisar_historial_turno(&env, &o, &de, b.posicion)?;
        turnos::revisar_historial_turno(&env, &o, &con, a.posicion)?;
        let mut props = turnos::propuestas(&env, &t, id);
        if props.iter().any(|p| p.de == de) {
            return Err(Error::PropuestaExistente);
        }
        if compensacion > 0 {
            token::Client::new(&env, &t.token).transfer(
                &de,
                env.current_contract_address(),
                &compensacion,
            );
        }
        props.push_back(Propuesta {
            de: de.clone(),
            con: con.clone(),
            compensacion,
        });
        turnos::guardar_propuestas(&env, &t, id, &props);
        EvPropuesta {
            id,
            de,
            con,
            compensacion,
        }
        .publish(&env);
        Ok(())
    }

    /// `con` acepta la propuesta de `de`: cambian de turno y se mueve la compensación.
    /// La garantía no se mueve: quien adelanta su turno la completa al cobrar.
    pub fn aceptar_intercambio(env: Env, id: u32, con: Address, de: Address) -> Result<(), Error> {
        con.require_auth();
        let t = cargar_tanda(&env, id)?;
        if t.estado != Estado::Activa {
            return Err(Error::EstadoInvalido);
        }
        let mut props = turnos::propuestas(&env, &t, id);
        let i = props
            .iter()
            .position(|p| p.de == de && p.con == con)
            .ok_or(Error::SinPropuesta)? as u32;
        let p = props.get(i).unwrap();
        let mut a = cargar_miembro(&env, id, &de)?;
        let mut b = cargar_miembro(&env, id, &con)?;
        if !turnos::intercambiable(&a, t.ronda_actual)
            || !turnos::intercambiable(&b, t.ronda_actual)
        {
            return Err(Error::IntercambioInvalido);
        }
        // Se revisa otra vez al aceptar: el puntaje pudo cambiar desde la propuesta.
        if let Some(o) = turnos::opciones(&env, &t, id) {
            turnos::revisar_historial_turno(&env, &o, &de, b.posicion)?;
            turnos::revisar_historial_turno(&env, &o, &con, a.posicion)?;
        }

        let tok = token::Client::new(&env, &t.token);
        let yo = env.current_contract_address();
        if p.compensacion > 0 {
            tok.transfer(&yo, &con, &p.compensacion);
        } else if p.compensacion < 0 {
            tok.transfer(&con, &de, &(-p.compensacion));
        }

        core::mem::swap(&mut a.posicion, &mut b.posicion);
        guardar_miembro(&env, id, &de, &a);
        guardar_miembro(&env, id, &con, &b);
        let mut mapa = turnos::turnos_de(&env, &t, id);
        mapa.set(a.posicion, de.clone());
        mapa.set(b.posicion, con.clone());
        turnos::guardar_turnos(&env, &t, id, &mapa);
        props.remove(i);
        turnos::guardar_propuestas(&env, &t, id, &props);

        EvIntercambio {
            id,
            de,
            con,
            turno_de: a.posicion,
            turno_con: b.posicion,
            compensacion: p.compensacion,
        }
        .publish(&env);
        Ok(())
    }

    /// Retira la propuesta de `de`. La puede retirar `de` (se arrepintió) o `con` (la rechaza).
    /// Lo que `de` dejó guardado vuelve a `de`. Funciona en cualquier estado de la tanda.
    pub fn cancelar_propuesta(env: Env, id: u32, de: Address, quien: Address) -> Result<(), Error> {
        quien.require_auth();
        let t = cargar_tanda(&env, id)?;
        let mut props = turnos::propuestas(&env, &t, id);
        let i = props
            .iter()
            .position(|p| p.de == de)
            .ok_or(Error::SinPropuesta)? as u32;
        let p = props.get(i).unwrap();
        if quien != p.de && quien != p.con {
            return Err(Error::NoAutorizado);
        }
        turnos::devolver_compensacion(&env, &t, &p);
        props.remove(i);
        turnos::guardar_propuestas(&env, &t, id, &props);
        EvPropuestaRetirada {
            id,
            de: p.de,
            con: p.con,
        }
        .publish(&env);
        Ok(())
    }

    // Consultas (no cambian nada, no cuestan firma): las usa la web.
    // ---------------------------------------------------------------------

    /// Opciones de turnos de la tanda (`Llegada` sin intercambio si se creó con `crear_tanda`).
    pub fn get_opciones(env: Env, id: u32) -> Result<OpcionesTanda, Error> {
        let t = cargar_tanda(&env, id)?;
        Ok(turnos::opciones(&env, &t, id).unwrap_or(turnos::opciones_por_defecto()))
    }

    /// Todo lo de turnos en una sola lectura: opciones, mejor oferta, orden de respaldo,
    /// intercambios pendientes y fondo de primas.
    pub fn get_estado_turnos(env: Env, id: u32) -> Result<EstadoTurnos, Error> {
        let t = cargar_tanda(&env, id)?;
        let oferta = turnos::oferta_vigente(&env, &t, id, t.ronda_actual);
        let o = turnos::opciones(&env, &t, id).unwrap_or(turnos::opciones_por_defecto());
        Ok(EstadoTurnos {
            opciones: o.clone(),
            mejor_oferta_bps: oferta.as_ref().map(|o| o.descuento_bps).unwrap_or(0),
            mejor_postor: oferta.map(|o| o.miembro),
            respaldo: turnos::respaldo(&env, &t, id),
            propuestas: turnos::propuestas(&env, &t, id),
            fondo_primas: turnos::fondo_primas(&env, &t, id),
            sellos: turnos::sellos_vigentes(&env, &t, id).keys(),
            fin_sellado: if o.ofertas_selladas && t.estado == Estado::Activa {
                turnos::mitad_de_ronda(&env, &t, id)
            } else {
                0
            },
        })
    }

    /// (garantía que dejaría `miembro` al unirse en el turno `posicion`, prima de ese turno).
    /// La garantía ya trae el descuento por historial (M2). Prima > 0: se descuenta de su bolsa;
    /// < 0: se le suma. En sorteo y subasta el turno no se elige: devuelve lo que se deja al unirse.
    pub fn cotizar_turno(
        env: Env,
        id: u32,
        miembro: Address,
        posicion: u32,
    ) -> Result<(i128, i128), Error> {
        let t = cargar_tanda(&env, id)?;
        if posicion >= t.n_miembros {
            return Err(Error::TurnoInvalido);
        }
        let o = turnos::opciones(&env, &t, id).unwrap_or(turnos::opciones_por_defecto());
        let base = match o.modo {
            ModoTurnos::Sorteo | ModoTurnos::Subasta => colateral_al_unirse(&t, SIN_TURNO),
            _ => colateral_para(&t, posicion),
        };
        let colateral = ganchos::ajustar_colateral(&env, &t, id, &miembro, base);
        let prima = if o.modo == ModoTurnos::PrecioPorTurno {
            prima_de_turno(&t, o.prima_max_bps, posicion)
        } else {
            0
        };
        Ok((colateral, prima))
    }
}

/// Lo que comparten `ofertar`, `ofertar_sellada` y `revelar_oferta`: la tanda es una subasta del tipo
/// pedido (abierta o sellada), está en curso, la ronda no es la última ni venció, y `miembro` puede
/// ofertar (todavía sin turno y al día).
fn subasta_abierta_para(
    env: &Env,
    id: u32,
    miembro: &Address,
    sellada: bool,
) -> Result<(Tanda, OpcionesTanda, Miembro), Error> {
    let t = cargar_tanda(env, id)?;
    let o = turnos::opciones(env, &t, id)
        .filter(|o| o.modo == ModoTurnos::Subasta && o.ofertas_selladas == sellada)
        .ok_or(Error::ModoNoPermite)?;
    if t.estado != Estado::Activa {
        return Err(Error::EstadoInvalido);
    }
    // En la última ronda solo queda una persona sin turno: no hay nada que subastar.
    if t.ronda_actual + 1 >= t.n_miembros
        || env.ledger().timestamp() > t.inicio_ronda + t.periodo_seg
    {
        return Err(Error::SinSubasta);
    }
    let m = cargar_miembro(env, id, miembro)?;
    if m.posicion != SIN_TURNO || m.moroso {
        return Err(Error::NoPuedeOfertar);
    }
    Ok((t, o, m))
}

/// En el orden de respaldo, ¿`a` va antes que `b`? (Desempata ofertas selladas iguales.)
fn antes_en_respaldo(respaldo: &soroban_sdk::Vec<Address>, a: &Address, b: &Address) -> bool {
    match (respaldo.first_index_of(a), respaldo.first_index_of(b)) {
        (Some(i), Some(j)) => i < j,
        (Some(_), None) => true,
        _ => false,
    }
}
