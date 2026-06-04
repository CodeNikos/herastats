const cloudinary = require('cloudinary').v2;
const { ALLOWED_IMAGE_MIMES } = require('../middleware/uploadFilters');

// Configurar Cloudinary
const configureCloudinary = () => {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    console.error('Error: Variables de entorno de Cloudinary no configuradas');
    return false;
  }

  cloudinary.config({
    cloud_name: cloud_name,
    api_key: api_key,
    api_secret: api_secret,
  });

  return true;
};

// Verificar configuración al cargar el módulo
const isConfigured = configureCloudinary();

const normalizeCloudinaryPrefix = () =>
  (process.env.CLOUDINARY_UPLOAD_PREFIX || '').replace(/^\/+|\/+$/g, '');

const resolveUploadFolder = (folderKey) => {
  const prefix = normalizeCloudinaryPrefix();
  const folders = {
    tournaments: 'herastats/tournaments',
    teams: 'herastats/teams'
  };
  const sub = folders[folderKey] || folders.tournaments;
  return prefix ? `${prefix}/${sub}` : sub;
};

/** Prefijo permitido para borrar en Cloudinary (debe coincidir con resolveUploadFolder). */
const cloudinaryProjectPrefixForDelete = () => {
  const prefix = normalizeCloudinaryPrefix();
  return prefix ? `${prefix}/herastats/` : 'herastats/';
};

/**
 * Subir imagen a Cloudinary
 * POST /api/config/upload-image
 */
const uploadImage = async (req, res) => {
  try {
    // Verificar configuración de Cloudinary
    if (!isConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Error: Cloudinary no está configurado correctamente. Verifica las variables de entorno.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    console.log('Archivo recibido:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    if (!ALLOWED_IMAGE_MIMES.has(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Formato no permitido. Usa JPEG, PNG, WebP o GIF.'
      });
    }

    // Validar tamaño (máximo 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'La imagen no debe superar los 5MB'
      });
    }

    // Método alternativo: subir directamente desde el buffer usando data URI
    // Esto es más confiable que usar streams
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    
    console.log('Subiendo imagen a Cloudinary...');
    
    const targetFolder = resolveUploadFolder(req.body?.folder);

    // Subir a Cloudinary usando upload
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: targetFolder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
    });
    
    console.log('Imagen subida exitosamente a Cloudinary:', uploadResult.secure_url);

    res.json({
      success: true,
      message: 'Imagen subida exitosamente',
      data: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height,
      }
    });

  } catch (error) {
    console.error('Error al subir imagen:', error);
    console.error('Stack:', error.stack);
    
    // Mensajes de error más específicos
    const errorMessage =
      process.env.NODE_ENV === 'production'
        ? 'Error al subir la imagen'
        : error.message || 'Error al subir la imagen';

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV !== 'production' ? {
        message: error.message,
        stack: error.stack,
        http_code: error.http_code
      } : undefined
    });
  }
};

/**
 * Obtiene public_id de una URL típica de Cloudinary (incl. segmento de versión y transformaciones).
 */
const publicIdFromCloudinaryUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let path = url.slice(idx + marker.length);
  const parts = path.split('/').filter(Boolean);
  let i = 0;
  if (parts[i] && /^v\d+$/.test(parts[i])) i += 1;
  while (i < parts.length && parts[i].includes(',')) i += 1;
  if (i >= parts.length) return null;
  const rest = parts.slice(i).join('/');
  const withoutExt = rest.replace(/\.[^/.]+$/, '');
  return withoutExt || null;
};

/**
 * Elimina imagen en Cloudinary si la URL pertenece a este proyecto (herastats/teams o herastats/tournaments).
 * No lanza: solo registra errores (el borrado en BD no debe depender de Cloudinary).
 */
const deleteCloudinaryImageByUrl = async (url) => {
  if (!url || !isConfigured) return;
  const publicId = publicIdFromCloudinaryUrl(url);
  if (!publicId) return;
  const allowedRoot = cloudinaryProjectPrefixForDelete();
  if (!publicId.startsWith(allowedRoot)) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (error) {
    console.error('No se pudo eliminar imagen en Cloudinary:', publicId, error.message || error);
  }
};

module.exports = {
  uploadImage,
  deleteCloudinaryImageByUrl
};

