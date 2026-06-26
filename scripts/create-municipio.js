#!/usr/bin/env node
/**
 * create-municipio.js — Onboarding BACKEND de un municipio nuevo en un solo comando.
 *
 * Crea el registro del Municipio + su Usuario admin (contraseña hasheada con bcrypt),
 * de forma ATÓMICA (transacción: o ambos o ninguno). Usa Prisma directo (como
 * prisma/seed.js): NO necesita token ni el backend corriendo. Lee la conexión de
 * DATABASE_URL del .env (no requiere DIRECT_URL: eso es solo para migraciones).
 *
 * Uso (flags --clave=valor o --clave valor; con fallback a variables de entorno):
 *
 *   node scripts/create-municipio.js \
 *     --slug=ejemplo --nombre="H. Ayuntamiento de Ejemplo" \
 *     --email=admin@ejemplo.gob.mx --password='SECRETO' \
 *     [--estado=Sonora] [--adminNombre="Administrador"] \
 *     [--escudoUrl=https://...] [--dominio=ejemplo.gob.mx]
 *
 *   # equivalente por entorno:
 *   MUNI_SLUG=ejemplo MUNI_NOMBRE="..." MUNI_EMAIL=... MUNI_PASSWORD=... \
 *     node scripts/create-municipio.js
 *
 * Requeridos: nombre, email, password. (slug: si falta, se deriva del nombre.)
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { slugify } = require('../src/utils/slugify');

const prisma = new PrismaClient();

const USAGE = `
create-municipio.js — crea un municipio + su usuario admin.

Uso:
  node scripts/create-municipio.js --nombre "H. Ayuntamiento de X" --email admin@x.gob.mx --password 'SECRETO' [opciones]

Requeridos:
  --nombre        Nombre oficial del municipio        (o env MUNI_NOMBRE)
  --email         Email del usuario admin             (MUNI_EMAIL)
  --password      Contraseña del usuario admin        (MUNI_PASSWORD)

Opcionales:
  --slug          Slug del municipio (default: derivado del nombre)   (MUNI_SLUG)
  --estado        Estado (default: "Sonora")                          (MUNI_ESTADO)
  --adminNombre   Nombre del usuario admin (default: "Administrador")  (MUNI_ADMIN_NOMBRE)
  --escudoUrl     URL del escudo                                       (MUNI_ESCUDO_URL)
  --dominio       Dominio del portal                                   (MUNI_DOMINIO)
`;

// Parser de argumentos: soporta "--clave=valor" y "--clave valor".
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const body = tok.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[body] = next;
        i++;
      } else {
        out[body] = true; // flag sin valor
      }
    }
  }
  return out;
}

// Aborta imprimiendo un mensaje (y desconecta si ya había conexión abierta).
async function fail(msg, withUsage = false) {
  console.error(`\n✗ ${msg}`);
  if (withUsage) console.error(USAGE);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const val = (v) => (typeof v === 'string' ? v.trim() : '');
  const nombre = val(args.nombre) || val(process.env.MUNI_NOMBRE);
  const email = val(args.email) || val(process.env.MUNI_EMAIL);
  const password = val(args.password) || val(process.env.MUNI_PASSWORD);
  const estado = val(args.estado) || val(process.env.MUNI_ESTADO) || 'Sonora';
  const adminNombre =
    val(args.adminNombre) || val(process.env.MUNI_ADMIN_NOMBRE) || 'Administrador';
  const escudoUrl = val(args.escudoUrl) || val(process.env.MUNI_ESCUDO_URL) || null;
  const dominio = val(args.dominio) || val(process.env.MUNI_DOMINIO) || null;
  const slugInput = val(args.slug) || val(process.env.MUNI_SLUG);

  // Requeridos → imprime uso y sale SIN tocar la DB (no se hizo ninguna query aún).
  const faltan = [];
  if (!nombre) faltan.push('--nombre');
  if (!email) faltan.push('--email');
  if (!password) faltan.push('--password');
  if (faltan.length) {
    await fail(`Faltan parámetros requeridos: ${faltan.join(', ')}`, true);
  }

  const slug = slugify(slugInput || nombre);
  if (!slug) {
    await fail('No se pudo generar un slug válido a partir de --slug/--nombre.');
  }

  // Pre-checks de duplicados (errores amigables antes de crear nada).
  const muniExistente = await prisma.municipio.findUnique({ where: { slug } });
  if (muniExistente) {
    await fail(`Ya existe un municipio con slug '${slug}' (id: ${muniExistente.id}).`);
  }
  const userExistente = await prisma.usuario.findUnique({ where: { email } });
  if (userExistente) {
    await fail(`Ya existe un usuario con email '${email}'.`);
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  // Creación ATÓMICA: municipio + usuario admin (o ninguno si algo falla).
  const { municipio, usuario } = await prisma.$transaction(async (tx) => {
    const m = await tx.municipio.create({
      data: { slug, nombre, estado, escudoUrl, dominio },
    });
    const u = await tx.usuario.create({
      data: {
        municipioId: m.id,
        nombre: adminNombre,
        email,
        passwordHash,
        rol: 'admin',
      },
      select: { id: true, email: true, rol: true },
    });
    return { municipio: m, usuario: u };
  });

  // Resumen (para copiar al portal). NO se imprime la contraseña.
  console.log('\n✅ Municipio creado correctamente:\n');
  console.log(`   municipioId : ${municipio.id}`);
  console.log(`   slug        : ${municipio.slug}`);
  console.log(`   nombre      : ${municipio.nombre}`);
  console.log(`   estado      : ${municipio.estado}`);
  console.log(`   admin email : ${usuario.email}  (rol: ${usuario.rol})`);
  console.log('\n   Siguiente — configurar el PORTAL (repo clonado de plantilla-municipal):');
  console.log(`     • NEXT_PUBLIC_MUNICIPIO_SLUG=${municipio.slug}`);
  console.log('     • NEXT_PUBLIC_API_URL=<URL del backend>');
  console.log('     • lib/municipalConfig.js (identidad, paleta, contacto, redes…)');
  console.log('     • Crear el proyecto en Vercel.\n');
}

main()
  .catch((err) => {
    if (err && err.code === 'P2002') {
      const campo = (err.meta && err.meta.target) || 'campo único';
      console.error(`\n✗ Conflicto de unicidad (${campo}): el slug o el email ya existen.`);
    } else {
      console.error('\n✗ Error al crear el municipio:', (err && err.message) || err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
