require('dotenv').config();
const express = require('express');
const app = express();
const morgan = require('morgan'); // Para logging
const helmet = require('helmet'); // Para segurança
const compression = require('compression'); // Para compressão de respostas
const path = require('path');
const cors = require('cors');
const { Database } = require('@sqlitecloud/drivers');

// Configuração da conexão com o banco de dados SQLiteCloud
const dbCloud = new Database(config.dbPath);

// Configurações
const config = {
  port: process.env.PORT || 4000,
  dbPath: process.env.DB_PATH || 'database/database.db',
  timeout: process.env.query_TIMEOUT || 3 * 60 * 1000, // 3 minutos
  nodeEnv: process.env.NODE_ENV || 'development'
};

// Status HTTP
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  TIMEOUT: 408,
  INTERNAL_SERVER_ERROR: 500
};

const corsOptions = {
  origin: 'http://localhost:10000', // Substitua pelo seu domínio
  optionsSuccessStatus: 200 // Para navegadores antigos
};

// Classe para gerenciar conexão com banco de dados
class DatabaseManager {
  constructor (dbPath) {
    this.db = null;
    this.dbPath = dbPath;
  }

  connect() {
    return new Promise((resolve, reject) => {
      dbCloud.connect((err) => {
        if (err) {
          if (err) {
            reject(err);
            return;
          }
        } else {
          console.log('Conectado ao banco de dados SQLiteCloud');
          resolve();
        }
      });
    });
  }

  async query(sql, params = [], timeout = config.timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('DATABASE_TIMEOUT'));
      }, timeout);

      this.db.all(sql, params, (err, rows) => {
        clearTimeout(timeoutId);
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
