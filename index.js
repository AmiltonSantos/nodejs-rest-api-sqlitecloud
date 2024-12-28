require('dotenv').config();
const express = require('express');
const app = express();
const morgan = require('morgan'); // Para logging
const helmet = require('helmet'); // Para segurança
const compression = require('compression'); // Para compressão de respostas
const path = require('path');
const cors = require('cors');
const { Database } = require('@sqlitecloud/drivers');

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

class DatabaseManager {
  constructor (dbPath) {
    this.db = null;
    this.dbPath = dbPath;
  }

  async connect() {
    try {
      // Conectar antes de executar a consulta
      this.db = new Database(config.dbPath);

      // Esse é o nome do banco de dados do projeto que foi criado no "https://sqlitecloud.io/"
      await this.db.sql`USE DATABASE database.db;`;
    } catch (error) {
      console.error(error);
      return null;
    }
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
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('dev')); // Logging
app.use(helmet()); // Segurança
app.use(compression()); // Compressão
app.use(cors(corsOptions));

// Middleware para verificar conexão com banco
const checkDatabaseConnection = async (req, res, next) => {
  if (!this.db) {
    try {
      await await dbManager.connect();
      next();
    } catch (error) {
      next(new Error('Falha na conexão com o banco de dados'));
    }
  } else {
    next();
  }
};

// Rota da pagina home onde vai abri a pagina inicial do app
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/** Traz resultados de uma tabela especificada com limit de 10 linhas, passando o nome da tabela por parâmetro
  * Exemplo 1: http://localhost:10000/api/read/users  
  * O "users" e o nome da tabela passada por paramentro
*/
app.get('/api/read/:table', checkDatabaseConnection, async (req, res, next) => {
  const { table } = req?.params; // Obtém o nome da tabela da URL

  const sql = `SELECT * FROM ${table} LIMIT 10;`;

  try {
    const resultado = await dbManager.query(sql);
    res.status(HTTP_STATUS.OK).json({
      status: 'success',
      data: resultado
    });
  } catch (error) {
    if (error?.message?.includes('no such table')) {
      next(new Error(error.message.replace('no such table:', 'Não existe a tabela:')));
    } else {
      next(new Error(error.message));
    }
  }
});

/** Pesquisando em uma tabela especifica passada por parâmetro e um ID
    * Exemplo 1: http://localhost:10000/api/read/users/25  
    * O "users" e o "25" é a tabela e o numero da linha passada por paramentro
*/
app.get('/api/read/:table/:id', checkDatabaseConnection, async (req, res, next) => {
  const { table, id } = req?.params;

  if (!table && !id) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 'message': 'Bad request. Missing ID parameter' });
  }

  const sql = `SELECT * FROM ${table} WHERE id = ${id}`;

  try {
    const row = await dbManager.query(sql);
    if (row.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ "message": "User not found" });
    }
    res.status(HTTP_STATUS.OK).json(row[0]); // Retorna o primeiro usuário encontrado
  } catch (error) {
    if (error?.message?.includes('no such table')) {
      next(new Error(error.message.replace('no such table:', 'Não existe a tabela:')));
    } else {
      next(new Error(error.message));
    }
  }
});

/** Pesquisando passando uma tabela especifica, e com parâmetros de "page" e "limit"
    * Exemplo 1: http://localhost:8000/api/pagination/users?page=1&limit=10 
    * O "users", o "page=1" e o "limit=10" e os paramentro padrao para fazer a paginação
*/
app.get('/api/pagination/:table', checkDatabaseConnection, async (req, res, next) => {
  const { table } = req?.params;
  const { page, limit } = req?.query;

  // Verifica se os parâmetros de página e limite estão presentes
  if (!page || !limit) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 'message': 'Bad request. Missing page or limit parameter' });
  }

  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const offset = (pageNumber - 1) * limitNumber;

  const sql = `SELECT * FROM ${table} LIMIT ${limitNumber} OFFSET ${offset}`;

  try {
    const rows = await dbManager.query(sql);
    if (rows.length > 0) {
      res.setHeader('Content-Type', 'application/json');
      res.status(HTTP_STATUS.OK).json(rows);
    } else {
      res.status(HTTP_STATUS.OK).json({
        "message": `A tabela '${table}' está vazia.`
      });
    }
  } catch (error) {
    if (error?.message?.includes('no such table')) {
      next(new Error(error.message.replace('no such table:', 'Não existe a tabela:')));
    } else {
      next(new Error(error.message));
    }
  }
});

// Rota padrão para endpoints não encontrados
app.use('*', (req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    status: 'error',
    message: 'Endpoint não encontrado'
  });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM. Encerrando...');
  dbManager.close();
  process.exit(0);
});

// Tratamento do Sinal de Interrupção (SIGINT) para Encerramento Limpo
process.on('SIGINT', () => {
  console.log('Recebido SIGINT. Encerrando...');
  dbManager.close();
  process.exit(0);
});

// Iniciando servidor
app.listen(config.port, () => {
  console.log(`Servidor rodando na porta ${config.port}`);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('Erro não capturado:', error);
  dbManager.close();
  process.exit(1);
});

// Tratamento de Rejeições Não Tratadas em Promessas
process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejeição não tratada:', reason);
  dbManager.close();
  process.exit(1);
});
