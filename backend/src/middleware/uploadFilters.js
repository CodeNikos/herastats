const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]);

function imageFileFilter(req, file, cb) {
  const mimeOk = ALLOWED_IMAGE_MIMES.has(file.mimetype);
  const extOk = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname || '');
  if (mimeOk || extOk) {
    return cb(null, true);
  }
  cb(new Error('Solo se permiten imágenes JPEG, PNG, WebP o GIF'));
}

function excelFileFilter(req, file, cb) {
  const mimeOk = EXCEL_MIMES.has(file.mimetype);
  const extOk = /\.xlsx?$/i.test(file.originalname || '');
  if (mimeOk || extOk) {
    return cb(null, true);
  }
  cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
}

module.exports = {
  imageFileFilter,
  excelFileFilter,
  ALLOWED_IMAGE_MIMES
};
