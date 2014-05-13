var utils = {
  isWhitespace: function(char) {
    return char == ' ' || char == '\t' || char == '\n' || char == '\r';
  },
  isAlphanumeric: function(char) {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  },
  isDigit: function(char) {
    return char >= '0' && char <= '9';
  },
  isValidIdentifierStart: function(char) {
    return this.isAlphanumeric(char) || char == '_';
  },
  isValidIdentifierPart: function(char) {
    return this.isDigit(char) || this.isValidIdentifierStart(char);
  }
};

module.exports = utils;


