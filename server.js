

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
        db.run("CREATE INDEX IF NOT EXISTS idx_logs_vehicleId ON logs(vehicleId)");
        db.run("CREATE INDEX IF NOT EXISTS idx_logs_status ON logs(status)");
        db.run("CREATE INDEX IF NOT EXISTS idx_logs_dateAdded ON logs(dateAdded)");
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

// --- INIT DB ---
if (db) {
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, licensePlate TEXT, type TEXT, manufacturer TEXT, model TEXT, vin TEXT, year INTEGER, notes TEXT, coupledVehicleId TEXT, nextHU TEXT, nextSP TEXT, nextUVV TEXT, nextTacho TEXT, currentMileage INTEGER, registrationDoc TEXT, keyNum21 TEXT, keyNum22 TEXT, maintenanceContract INTEGER, maintenanceContractExpiry TEXT, maintenanceContractType TEXT)`);
  db.run(`ALTER TABLE vehicles ADD COLUMN isActive INTEGER DEFAULT 1`, (err) => {});
  db.run(`ALTER TABLE vehicles ADD COLUMN keyNum21 TEXT`, (err) => {});
  db.run(`ALTER TABLE vehicles ADD COLUMN keyNum22 TEXT`, (err) => {});
  db.run(`ALTER TABLE vehicles ADD COLUMN maintenanceContract INTEGER`, (err) => {});
  db.run(`ALTER TABLE vehicles ADD COLUMN maintenanceContractExpiry TEXT`, (err) => {});
  db.run(`ALTER TABLE vehicles ADD COLUMN maintenanceContractType TEXT`, (err) => {});
  db.run(`CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, vehicleId TEXT, type TEXT, description TEXT, priority TEXT, dateAdded TEXT, dateCompleted TEXT, status TEXT, mileage INTEGER, inspectionType TEXT, attachments TEXT, notes TEXT, FOREIGN KEY(vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE)`);
  db.run(`ALTER TABLE logs ADD COLUMN notes TEXT`, (err) => {
      if (err && !err.message.includes("duplicate column name")) {
          logSystem('ERROR', `Failed to add notes column: ${err.message}`);
      }
  });
  db.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, description TEXT, vehicleId TEXT, dateAdded TEXT, status TEXT, supplier TEXT, FOREIGN KEY(vehicleId) REFERENCES vehicles(id) ON DELETE CASCADE)`);
  db.run(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`);
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
    // Process File Upload if Base64
    let docPath = v.registrationDoc;
    if (v.registrationDoc && v.registrationDoc.startsWith('data:')) {
        docPath = processFile(v.registrationDoc, `doc_${req.params.id}`);
    }

    // If registrationDoc is explicitly null/undefined in body, it might mean "don't change". 
    // But since we stripped it in GET, the frontend might send null back if not edited.
    // If user deleted it, frontend should send empty string.
    
    // Logic: If v.registrationDoc is null, fetch existing to preserve. 
    // However, if the frontend lazily loaded it, it sends the full string.
    // To be safe: If v.registrationDoc is null/undefined, we assume NO CHANGE.
    if (v.registrationDoc === undefined || v.registrationDoc === null) {
         const existing = await get("SELECT registrationDoc FROM vehicles WHERE id = ?", [req.params.id]);
         docPath = existing ? existing.registrationDoc : null;
    }

    const isActiveVal = v.isActive === false ? 0 : 1;
    const maintenanceContractVal = v.maintenanceContract ? 1 : 0;

    await run(`INSERT OR REPLACE INTO vehicles (id, licensePlate, type, manufacturer, model, vin, year, notes, coupledVehicleId, nextHU, nextSP, nextUVV, nextTacho, currentMileage, registrationDoc, isActive, keyNum21, keyNum22, maintenanceContract, maintenanceContractExpiry, maintenanceContractType) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
      [req.params.id, v.licensePlate, v.type, v.manufacturer, v.model, v.vin, v.year, v.notes, v.coupledVehicleId, v.nextHU, v.nextSP, v.nextUVV, v.nextTacho, v.currentMileage, docPath, isActiveVal, v.keyNum21 || null, v.keyNum22 || null, maintenanceContractVal, v.maintenanceContractExpiry || null, v.maintenanceContractType || null]);
    res.json({ success: true, path: docPath });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
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
    
    await run(`INSERT INTO vehicles (id, licensePlate, type, manufacturer, model, vin, year, notes, coupledVehicleId, nextHU, nextSP, nextUVV, nextTacho, currentMileage, registrationDoc, isActive, keyNum21, keyNum22, maintenanceContract, maintenanceContractExpiry, maintenanceContractType) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
      [id, v.licensePlate, v.type, v.manufacturer, v.model, v.vin, v.year, v.notes, v.coupledVehicleId, v.nextHU, v.nextSP, v.nextUVV, v.nextTacho, v.currentMileage, docPath, isActiveVal, v.keyNum21 || null, v.keyNum22 || null, maintenanceContractVal, v.maintenanceContractExpiry || null, v.maintenanceContractType || null]);
    res.json({ success: true, id, path: docPath });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

app.delete('/api/vehicles/:id', async (req, res) => {
    try {
        await run("UPDATE vehicles SET coupledVehicleId = NULL WHERE coupledVehicleId = ?", [req.params.id]);
        await run("DELETE FROM orders WHERE vehicleId = ?", [req.params.id]);
        await run("DELETE FROM logs WHERE vehicleId = ?", [req.params.id]);
        await run("DELETE FROM vehicles WHERE id = ?", [req.params.id]);
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

    await run(`INSERT INTO logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, 
      [id, l.vehicleId || null, l.type || null, l.description || null, l.priority || null, l.dateAdded || null, l.dateCompleted || null, l.status || 'OPEN', l.mileage || null, l.inspectionType || null, JSON.stringify(processedAttachments), l.notes || null]);
    res.json({ success: true, id });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

