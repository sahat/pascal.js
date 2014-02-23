var PascalError = function(token, message) {
  this.token = token;
  this.message = message;
  this.stack = new Error().stack;

  this.getMessage = function () {
    var message = 'Error: ' + this.message;

    if (this.token) {
      message += " (\"" + this.token.tokenValue + "\", line " + this.token.line + ")";
    }
    return message;
  };
};

module.exports = PascalError;