

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000; // Changed to 3000

// --- DIRECTORY SETUP ---
let dataDir = path.join(__dirname, 'data');
try {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  fs.accessSync(dataDir, fs.constants.W_OK);
} catch (e) {
  console.warn('Cannot write to ' + dataDir + ', falling back to /tmp/data');
  dataDir = '/tmp/data';
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
}

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// --- LOGGING SYSTEM ---
const LOG_FILE = path.join(dataDir, 'system.log');
const MAX_LOG_SIZE = 1 * 1024 * 1024;

const logSystem = (level, message, details = null) => {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}\n`;
    if (details) {
        try {
            const safeDetails = JSON.parse(JSON.stringify(details, (k, v) => {
                if (typeof v === 'string' && v.length > 500 && v.startsWith('data:')) return '[BASE64_DATA]';
                if (k === 'registrationDoc' && v) return '[BASE64_DOC_DATA]';
                if (k === 'attachments' && v) return '[ATTACHMENTS_DATA]';
                return v;
            }));
            logLine += `  Details: ${JSON.stringify(safeDetails)}\n`;
        } catch (e) {
            logLine += `  Details: [Error stringifying details]\n`;
        }
    }
    if (level === 'ERROR') console.error(message, details || ''); else console.log(message);
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > MAX_LOG_SIZE) {
                try {
                    fs.renameSync(LOG_FILE, LOG_FILE + '.old');
                    fs.writeFileSync(LOG_FILE, `[${new Date().toISOString()}] [INFO] Log rotated\n`);
                } catch (rotErr) {}
            }
        }
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (e) { console.error('Log failed', e); }
};

// --- DB SETUP ---
const dbPath = path.join(dataDir, 'fuhrpark.db');
let db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logSystem('ERROR', `DB Error: ${err.message}`);
    db = null; // Set to null on error
  } else {

    logSystem('INFO', `DB Connected: ${dbPath}`);
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON");
        db.run("PRAGMA journal_mode = WAL"); 
        db.run("PRAGMA synchronous = NORMAL");
        db.configure('busyTimeout', 5000);
    });
  }
});

// MIDDLEWARE
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// REQUEST LOGGING
app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
        logSystem('INFO', `API Request: ${req.method} ${req.url}`);
    }
    next();
});

// SERVE UPLOADS STATICALLY
app.use('/uploads', express.static(uploadsDir));




// HELPERS
const run = (sql, params = []) => new Promise((resolve, reject) => {
  if (!db) return reject(new Error('Database not initialized'));
  db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); });
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  if (!db) return reject(new Error('Database not initialized'));
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  if (!db) return reject(new Error('Database not initialized'));
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});

// Serialized write/transaction queue to prevent overlapping BEGIN/COMMIT across concurrent requests
let txQueue = Promise.resolve();
const enqueueExclusive = (fn) => {
  const next = txQueue.then(() => fn());
  txQueue = next.catch(() => {});
  return next;
};
const withTransaction = (fn) => enqueueExclusive(async () => {
  await run("BEGIN IMMEDIATE");
  try {
    const result = await fn();
    await run("COMMIT");
    return result;
  } catch (err) {
    try { await run("ROLLBACK"); } catch (_) {}
    throw err;
  }
});

// --- FILE HANDLING HELPER ---
// Converts Base64 dataURL to a file on disk and returns the relative path
const processFile = (base64String, prefix) => {
    if (!base64String || !base64String.startsWith('data:')) return base64String; // Return as is if not base64 or empty
    
    try {
        const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return base64String;

        const type = matches[1];
        const data = matches[2];
        const buffer = Buffer.from(data, 'base64');
        
        // Determine extension
        let ext = 'bin';
        if (type.includes('pdf')) ext = 'pdf';
        else if (type.includes('jpeg') || type.includes('jpg')) ext = 'jpg';
        else if (type.includes('png')) ext = 'png';
        
        const filename = `${prefix}_${crypto.randomUUID()}.${ext}`;
        const filePath = path.join(uploadsDir, filename);
        
        fs.writeFileSync(filePath, buffer);
        logSystem('INFO', `File saved: ${filename}`);
        
        return `/uploads/${filename}`;
    } catch (e) {
        logSystem('ERROR', `File save failed: ${e.message}`);
        return null; 
    }
};

const deleteUploadedFile = (fileUrl) => {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) return;
    try {
        const filename = path.basename(fileUrl);
        if (!filename) return;
        const targetPath = path.join(uploadsDir, filename);
        if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
            logSystem('INFO', `Deleted orphaned upload: ${filename}`);
        }
    } catch (e) {
        logSystem('ERROR', `Failed to delete upload ${fileUrl}: ${e.message}`);
    }
};

const cleanupRemovedAttachments = (oldList, newList) => {
    const keptPaths = new Set(
        (newList || [])
            .map(a => a && a.data)
            .filter(d => typeof d === 'string' && d.startsWith('/uploads/'))
    );
    (oldList || []).forEach(a => {
        if (a && typeof a.data === 'string' && a.data.startsWith('/uploads/') && !keptPaths.has(a.data)) {
            deleteUploadedFile(a.data);
        }
    });
};

// --- ADMIN SESSION AUTH ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'administrator';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();

const verifyAdminPassword = (input) => {
    const a = crypto.createHash('sha256').update(String(input || '')).digest();
    const b = crypto.createHash('sha256').update(String(ADMIN_PASSWORD)).digest();
    return crypto.timingSafeEqual(a, b);
};

const requireAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const expiresAt = adminSessions.get(token);
    if (!token || !expiresAt || expiresAt <= Date.now()) {
        if (token) adminSessions.delete(token);
        return res.status(401).json({ error: 'Admin-Authentifizierung erforderlich.' });
    }
    next();
};

// --- INIT DB ---
if (db) {
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, licensePlate TEXT, type TEXT, manufacturer TEXT, model TEXT, vin TEXT, year INTEGER, notes TEXT, coupledVehicleId TEXT, nextHU TEXT, nextSP TEXT, nextUVV TEXT, nextTacho TEXT, currentMileage INTEGER, registrationDoc TEXT, keyNum21 TEXT, keyNum22 TEXT, maintenanceContract INTEGER, maintenanceContractExpiry TEXT, maintenanceContractType TEXT)`);
  const logAlterErr = (col) => (err) => {
      if (err && !err.message.includes("duplicate column name")) {
          logSystem('ERROR', `Failed to add ${col} column: ${err.message}`);
      }
  };
  db.run(`ALTER TABLE vehicles ADD COLUMN isActive INTEGER DEFAULT 1`, logAlterErr('isActive'));
  db.run(`ALTER TABLE vehicles ADD COLUMN keyNum21 TEXT`, logAlterErr('keyNum21'));
  db.run(`ALTER TABLE vehicles ADD COLUMN keyNum22 TEXT`, logAlterErr('keyNum22'));
  db.run(`ALTER TABLE vehicles ADD COLUMN maintenanceContract INTEGER`, logAlterErr('maintenanceContract'));
  db.run(`ALTER TABLE vehicles ADD COLUMN maintenanceContractExpiry TEXT`, logAlterErr('maintenanceContractExpiry'));
  db.run(`ALTER TABLE vehicles ADD COLUMN maintenanceContractType TEXT`, logAlterErr('maintenanceContractType'));
  db.run(`ALTER TABLE vehicles ADD COLUMN version INTEGER DEFAULT 1`, logAlterErr('vehicles.version'));
  db.run(`CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, vehicleId TEXT, type TEXT, description TEXT, priority TEXT, dateAdded TEXT, dateCompleted TEXT, status TEXT, mileage INTEGER, inspectionType TEXT, attachments TEXT, notes TEXT, version INTEGER DEFAULT 1, FOREIGN KEY(vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE)`);
  db.run(`ALTER TABLE logs ADD COLUMN notes TEXT`, logAlterErr('logs.notes'));
  db.run(`ALTER TABLE logs ADD COLUMN version INTEGER DEFAULT 1`, logAlterErr('logs.version'));
  db.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, description TEXT, vehicleId TEXT, dateAdded TEXT, status TEXT, supplier TEXT, version INTEGER DEFAULT 1, FOREIGN KEY(vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE)`);
  db.run(`ALTER TABLE orders ADD COLUMN version INTEGER DEFAULT 1`, logAlterErr('orders.version'));
  db.run(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`);
  db.run("CREATE INDEX IF NOT EXISTS idx_logs_vehicleId ON logs(vehicleId)");
  db.run("CREATE INDEX IF NOT EXISTS idx_logs_status ON logs(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_logs_dateAdded ON logs(dateAdded)");
});
}

