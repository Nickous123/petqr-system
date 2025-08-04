// petqr-system - Sistema QR para mascotas con edición, escaneos y etiquetas PDF

const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const QRCode = require('qrcode');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();
const db = new sqlite3.Database('./pets.db');

app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// Crear tablas si no existen
db.run(`CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  foto_url TEXT,
  dueno_tel TEXT,
  dueno_whatsapp TEXT,
  notas TEXT,
  clave TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS escaneos (
  id TEXT PRIMARY KEY,
  pet_id TEXT,
  timestamp INTEGER,
  ip TEXT,
  user_agent TEXT
)`);

// Página pública de la mascota + registrar escaneo
app.get('/p/:id', (req, res) => {
  const id = req.params.id;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const timestamp = Date.now();

  db.get('SELECT * FROM pets WHERE id = ?', [id], (err, pet) => {
    if (err || !pet) return res.status(404).send('Mascota no encontrada');
    db.run('INSERT INTO escaneos (id, pet_id, timestamp, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), id, timestamp, ip, userAgent]);
    res.render('perfil', { pet });
  });
});

// Registrar mascota
app.get('/registrar', (req, res) => res.render('registrar'));

app.post('/registrar', (req, res) => {
  const id = uuidv4();
  const { nombre, foto_url, dueno_tel, dueno_whatsapp, notas, clave } = req.body;
  db.run(`INSERT INTO pets (id, nombre, foto_url, dueno_tel, dueno_whatsapp, notas, clave)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, nombre, foto_url, dueno_tel, dueno_whatsapp, notas, clave],
    err => {
      if (err) return res.status(500).send('Error al registrar mascota');
      res.redirect(`/p/${id}`);
    });
});

// Editar ficha (verificar clave)
app.get('/editar/:id', (req, res) => {
  res.render('clave', { id: req.params.id });
});

app.post('/editar/:id/verificar', (req, res) => {
  const { id } = req.params;
  const clave = req.body.clave;
  db.get('SELECT * FROM pets WHERE id = ?', [id], (err, pet) => {
    if (err || !pet) return res.status(404).send('Mascota no encontrada');
    if (pet.clave !== clave) return res.status(403).send('Clave incorrecta');
    res.render('editar', { pet });
  });
});

app.post('/editar/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, foto_url, dueno_tel, dueno_whatsapp, notas } = req.body;
  db.run(`UPDATE pets SET nombre = ?, foto_url = ?, dueno_tel = ?, dueno_whatsapp = ?, notas = ?
          WHERE id = ?`,
    [nombre, foto_url, dueno_tel, dueno_whatsapp, notas, id],
    err => {
      if (err) return res.status(500).send('Error al actualizar');
      res.redirect(`/p/${id}`);
    });
});

// Panel de administración
app.get('/admin', (req, res) => {
  const clave = req.query.clave;
  if (clave !== 'admin123') return res.status(403).send('Clave incorrecta');
  db.all('SELECT * FROM pets', (err, mascotas) => {
    if (err) return res.status(500).send('Error cargando mascotas');
    res.render('panel', { mascotas, clave });
  });
});

// Eliminar mascota
app.post('/admin/eliminar/:id', (req, res) => {
  const { id } = req.params;
  const clave = req.body.clave;
  if (clave !== 'admin123') return res.status(403).send('Clave incorrecta');
  db.run('DELETE FROM pets WHERE id = ?', [id], err => {
    if (err) return res.status(500).send('Error al eliminar');
    res.redirect(`/admin?clave=${clave}`);
  });
});

// Historial de escaneos
app.get('/admin/escanes/:id', (req, res) => {
  const { id } = req.params;
  const clave = req.query.clave;
  if (clave !== 'admin123') return res.status(403).send('Clave incorrecta');
  db.all('SELECT * FROM escaneos WHERE pet_id = ? ORDER BY timestamp DESC', [id], (err, logs) => {
    if (err) return res.status(500).send('Error al obtener escaneos');
    res.render('escanes', { logs, id });
  });
});

// Generar etiquetas QR
app.get('/admin/etiquetas', async (req, res) => {
  const clave = req.query.clave;
  if (clave !== 'admin123') return res.status(403).send('Clave incorrecta');
  db.all('SELECT * FROM pets', async (err, pets) => {
    if (err) return res.status(500).send('Error al obtener mascotas');

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const pet of pets) {
      const page = pdfDoc.addPage([200, 200]);
      const qrData = `http://localhost:3000/p/${pet.id}`;
      const qrImage = await QRCode.toDataURL(qrData);
      const pngImage = await pdfDoc.embedPng(Buffer.from(qrImage.split(',')[1], 'base64'));
      const scale = pngImage.scale(0.5);

      const pngDims = pngImage.scale(0.5);
page.drawImage(pngImage, {
  x: (200 - pngDims.width) / 2,
  y: (200 - pngDims.height) / 2,
  width: pngDims.width,
  height: pngDims.height,
});


      const text = `${pet.nombre}`;
const textWidth = font.widthOfTextAtSize(text, 14);
page.drawText(text, {
  x: (200 - textWidth) / 2, // centrado horizontalmente
  y: 160, // cerca del borde superior del círculo
  size: 14,
  font,
  color: rgb(0, 0, 0),
});


      page.drawCircle({
  x: 100,
  y: 100,
  size: 95,
  borderWidth: 1,
  borderColor: rgb(0.8, 0.8, 0.8),
  color: undefined  // Asegura que no haya relleno
});

    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Disposition', 'attachment; filename="etiquetas.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfBytes));
  });
});

// Inicio
app.get('/', (req, res) => {
  res.send('<h1>🐾 Bienvenido a PetQR</h1><p><a href="/registrar">Registrar mascota</a></p>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
