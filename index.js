// petqr-system - Adaptado para better-sqlite3

const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const db = new Database('./pets.db');

// Configuración
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// Crear tabla si no existe
db.prepare(`CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  foto_url TEXT,
  dueno_tel TEXT,
  dueno_whatsapp TEXT,
  notas TEXT,
  clave TEXT
)`).run();

// Ruta para ver el perfil de una mascota
app.get('/p/:id', (req, res) => {
  try {
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);
    if (!pet) return res.status(404).send('Mascota no encontrada');
    res.render('perfil', { pet });
  } catch {
    res.status(500).send('Error al acceder a la base de datos');
  }
});

// Ruta para registrar nueva mascota (formulario)
app.get('/registrar', (req, res) => {
  res.render('registrar');
});

// Guardar nueva mascota
app.post('/registrar', (req, res) => {
  try {
    const id = uuidv4();
    const { nombre, foto_url, dueno_tel, dueno_whatsapp, notas, clave } = req.body;
    db.prepare(
      'INSERT INTO pets (id, nombre, foto_url, dueno_tel, dueno_whatsapp, notas, clave) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, nombre, foto_url, dueno_tel, dueno_whatsapp, notas, clave);
    res.redirect(`/p/${id}`);
  } catch {
    res.status(500).send('Error al registrar');
  }
});

// Ruta para editar ficha (formulario con clave)
app.get('/editar/:id', (req, res) => {
  res.render('clave', { id: req.params.id });
});

// Verificar clave antes de editar
app.post('/editar/:id/verificar', (req, res) => {
  try {
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);
    if (!pet) return res.status(404).send('Mascota no encontrada');
    if (pet.clave !== req.body.clave) return res.status(403).send('Clave incorrecta');
    res.render('editar', { pet });
  } catch {
    res.status(500).send('Error al verificar clave');
  }
});

// Guardar cambios en la ficha
app.post('/editar/:id', (req, res) => {
  try {
    const { nombre, foto_url, dueno_tel, dueno_whatsapp, notas } = req.body;
    db.prepare(
      'UPDATE pets SET nombre = ?, foto_url = ?, dueno_tel = ?, dueno_whatsapp = ?, notas = ? WHERE id = ?'
    ).run(nombre, foto_url, dueno_tel, dueno_whatsapp, notas, req.params.id);
    res.redirect(`/p/${req.params.id}`);
  } catch {
    res.status(500).send('Error al actualizar');
  }
});

// Inicio
app.get('/', (req, res) => {
  res.send('<h1>🐾 Bienvenido a PetQR</h1><p><a href="/registrar">Registrar mascota</a></p>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