// --- API ROUTES ---

// VEHICLES
// OPTIMIZATION: Do NOT return the full 'registrationDoc' blob in the list.
app.get('/api/vehicles', async (req, res) => {
  try {
    const rows = await all("SELECT * FROM vehicles");
    
    // Strip heavy data for list view
    const lightweight = rows.map(v => {
        const { registrationDoc, isActive, maintenanceContract, ...rest } = v;
        const hasDoc = !!registrationDoc && registrationDoc.length > 0;
        return { 
          ...rest, 
          hasDoc, 
          registrationDoc: null, 
          isActive: isActive !== 0,
          maintenanceContract: maintenanceContract === 1 
        }; // Send null to save bandwidth
    });
    
    res.json(lightweight);
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

// Fetch single doc lazy
app.get('/api/vehicles/:id/doc', async (req, res) => {
  try {
    const row = await get("SELECT registrationDoc FROM vehicles WHERE id = ?", [req.params.id]);
    res.json({ doc: row ? row.registrationDoc : null });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

app.put('/api/vehicles/:id', async (req, res) => {
  const v = req.body;
  try {
    let docPath = v.registrationDoc;
    let oldDocToDelete = null;
    let newVersion = 1;
    await withTransaction(async () => {
        const existing = await get("SELECT registrationDoc, COALESCE(version, 1) as version FROM vehicles WHERE id = ?", [req.params.id]);
        if (existing && typeof v.version === 'number' && existing.version !== v.version) {
            const err = new Error('Konflikt: Fahrzeug wurde zwischenzeitlich von einem anderen Benutzer geändert. Bitte Daten neu laden.');
            err.statusCode = 409;
            throw err;
        }
        newVersion = existing ? existing.version + 1 : 1;

        if (v.registrationDoc && v.registrationDoc.startsWith('data:')) {
            docPath = processFile(v.registrationDoc, `doc_${req.params.id}`);
        }

        if (v.registrationDoc === undefined || v.registrationDoc === null) {
            docPath = existing ? existing.registrationDoc : null;
        } else if (existing && existing.registrationDoc && existing.registrationDoc !== docPath) {
            oldDocToDelete = existing.registrationDoc;
        }

        const isActiveVal = v.isActive === false ? 0 : 1;
        const maintenanceContractVal = v.maintenanceContract ? 1 : 0;

        await run(`INSERT INTO vehicles (id, licensePlate, type, manufacturer, model, vin, year, notes, coupledVehicleId, nextHU, nextSP, nextUVV, nextTacho, currentMileage, registrationDoc, isActive, keyNum21, keyNum22, maintenanceContract, maintenanceContractExpiry, maintenanceContractType, version)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
          ON CONFLICT(id) DO UPDATE SET
            licensePlate=excluded.licensePlate,
            type=excluded.type,
            manufacturer=excluded.manufacturer,
            model=excluded.model,
            vin=excluded.vin,
            year=excluded.year,
            notes=excluded.notes,
            coupledVehicleId=excluded.coupledVehicleId,
            nextHU=excluded.nextHU,
            nextSP=excluded.nextSP,
            nextUVV=excluded.nextUVV,
            nextTacho=excluded.nextTacho,
            currentMileage=excluded.currentMileage,
            registrationDoc=excluded.registrationDoc,
            isActive=excluded.isActive,
            keyNum21=excluded.keyNum21,
            keyNum22=excluded.keyNum22,
            maintenanceContract=excluded.maintenanceContract,
            maintenanceContractExpiry=excluded.maintenanceContractExpiry,
            maintenanceContractType=excluded.maintenanceContractType,
            version=COALESCE(vehicles.version, 1) + 1`,
          [req.params.id, v.licensePlate, v.type, v.manufacturer, v.model, v.vin, v.year, v.notes, v.coupledVehicleId, v.nextHU, v.nextSP, v.nextUVV, v.nextTacho, v.currentMileage, docPath, isActiveVal, v.keyNum21 || null, v.keyNum22 || null, maintenanceContractVal, v.maintenanceContractExpiry || null, v.maintenanceContractType || null]);
    });

    if (oldDocToDelete) deleteUploadedFile(oldDocToDelete);
    res.json({ success: true, path: docPath, version: newVersion });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method }); res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.post('/api/vehicles', async (req, res) => {
  const v = req.body;
  const id = v.id || crypto.randomUUID();
  try {
     let docPath = v.registrationDoc;
    if (v.registrationDoc && v.registrationDoc.startsWith('data:')) {
        docPath = processFile(v.registrationDoc, `doc_${id}`);
    }
    const isActiveVal = v.isActive === false ? 0 : 1;
    const maintenanceContractVal = v.maintenanceContract ? 1 : 0;
    
    await run(`INSERT INTO vehicles (id, licensePlate, type, manufacturer, model, vin, year, notes, coupledVehicleId, nextHU, nextSP, nextUVV, nextTacho, currentMileage, registrationDoc, isActive, keyNum21, keyNum22, maintenanceContract, maintenanceContractExpiry, maintenanceContractType, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, 
      [id, v.licensePlate, v.type, v.manufacturer, v.model, v.vin, v.year, v.notes, v.coupledVehicleId, v.nextHU, v.nextSP, v.nextUVV, v.nextTacho, v.currentMileage, docPath, isActiveVal, v.keyNum21 || null, v.keyNum22 || null, maintenanceContractVal, v.maintenanceContractExpiry || null, v.maintenanceContractType || null]);
    res.json({ success: true, id, path: docPath, version: 1 });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

app.delete('/api/vehicles/:id', async (req, res) => {
    try {
        const filesToDelete = [];
        await withTransaction(async () => {
            const vRow = await get("SELECT registrationDoc FROM vehicles WHERE id = ?", [req.params.id]);
            if (vRow && vRow.registrationDoc) filesToDelete.push(vRow.registrationDoc);
            const logRows = await all("SELECT attachments FROM logs WHERE vehicleId = ?", [req.params.id]);
            logRows.forEach(r => {
                try {
                    const atts = JSON.parse(r.attachments || '[]');
                    atts.forEach(a => { if (a && a.data) filesToDelete.push(a.data); });
                } catch (_) {}
            });

            await run("UPDATE vehicles SET coupledVehicleId = NULL, version = COALESCE(version, 1) + 1 WHERE coupledVehicleId = ?", [req.params.id]);
            await run("DELETE FROM orders WHERE vehicleId = ?", [req.params.id]);
            await run("DELETE FROM logs WHERE vehicleId = ?", [req.params.id]);
            await run("DELETE FROM vehicles WHERE id = ?", [req.params.id]);
        });
        filesToDelete.forEach(deleteUploadedFile);
        res.json({ success: true });
    } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

// LOGS (With Pagination & Filter & Payload Optimization)
app.get('/api/logs', async (req, res) => {
  try {
    const { page, limit, status, vehicleId, startDate, endDate, text, licensePlate, vType, category } = req.query;
    
    let sql = "SELECT l.* FROM logs l";
    let countSql = "SELECT COUNT(*) as count FROM logs l";
    
    if (licensePlate || vType) {
        sql += " LEFT JOIN vehicles v ON l.vehicleId = v.id";
        countSql += " LEFT JOIN vehicles v ON l.vehicleId = v.id";
    }
    
    sql += " WHERE 1=1";
    countSql += " WHERE 1=1";
    
    const params = [];

    if (status) {
        if (status === '!DONE') {
            sql += " AND (l.status != 'DONE' OR l.status IS NULL)";
            countSql += " AND (l.status != 'DONE' OR l.status IS NULL)";
        } else { 
            sql += " AND l.status = ?"; 
            countSql += " AND l.status = ?";
            params.push(status); 
        }
    }
    if (vehicleId) { 
        sql += " AND l.vehicleId = ?"; 
        countSql += " AND l.vehicleId = ?";
        params.push(vehicleId); 
    }
    if (startDate) {
        sql += " AND l.dateCompleted >= ?";
        countSql += " AND l.dateCompleted >= ?";
        params.push(startDate);
    }
    if (endDate) {
        sql += " AND l.dateCompleted <= ?";
        countSql += " AND l.dateCompleted <= ?";
        params.push(endDate);
    }
    if (text) {
        sql += " AND l.description LIKE ?";
        countSql += " AND l.description LIKE ?";
        params.push(`%${text}%`);
    }
    if (licensePlate) {
        sql += " AND v.licensePlate LIKE ?";
        countSql += " AND v.licensePlate LIKE ?";
        params.push(`%${licensePlate}%`);
    }
    if (vType) {
        sql += " AND v.type = ?";
        countSql += " AND v.type = ?";
        params.push(vType);
    }
    if (category === 'inspection') {
        sql += " AND (l.inspectionType IS NOT NULL OR l.type = 'Prüfung')";
        countSql += " AND (l.inspectionType IS NOT NULL OR l.type = 'Prüfung')";
    } else if (category === 'work') {
        sql += " AND (l.inspectionType IS NULL AND l.type != 'Prüfung')";
        countSql += " AND (l.inspectionType IS NULL AND l.type != 'Prüfung')";
    }

    if (status === 'DONE') {
        sql += " ORDER BY l.dateCompleted DESC";
    } else {
        sql += " ORDER BY l.dateAdded DESC";
    }

    if (page && limit) {
        const offset = (parseInt(page) - 1) * parseInt(limit);
        sql += " LIMIT ? OFFSET ?";
        params.push(parseInt(limit), offset);
    }

    const rows = await all(sql, params);
    
    // Total Count
    const countRow = await get(countSql, params.slice(0, params.length - (page && limit ? 2 : 0)));

    // OPTIMIZATION: Strip Base64 from attachments
    const parsed = rows.map(r => {
        let att = [];
        try { att = JSON.parse(r.attachments || '[]'); } catch(e) {}
        
        const optimizedAtt = att.map(a => {
            // If it's a file path, keep it. If it's Base64 (starts with data:), strip it for the list view
            // but keep a flag so UI knows there is data.
            if (a.data && a.data.startsWith('data:')) {
                return { ...a, data: null, hasData: true }; 
            }
            return { ...a, hasData: !!a.data || !!a.hasData };
        });

        return { ...r, attachments: optimizedAtt };
    });

    res.json({ data: parsed, total: countRow.count, page: parseInt(page) || 1, limit: parseInt(limit) || 9999 });

  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

app.post('/api/logs', async (req, res) => {
  try {
    const l = req.body;
    const id = l.id || crypto.randomUUID();
    
    let attachments = l.attachments || [];
    if (typeof attachments === 'string') try { attachments = JSON.parse(attachments); } catch(e) {}
    
    const processedAttachments = attachments.map(att => {
        if (att.data && att.data.startsWith('data:')) {
            const filePath = processFile(att.data, `att_${id}`);
            return { ...att, data: filePath, hasData: true };
        }
        return att;
    });

    await run(`INSERT INTO logs (id, vehicleId, type, description, priority, dateAdded, dateCompleted, status, mileage, inspectionType, attachments, notes, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`, 
      [id, l.vehicleId || null, l.type || null, l.description || null, l.priority || null, l.dateAdded || null, l.dateCompleted || null, l.status || 'OPEN', l.mileage || null, l.inspectionType || null, JSON.stringify(processedAttachments), l.notes || null]);
    res.json({ success: true, id, version: 1 });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

app.put('/api/logs/:id', async (req, res) => {
  try {
      const l = req.body;
      let oldAttachments = [];
      let newAttachments = [];
      let newVersion = 1;
      await withTransaction(async () => {
          const existingRow = await get("SELECT attachments, COALESCE(version, 1) as version FROM logs WHERE id=?", [req.params.id]);
          if (existingRow && typeof l.version === 'number' && existingRow.version !== l.version) {
              const err = new Error('Konflikt: Eintrag wurde zwischenzeitlich von einem anderen Benutzer geändert. Bitte Daten neu laden.');
              err.statusCode = 409;
              throw err;
          }
          newVersion = existingRow ? existingRow.version + 1 : 1;
          oldAttachments = existingRow ? JSON.parse(existingRow.attachments || '[]') : [];

          let incomingAttachments = l.attachments || [];
          newAttachments = incomingAttachments.map(att => {
              if (att.data && att.data.startsWith('data:')) {
                  const filePath = processFile(att.data, `att_${req.params.id}`);
                  return { ...att, data: filePath, hasData: true };
              } else if (!att.data && att.hasData) {
                  const old = oldAttachments.find(ea => ea.name === att.name);
                  return old || att;
              }
              return att;
          });

          await run(`INSERT INTO logs (id, vehicleId, type, description, priority, dateAdded, dateCompleted, status, mileage, inspectionType, attachments, notes, version)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)
            ON CONFLICT(id) DO UPDATE SET
              vehicleId=excluded.vehicleId,
              type=excluded.type,
              description=excluded.description,
              priority=excluded.priority,
              dateAdded=excluded.dateAdded,
              dateCompleted=excluded.dateCompleted,
              status=excluded.status,
              mileage=excluded.mileage,
              inspectionType=excluded.inspectionType,
              attachments=excluded.attachments,
              notes=excluded.notes,
              version=COALESCE(logs.version, 1) + 1`,
            [req.params.id, l.vehicleId || null, l.type || null, l.description || null, l.priority || null, l.dateAdded || null, l.dateCompleted || null, l.status || 'OPEN', l.mileage || null, l.inspectionType || null, JSON.stringify(newAttachments), l.notes || null]);
      });
      cleanupRemovedAttachments(oldAttachments, newAttachments);
      res.json({ success: true, version: newVersion });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method }); res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.delete('/api/logs/:id', async (req, res) => {
    try {
        let oldAttachments = [];
        await withTransaction(async () => {
            const existingRow = await get("SELECT attachments FROM logs WHERE id=?", [req.params.id]);
            if (existingRow && existingRow.attachments) {
                try { oldAttachments = JSON.parse(existingRow.attachments); } catch (_) {}
            }
            await run("DELETE FROM logs WHERE id=?", [req.params.id]);
        });
        cleanupRemovedAttachments(oldAttachments, []);
        res.json({success:true});
    } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

// ORDERS
app.get('/api/orders', async (req, res) => {
    try { res.json(await all("SELECT * FROM orders")); } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});
app.post('/api/orders', async (req, res) => {
    try { 
        const id = req.body.id || crypto.randomUUID();
        await run("INSERT INTO orders (id, description, vehicleId, dateAdded, status, supplier, version) VALUES (?,?,?,?,?,?,1)", [id, req.body.description || null, req.body.vehicleId || null, req.body.dateAdded || null, req.body.status || null, req.body.supplier || null]);
        res.json({success:true, id, version: 1});
    } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});
app.put('/api/orders/:id', async (req, res) => {
    try {
        let newVersion = 1;
        await withTransaction(async () => {
            const existing = await get("SELECT COALESCE(version, 1) as version FROM orders WHERE id = ?", [req.params.id]);
            if (existing && typeof req.body.version === 'number' && existing.version !== req.body.version) {
                const err = new Error('Konflikt: Bestellung wurde zwischenzeitlich von einem anderen Benutzer geändert. Bitte Daten neu laden.');
                err.statusCode = 409;
                throw err;
            }
            newVersion = existing ? existing.version + 1 : 1;
            await run(`INSERT INTO orders (id, description, vehicleId, dateAdded, status, supplier, version)
              VALUES (?,?,?,?,?,?,1)
              ON CONFLICT(id) DO UPDATE SET
                description=excluded.description,
                vehicleId=excluded.vehicleId,
                dateAdded=excluded.dateAdded,
                status=excluded.status,
                supplier=excluded.supplier,
                version=COALESCE(orders.version, 1) + 1`,
              [req.params.id, req.body.description || null, req.body.vehicleId || null, req.body.dateAdded || null, req.body.status || null, req.body.supplier || null]);
        });
        res.json({success:true, version: newVersion});
    } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method }); res.status(e.statusCode || 500).json({ error: e.message }); }
});
app.delete('/api/orders/:id', async (req, res) => {
    try { await run("DELETE FROM orders WHERE id=?", [req.params.id]); res.json({success:true}); }
    catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

// TRANSACTIONS
app.post('/api/transaction/complete-task', async (req, res) => {
    const { logId, vehicleId, mileage, logData } = req.body;
    try {
        await withTransaction(async () => {
            const existingRow = await get("SELECT attachments FROM logs WHERE id=?", [logId]);
            let existingAttachments = [];
            try {
                if (existingRow && existingRow.attachments) {
                    existingAttachments = JSON.parse(existingRow.attachments);
                }
            } catch (e) {
                logSystem('ERROR', `Failed to parse attachments for log ${logId}`);
            }
            let incomingAttachments = logData.attachments || [];
            if (typeof incomingAttachments === 'string') {
                try {
                    incomingAttachments = JSON.parse(incomingAttachments);
                } catch (e) {
                    incomingAttachments = [];
                }
            }

            const processedAttachments = incomingAttachments.map(att => {
                if (att.data && att.data.startsWith('data:')) {
                    const filePath = processFile(att.data, `att_${logId}`);
                    return { ...att, data: filePath, hasData: true };
                } else if (!att.data && att.hasData) {
                    const old = existingAttachments.find(ea => ea.name === att.name);
                    return old || att;
                }
                return att;
            });

            const attStr = JSON.stringify(processedAttachments);
            await run(`INSERT INTO logs (id, vehicleId, type, description, priority, dateAdded, dateCompleted, status, mileage, inspectionType, attachments, notes, version)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)
                ON CONFLICT(id) DO UPDATE SET
                  vehicleId=excluded.vehicleId,
                  type=excluded.type,
                  description=excluded.description,
                  priority=excluded.priority,
                  dateAdded=excluded.dateAdded,
                  dateCompleted=excluded.dateCompleted,
                  status=excluded.status,
                  mileage=excluded.mileage,
                  inspectionType=excluded.inspectionType,
                  attachments=excluded.attachments,
                  notes=excluded.notes,
                  version=COALESCE(logs.version, 1) + 1`,
                [logId, logData.vehicleId || null, logData.type || null, logData.description || null, logData.priority || null, logData.dateAdded || null, logData.dateCompleted || null, 'DONE', mileage || null, logData.inspectionType || null, attStr, logData.notes || null]);

            if (vehicleId) {
                const row = await get("SELECT currentMileage FROM vehicles WHERE id=?", [vehicleId]);
                if (row && mileage > (row.currentMileage || 0)) {
                    await run("UPDATE vehicles SET currentMileage=?, version = COALESCE(version, 1) + 1 WHERE id=?", [mileage, vehicleId]);
                }
            }
            cleanupRemovedAttachments(existingAttachments, processedAttachments);
        });
        res.json({ success: true });
    } catch (e) {
        logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method });
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/transaction/complete-inspection', async (req, res) => {
    const { logData, nextDate } = req.body;
    const logId = logData?.id || crypto.randomUUID();
    const validTypes = ['HU', 'SP', 'UVV', 'Tacho'];
    if (!logData || !validTypes.includes(logData.inspectionType)) {
        return res.status(400).json({ error: 'Invalid inspection type' });
    }
    const colName = `next${logData.inspectionType}`;

    if (!nextDate || typeof nextDate !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing nextDate' });
    }
    let y, m;
    const trimmed = nextDate.trim();
    if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts[0].length === 4) {
            y = parts[0];
            m = parts[1];
        } else {
            m = parts[0];
            y = parts[1];
        }
    } else if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        m = parts[0];
        y = parts[1];
    } else if (trimmed.includes('.')) {
        const parts = trimmed.split('.');
        m = parts[0];
        y = parts[1];
    } else {
        return res.status(400).json({ error: 'Ungültiges Datumsformat. Erwartet wird MM/JJJJ.' });
    }

    const monthNum = parseInt(m, 10);
    if (y && y.length === 2 && /^\d{2}$/.test(y)) y = '20' + y;
    const yearNum = parseInt(y, 10);

    if (!m || !y || isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100 || !/^\d{4}$/.test(y)) {
        return res.status(400).json({ error: 'Ungültiges Datum. Erwartet wird ein gültiger Monat (01-12) und ein vierstelliges Jahr.' });
    }
    const formattedDate = `${String(monthNum).padStart(2, '0')}/${y}`;

    try {
        await withTransaction(async () => {
            await run("INSERT INTO logs (id, vehicleId, type, description, priority, dateAdded, dateCompleted, status, mileage, inspectionType, attachments, notes, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)",
                [logId, logData.vehicleId || null, 'Wartung', logData.description || null, 'Normal', logData.dateAdded || null, logData.dateCompleted || null, 'DONE', null, logData.inspectionType || null, '[]', logData.notes || null]);
            await run(`UPDATE vehicles SET ${colName}=?, version = COALESCE(version, 1) + 1 WHERE id=?`, [formattedDate, logData.vehicleId]);
        });
        res.json({ success: true });
    } catch (e) {
        logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method });
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/transaction/couple', async (req, res) => {
    const { motorId, trailerId } = req.body || {};
    if (!motorId || !trailerId || motorId === trailerId) {
        return res.status(400).json({ error: 'Ungültige Fahrzeugauswahl zum Koppeln.' });
    }
    try {
        await withTransaction(async () => {
            const motor = await get("SELECT id, isActive, coupledVehicleId FROM vehicles WHERE id = ?", [motorId]);
            const trailer = await get("SELECT id, isActive, coupledVehicleId FROM vehicles WHERE id = ?", [trailerId]);
            if (!motor || !trailer) {
                const err = new Error('Mindestens ein Fahrzeug wurde nicht gefunden.');
                err.statusCode = 404;
                throw err;
            }
            if (motor.isActive === 0 || trailer.isActive === 0) {
                const err = new Error('Inaktive Fahrzeuge können nicht gekoppelt werden.');
                err.statusCode = 400;
                throw err;
            }
            if (motor.coupledVehicleId) {
                await run("UPDATE vehicles SET coupledVehicleId = NULL, version = COALESCE(version, 1) + 1 WHERE id = ?", [motor.coupledVehicleId]);
            }
            if (trailer.coupledVehicleId) {
                await run("UPDATE vehicles SET coupledVehicleId = NULL, version = COALESCE(version, 1) + 1 WHERE id = ?", [trailer.coupledVehicleId]);
            }
            await run("UPDATE vehicles SET coupledVehicleId = NULL, version = COALESCE(version, 1) + 1 WHERE coupledVehicleId IN (?, ?)", [motorId, trailerId]);
            await run("UPDATE vehicles SET coupledVehicleId = ?, version = COALESCE(version, 1) + 1 WHERE id = ?", [trailerId, motorId]);
            await run("UPDATE vehicles SET coupledVehicleId = ?, version = COALESCE(version, 1) + 1 WHERE id = ?", [motorId, trailerId]);
        });
        res.json({ success: true });
    } catch (e) {
        logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method });
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

app.post('/api/transaction/uncouple', async (req, res) => {
    const { motorId, trailerId } = req.body || {};
    if (!motorId && !trailerId) {
        return res.status(400).json({ error: 'Keine Fahrzeug-ID zum Trennen angegeben.' });
    }
    try {
        await withTransaction(async () => {
            if (motorId) {
                await run("UPDATE vehicles SET coupledVehicleId = NULL, version = COALESCE(version, 1) + 1 WHERE id = ? OR coupledVehicleId = ?", [motorId, motorId]);
            }
            if (trailerId) {
                await run("UPDATE vehicles SET coupledVehicleId = NULL, version = COALESCE(version, 1) + 1 WHERE id = ? OR coupledVehicleId = ?", [trailerId, trailerId]);
            }
        });
        res.json({ success: true });
    } catch (e) {
        logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method });
        res.status(500).json({ error: e.message });
    }
});


app.post('/api/admin/login', (req, res) => {
    const password = req.body?.password;
    if (!verifyAdminPassword(password)) {
        return res.status(401).json({ error: 'Falsches Admin-Passwort.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
    res.json({ success: true, token });
});
app.get('/api/admin/db-stats', requireAdmin, (req,res) => { try { const s = fs.statSync(dbPath); res.json({size: (s.size/1024/1024).toFixed(2)+' MB'}); } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); } });
app.post('/api/admin/db-vacuum', requireAdmin, async (req, res) => {
    try {
        await enqueueExclusive(() => run("VACUUM"));
        logSystem('INFO', 'Database VACUUM completed');
        res.json({ success: true });
    } catch (e) {
        logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method });
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/admin/logs', requireAdmin, (req,res) => { if(fs.existsSync(LOG_FILE)) res.json({logs: fs.readFileSync(LOG_FILE, 'utf8')}); else res.json({logs:''}); });
app.delete('/api/admin/logs', requireAdmin, (req,res) => { if (fs.existsSync(LOG_FILE)) fs.truncateSync(LOG_FILE, 0); res.json({success:true}); });
app.post('/api/admin/client-error', (req, res) => {
    logSystem('ERROR', 'Client-side error reported', req.body);
    res.json({ success: true });
});

// Return JSON 404 for unknown /api routes so frontend does not confuse them with SPA HTML fallback
app.use('/api', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Vite middleware for development
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = require('vite');
  createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  }).then(vite => {
    app.use(vite.middlewares);
    
    // Global Error Handler
    app.use((err, req, res, next) => {
        logSystem('ERROR', `Unhandled Express Error: ${err.message}`, { stack: err.stack, url: req.url, method: req.method });
        res.status(500).json({ error: 'Internal Server Error' });
    });

    app.listen(PORT, '0.0.0.0', () => {
      logSystem('INFO', `Server running on ${PORT}`);
      console.log(`Server started on port ${PORT}`);
    });
  });
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Global Error Handler
  app.use((err, req, res, next) => {
      logSystem('ERROR', `Unhandled Express Error: ${err.message}`, { stack: err.stack, url: req.url, method: req.method });
      res.status(500).json({ error: 'Internal Server Error' });
  });

  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
  app.listen(PORT, '0.0.0.0', () => {
      logSystem('INFO', `Server running on ${PORT}`);
      console.log(`Server started on port ${PORT}`);
  });
}
