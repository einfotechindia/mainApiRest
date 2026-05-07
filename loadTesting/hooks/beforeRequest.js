// beforeRequest.js

module.exports = function (userContext, events, done) {
  // Access captured variables from the response
  const errorField = userContext.vars["$.error"];
  const successField = userContext.vars["$.success"];

  // Custom logic based on error or success
  if (errorField) {
    console.error("Error received:", errorField);
    // You can choose to mark the virtual user as a failure
    userContext.vars.errorOccurred = true;
  } else if (successField) {
    console.log("Success message:", successField);
    // You can perform additional actions for successful responses
  }

  // Call done to signal that the request is ready to be made
  done();
};
