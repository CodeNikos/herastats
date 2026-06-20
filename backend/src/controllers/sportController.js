const Sport = require('../models/Sport');

const listSports = async (_req, res) => {
  try {
    const sports = await Sport.findAll();
    return res.json({
      success: true,
      data: { sports }
    });
  } catch (error) {
    console.error('Error en listSports:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener deportes'
    });
  }
};

const createSport = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const briefDescription = String(req.body?.brief_description || '').trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del deporte es obligatorio'
      });
    }

    if (name.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'El nombre no puede superar 255 caracteres'
      });
    }

    if (briefDescription.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'La descripción breve no puede superar 500 caracteres'
      });
    }

    const existing = await Sport.findByName(name);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un deporte con ese nombre'
      });
    }

    const sport = await Sport.create({
      name,
      brief_description: briefDescription || null
    });

    return res.status(201).json({
      success: true,
      message: 'Deporte creado correctamente',
      data: { sport }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un deporte con ese nombre'
      });
    }
    console.error('Error en createSport:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear el deporte'
    });
  }
};

module.exports = {
  listSports,
  createSport
};
