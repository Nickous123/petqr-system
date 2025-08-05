// petqr-system - Adaptado para better-sqlite3 con historial de escaneos y generación de QR con patita

const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('canvas');

const app = express();
const db = new Database('./pets.db');

// Configuración
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// Crear tablas si no existen
db.prepare(`CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  foto_url TEXT,
  dueno_tel TEXT,
  dueno_whatsapp TEXT,
  notas TEXT,
  clave TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id TEXT,
  fecha TEXT,
  ip TEXT
)`).run();

// Función para generar QR con patita
async function generarQRConPatita(url, outputPath) {
  const size = 300;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Generar QR en canvas
  await QRCode.toCanvas(canvas, url, {
    width: size,
    errorCorrectionLevel: 'H',
  });

  // Dibujar patita simple
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, 20, 20, 0, 0, 2 * Math.PI); // centro
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size / 2 - 22, size / 2 - 22, 8, 8, 0, 0, 2 * Math.PI); // dedo izq
  ctx.ellipse(size / 2 - 7, size / 2 - 30, 8, 8, 0, 0, 2 * Math.PI); // centro izq
  ctx.ellipse(size / 2 + 7, size / 2 - 30, 8, 8, 0, 0, 2 * Math.PI); // centro der
  ctx.ellipse(size / 2 + 22, size / 2 - 22, 8, 8, 0, 0, 2 * Math.PI); // dedo der
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
}

// Ruta para ver el perfil de una mascota
app.get('/p/:id', (req, res) => {
  try {
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);
    if (!pet) return res.status(404).send('Mascota no encontrada');

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const fecha = new Date().toISOString();
    db.prepare('INSERT INTO scans (pet_id, fecha, ip) VALUES (?, ?, ?)').run(req.params.id, fecha, ip);

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

// Panel de administrador
app.get('/admin', (req, res) => {
  const clave = req.query.clave;
  if (clave !== 'admin123') return res.status(403).send('Acceso denegado');

  const mascotas = db.prepare('SELECT * FROM pets').all();
  res.render('admin', { mascotas, clave });
});

// Exportar base de datos a CSV
app.get('/admin/exportar', (req, res) => {
  const clave = req.query.clave;
  if (clave !== 'admin123') return res.status(403).send('Acceso denegado');

  try {
    const pets = db.prepare('SELECT * FROM pets').all();
    let csv = 'ID,Nombre,Teléfono,WhatsApp,Notas\n';
    pets.forEach(pet => {
      csv += `"${pet.id}","${pet.nombre}","${pet.dueno_tel}","${pet.dueno_whatsapp}","${pet.notas.replace(/"/g, '""')}"\n`;
    });
    const fileName = `exportacion_mascotas_${Date.now()}.csv`;
    const filePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(filePath, csv, 'utf8');
    res.download(filePath, fileName, () => fs.unlinkSync(filePath));
  } catch (err) {
    res.status(500).send('Error al exportar los datos');
  }
});

// Ver historial de escaneos
app.get('/admin/historial', (req, res) => {
  const clave = req.query.clave;
  if (clave !== 'admin123') return res.status(403).send('Acceso denegado');

  const registros = db.prepare(`
    SELECT scans.fecha, scans.ip, scans.pet_id, pets.nombre
    FROM scans
    JOIN pets ON pets.id = scans.pet_id
    ORDER BY scans.fecha DESC
  `).all();

  res.render('historial', { registros, clave });
});

// Inicio
app.get('/', (req, res) => {
  res.send(`
    <h1>🐾 Bienvenido a PetQR</h1>
    <p><a href="/registrar">Registrar mascota</a></p>
    <p><a href="/admin?clave=admin123">🔐 Ingresar como administrador</a></p>
  `);
});

app.get('/descargar-qr/:id', async (req, res) => {
  try {
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);
    if (!pet) return res.status(404).send('Mascota no encontrada');

    const outputPath = path.join(os.tmpdir(), `qr-${pet.id}.png`);
    const url = `https://tu-dominio.com/p/${pet.id}`; // Cambiá por tu dominio real

    await generarQRConPatita(url, outputPath);
    res.download(outputPath, `${pet.nombre}_qr.png`, () => fs.unlinkSync(outputPath));
  } catch (err) {
    res.status(500).send('Error al generar el QR');
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
