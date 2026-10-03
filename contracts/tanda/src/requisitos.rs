//! Reservado para la misión **M2**: configuración del historial y requisitos por tanda (`configurar_historial`, `configurar_requisitos`, consultas con descuento).
//!
//! Empieza vacío a propósito: el módulo ya está declarado en `lib.rs`, así ninguna misión
//! choca con otra al agregar archivos. Agrega aquí tu bloque:
//!
//! ```ignore
//! use soroban_sdk::{contractimpl, Address, Env};
//! use crate::{Error, TandaContract, TandaContractArgs, TandaContractClient};
//!
//! #[contractimpl]
//! impl TandaContract {
//!     pub fn mi_funcion(env: Env, ...) -> Result<..., Error> { ... }
//! }
//! ```
//!
//! Instrucciones: `.claude/agents/m2-historial.md` y `agentes/PROTOCOLO.md`.
