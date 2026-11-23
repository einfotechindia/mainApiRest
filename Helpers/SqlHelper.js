"use strict";
const con = require("../mysql");
const {
    returnResponse,
  } = require("../Helpers/ResponseMapper");

const serializeQueryResult = (res) => JSON.parse(JSON.stringify(res));

const toWhereClause = (obj = {}) => {
  const clauses = Object.keys(obj).map((key) => `${key} = ${con.escape(obj[key])}`);
  return clauses.length ? clauses.join(" AND ") : "1=1";
};



const dbService = {
  find: async (table, filter = {}, projection = "*") => {
    try {
      const where = toWhereClause(filter);
      const query = `SELECT ${projection} FROM ${table} WHERE ${filter}`;

     // _d(query , "query")
      const result = await con.query(query);
      return returnResponse("success", "fetched", serializeQueryResult(result));
    } catch (err) {
      console.error(`find error: ${err.message}`);
    }
  },

  findBatch: async (table, where , BATCH_SIZE , offset) => {
    try {
      
      const query = `SELECT * FROM ${table} WHERE ${where} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
      console.log(query)
      const result = await con.query(query);
      return returnResponse("success", "fetched", serializeQueryResult(result));
    } catch (err) {
      console.error(`find error: ${err.message}`);
    }
  },

  findOne: async (table, filter = {}, projection = "*") => {
    try {
      const where = toWhereClause(filter);
      const query = `SELECT ${projection} FROM ${table} WHERE ${where} LIMIT 1`;
      const result = await con.query(query);
      return returnResponse("success", "fetched", serializeQueryResult(result)[0]);
    } catch (err) {
      console.error(`findOne error: ${err.message}`);
    }
  },

  insertOne: async (table, data = {}) => {
    try {
      const query = `INSERT INTO ${table} SET ?`;
      const result = await con.query(query, data);
      return returnResponse("success", "inserted", result);
    } catch (err) {
      console.error(`insertOne error: ${err.message}`);
    }
  },

  insertMany: async (table, dataArray = []) => {
    try {
      if (!Array.isArray(dataArray) || !dataArray.length) throw new Error("Data must be a non-empty array");
      const keys = Object.keys(dataArray[0]);
      const values = dataArray.map(obj => keys.map(k => obj[k]));
      const placeholders = dataArray.map(() => `(${keys.map(() => '?').join(',')})`).join(',');
      const query = `INSERT INTO ${table} (${keys.join(',')}) VALUES ${placeholders}`;
      const result = await con.query(query, values.flat());
      return returnResponse("success", "inserted", result);
    } catch (err) {
      console.error(`insertMany error: ${err.message}`);
    }
  },

  updateOne: async (table, filter = {}, updates = {}) => {
    try {
      const where = toWhereClause(filter);
      const query = `UPDATE ${table} SET ? WHERE ${where} LIMIT 1`;
      const result = await con.query(query, updates);
      return returnResponse("success", "updated", result);
    } catch (err) {
      console.error(`updateOne error: ${err.message}`);
    }
  },

  deleteOne: async (table, filter = {}) => {
    try {
      const where = toWhereClause(filter);
      const query = `DELETE FROM ${table} WHERE ${where} LIMIT 1`;
      const result = await con.query(query);
      return returnResponse("success", "deleted", result);
    } catch (err) {
      console.error(`deleteOne error: ${err.message}`);
    }
  },
};

module.exports = dbService;
