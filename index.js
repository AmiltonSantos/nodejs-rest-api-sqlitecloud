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

// Middleware para tratamento de erros
const errorHandler = (err, req, res, next) => {
  console.error('Erro:', err);

  const errorResponse = {
    status: 'error',
    message: 'Erro interno do servidor'
  };

  if (config.nodeEnv === 'development') {
    errorResponse.detail = err.message;
    errorResponse.stack = err.stack;
  }

  if (err.message === 'DATABASE_TIMEOUT') {
    return res.status(HTTP_STATUS.TIMEOUT).json({
      status: 'error',
      message: 'A consulta excedeu o tempo limite de 3 minutos'
    });
  }

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
};

// Inicialização do banco de dados
const dbManager = new DatabaseManager(config.dbPath);

// Middleware
app.use(express.json());
app.use(morgan('dev')); // Logging
app.use(helmet()); // Segurança
app.use(compression()); // Compressão
app.use(cors(corsOptions));

// Middleware para verificar conexão com banco
const checkDatabaseConnection = async (req, res, next) => {
  if (!dbManager.db) {
    try {
      await dbManager.connect();
      next();
    } catch (error) {
      next(new Error('Falha na conexão com o banco de dados'));
    }
  } else {
    next();
  }
};