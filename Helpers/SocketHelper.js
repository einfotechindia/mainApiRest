const emitData = (key) => {
  try {
    const data = getRedisKeyData(key)
      .then(async (response) => {
        if (response) {
          global.io.emit(key, response);
        } else {
          console.log("error");
        }
      })
      .catch((error) => {
        console.log("Emit data Error");
      });
  } catch (error) {
    console.log(error);
  }
};

module.exports = { emitData };
