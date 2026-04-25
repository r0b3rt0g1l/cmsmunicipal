require('dotenv').config();

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const municipio = await prisma.municipio.upsert({
    where: { slug: 'arivechi' },
    update: {},
    create: {
      slug: 'arivechi',
      nombre: 'H. Ayuntamiento de Arivechi',
      estado: 'Sonora',
    },
  });

  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@northa.digital' },
    update: {},
    create: {
      municipioId: municipio.id,
      nombre: 'Administrador',
      email: 'admin@northa.digital',
      passwordHash,
      rol: 'admin',
    },
  });

  const noticias = [
    {
      slug: 'inauguracion-plaza-publica',
      titulo: 'Inauguracion de la nueva plaza publica',
      extracto: 'El H. Ayuntamiento de Arivechi inaugura la remodelacion de la plaza principal.',
      contenido:
        'Este sabado se llevo a cabo la inauguracion oficial de la plaza publica remodelada. La obra incluyo nueva iluminacion, areas verdes y un kiosko restaurado. Autoridades municipales y vecinos se dieron cita en el evento.',
      categoria: 'obras',
    },
    {
      slug: 'programa-apoyo-adultos-mayores',
      titulo: 'Nuevo programa de apoyo para adultos mayores',
      extracto: 'Se lanza el programa municipal de apoyo alimentario y medico para adultos mayores.',
      contenido:
        'El municipio anuncia el inicio del programa de apoyo integral a adultos mayores que incluye despensas mensuales, consultas medicas gratuitas y actividades recreativas. Los interesados pueden registrarse en las oficinas del DIF municipal.',
      categoria: 'social',
    },
    {
      slug: 'jornada-limpieza-rio',
      titulo: 'Jornada de limpieza del rio Arivechi',
      extracto: 'Invitan a la ciudadania a la jornada de limpieza del rio este proximo domingo.',
      contenido:
        'Con el objetivo de preservar el medio ambiente, el ayuntamiento convoca a todos los ciudadanos a participar en la jornada de limpieza del rio Arivechi. La cita es a las 7:00 am en el puente principal. Se proporcionaran guantes y bolsas.',
      categoria: 'medio-ambiente',
    },
  ];

  for (const data of noticias) {
    await prisma.noticia.upsert({
      where: { municipioId_slug: { municipioId: municipio.id, slug: data.slug } },
      update: {},
      create: {
        municipioId: municipio.id,
        autorId: admin.id,
        estado: 'publicado',
        ...data,
      },
    });
  }

  console.log('Seed completado:');
  console.log('  Municipio:', municipio.slug, '-', municipio.nombre);
  console.log('  Usuario admin:', admin.email);
  console.log('  Noticias creadas:', noticias.length);
}

main()
  .catch((err) => {
    console.error('Error en seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
