require("dotenv").config();
const { ERROR, SUCCESS } = process.env;

module.exports = {
  SUCCESS: {
    status: process.env.ERROR,
    message: "Direct Access Not Allowed",
    data: {},
  },
};
