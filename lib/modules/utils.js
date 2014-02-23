var RESERVED = require('./constants').RESERVED;

var utils = {
  isReserved: function (value) {
    return RESERVED.indexOf(value.toLowerCase()) !== -1;
  },
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
  },
  leftAlign: function(value, width) {
    value = "" + value;
    while (value.length < width) {
      value = value + " ";
    }
    return value;
  },
  rightAlign: function(value, width) {
    value = "" + value;
    while (value.length < width) {
      value = " " + value;
    }
    return value;
  },
  truncate: function(value) {
    if (value < 0) {
      return Math.ceil(value);
    } else {
      return Math.floor(value);
    }
  }
};

module.exports = utils;


