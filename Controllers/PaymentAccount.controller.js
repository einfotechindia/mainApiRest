const paymentAccountService = require("../Services/PaymentAccount.service");

const createAccount = async (req, res) => {
  return paymentAccountService.createAccount(req, res);
};

const updateAccount = async (req, res) => {
  return paymentAccountService.updateAccount(req, res);
};

const getAccountList = async (req, res) => {
  return paymentAccountService.getAccountList(req, res);
};

const getAccountById = async (req, res) => {
  return paymentAccountService.getAccountById(req, res);
};

const toggleStatus = async (req, res) => {
  return paymentAccountService.toggleStatus(req, res);
};

const deleteAccount = async (req, res) => {
  return paymentAccountService.deleteAccount(req, res);
};

const getAccountsByAmount = async (req, res) => {
  return paymentAccountService.getAccountsByAmount(req, res);
};

module.exports = {
  createAccount,
  updateAccount,
  getAccountList,
  getAccountById,
  toggleStatus,
  deleteAccount,
  getAccountsByAmount,
};
