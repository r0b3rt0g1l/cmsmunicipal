const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const municipioSlug = req.municipio?.slug || 'general';
    const baseUrl = req.baseUrl || '';
    let subfolder;
    if (baseUrl.includes('/documentos')) {
      subfolder = 'transparencia/documentos';
    } else if (baseUrl.includes('/sevac')) {
      subfolder = 'transparencia/sevac';
    } else if (baseUrl.includes('/funcionarios')) {
      subfolder = 'cabildo/funcionarios';
    } else if (baseUrl.includes('/portada-historia')) {
      subfolder = 'apariencia/portada-historia';
    } else if (baseUrl.includes('/noticias')) {
      subfolder = 'noticias';
    } else if (baseUrl.includes('/contenidos')) {
      subfolder = 'apariencia/contenidos';
    } else if (baseUrl.includes('/estadisticas')) {
      subfolder = 'apariencia/estadisticas';
    } else {
      subfolder = req.body?.galeria || 'general';
    }
    // La portada de un documento es SIEMPRE imagen y va a su propia subcarpeta.
    // (Solo afecta a uploads con fieldname 'portada'; el resto queda igual.)
    if (file.fieldname === 'portada') {
      return {
        folder: `cms-municipal/${municipioSlug}/transparencia/documentos/portadas`,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      };
    }
    return {
      folder: `cms-municipal/${municipioSlug}/${subfolder}`,
      resource_type: 'auto',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'],
    };
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

module.exports = { cloudinary, upload };