app.put('/api/logs/:id', async (req, res) => {
  try {
      const l = req.body;
      const existingRow = await get("SELECT attachments FROM logs WHERE id=?", [req.params.id]);
      const existingAttachments = existingRow ? JSON.parse(existingRow.attachments || '[]') : [];

      let incomingAttachments = l.attachments || [];
      const processedAttachments = incomingAttachments.map(att => {
          if (att.data && att.data.startsWith('data:')) {
              const filePath = processFile(att.data, `att_${req.params.id}`);
              return { ...att, data: filePath, hasData: true };
          } else if (!att.data && att.hasData) {
              // Existing file or Base64 that was stripped in UI. Find original.
              const old = existingAttachments.find(ea => ea.name === att.name);
              return old || att;
          }
          return att;
      });

      await run(`INSERT OR REPLACE INTO logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, 
        [req.params.id, l.vehicleId || null, l.type || null, l.description || null, l.priority || null, l.dateAdded || null, l.dateCompleted || null, l.status || 'OPEN', l.mileage || null, l.inspectionType || null, JSON.stringify(processedAttachments), l.notes || null]);
      res.json({ success: true });
  } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

app.delete('/api/logs/:id', async (req, res) => {
    try { await run("DELETE FROM logs WHERE id=?", [req.params.id]); res.json({success:true}); }
    catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

// ORDERS
app.get('/api/orders', async (req, res) => {
    try { res.json(await all("SELECT * FROM orders")); } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});
app.post('/api/orders', async (req, res) => {
    try { 
        const id = req.body.id || crypto.randomUUID();
        await run("INSERT INTO orders VALUES (?,?,?,?,?,?)", [id, req.body.description || null, req.body.vehicleId || null, req.body.dateAdded || null, req.body.status || null, req.body.supplier || null]);
        res.json({success:true, id});
    } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});
app.put('/api/orders/:id', async (req, res) => {
    try {
        await run("INSERT OR REPLACE INTO orders VALUES (?,?,?,?,?,?)", [req.params.id, req.body.description || null, req.body.vehicleId || null, req.body.dateAdded || null, req.body.status || null, req.body.supplier || null]);
        res.json({success:true});
    } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});
app.delete('/api/orders/:id', async (req, res) => {
    try { await run("DELETE FROM orders WHERE id=?", [req.params.id]); res.json({success:true}); }
    catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); }
});

// TRANSACTIONS
app.post('/api/transaction/complete-task', async (req, res) => {
    const { logId, vehicleId, mileage, logData } = req.body;
    db.serialize(() => {
        db.run("BEGIN");
        db.get("SELECT attachments FROM logs WHERE id=?", [logId], (err, existingRow) => {
            if(err) { db.run("ROLLBACK"); return res.status(500).json({error:err.message}); }
            
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
            db.run("INSERT OR REPLACE INTO logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [logId, logData.vehicleId || null, logData.type || null, logData.description || null, logData.priority || null, logData.dateAdded || null, logData.dateCompleted || null, 'DONE', mileage || null, logData.inspectionType || null, attStr, logData.notes || null], (err) => {
                if(err) { db.run("ROLLBACK"); return res.status(500).json({error:err.message}); }
                db.get("SELECT currentMileage FROM vehicles WHERE id=?", [vehicleId], (err, row) => {
                    if(row && mileage > (row.currentMileage||0)) {
                        db.run("UPDATE vehicles SET currentMileage=? WHERE id=?", [mileage, vehicleId], (err) => {
                            if(err) { db.run("ROLLBACK"); return res.status(500).json({error:err.message}); }
                            db.run("COMMIT"); res.json({success:true});
                        });
                    } else { db.run("COMMIT"); res.json({success:true}); }
                });
            });
        });
    });
});

app.post('/api/transaction/complete-inspection', async (req, res) => {
    const { logData, nextDate } = req.body;
    const logId = logData.id || crypto.randomUUID();
    const validTypes = ['HU', 'SP', 'UVV', 'Tacho'];
    if (!validTypes.includes(logData.inspectionType)) {
        return res.status(400).json({error: 'Invalid inspection type'});
    }
    const colName = `next${logData.inspectionType}`;
    
    if (!nextDate || typeof nextDate !== 'string') {
        return res.status(400).json({error: 'Invalid or missing nextDate'});
    }
    let y, m;
    if (nextDate.includes('-')) {
        const parts = nextDate.split('-');
        if (parts[0].length === 4) {
            y = parts[0];
            m = parts[1];
        } else {
            m = parts[0];
            y = parts[1];
        }
    } else if (nextDate.includes('/')) {
        const parts = nextDate.split('/');
        m = parts[0];
        y = parts[1];
    } else if (nextDate.includes('.')) {
        const parts = nextDate.split('.');
        m = parts[0];
        y = parts[1];
    } else {
        // Fallback
        y = new Date().getFullYear().toString();
        m = '01';
    }
    if (m) m = m.padStart(2, '0');
    if (y && y.length === 2) y = '20' + y;
    const formattedDate = `${m}/${y}`;
    
    db.serialize(() => {
        db.run("BEGIN");
        db.run("INSERT INTO logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [logId, logData.vehicleId || null, 'Wartung', logData.description || null, 'Normal', logData.dateAdded || null, logData.dateCompleted || null, 'DONE', null, logData.inspectionType || null, '[]', logData.notes || null], (err) => {
            if(err) { db.run("ROLLBACK"); return res.status(500).json({error:err.message}); }
            db.run(`UPDATE vehicles SET ${colName}=? WHERE id=?`, [formattedDate, logData.vehicleId], (err) => {
                 if(err) { db.run("ROLLBACK"); return res.status(500).json({error:err.message}); }
                 db.run("COMMIT"); res.json({success:true});
            });
        });
    });
});


app.get('/api/admin/db-stats', (req,res) => { try { const s = fs.statSync(dbPath); res.json({size: (s.size/1024/1024).toFixed(2)+' MB'}); } catch (e) { logSystem('ERROR', e.message, { stack: e.stack, url: req.url, method: req.method, body: req.body }); res.status(500).json({ error: e.message }); } });
app.get('/api/admin/logs', (req,res) => { if(fs.existsSync(LOG_FILE)) res.json({logs: fs.readFileSync(LOG_FILE, 'utf8')}); else res.json({logs:''}); });
app.delete('/api/admin/logs', (req,res) => { fs.truncateSync(LOG_FILE, 0); res.json({success:true}); });
app.post('/api/admin/client-error', (req, res) => {
    logSystem('ERROR', 'Client-side error reported', req.body);
    res.json({ success: true });
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
