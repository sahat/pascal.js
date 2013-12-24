define(function () {
  var Token = function (value, type) {
      this.tokenValue = value;
      this.tokenType = type;
      this.lineNumber = -1;
  };

  Token.IDENTIFIER = 0;
  Token.NUMBER = 1;
  Token.SYMBOL = 2;
  Token.COMMENT = 3;
  Token.STRING = 4;
  Token.EOF = 5;
  Token.RESERVED = 6;

  Token.prototype.isEqualTo = function(second) {
      return this.tokenType === second.tokenType &&
        this.tokenValue === second.tokenValue;
  };

  Token.prototype.isSymbol = function(symbol) {
      return this.tokenType === Token.SYMBOL && this.tokenValue === symbol;
  };

  Token.prototype.isReservedWord = function(reservedWord) {
    return this.tokenType === Token.RESERVED &&
      this.tokenValue.toLowerCase() === reservedWord.toLowerCase();
  };

  return Token;
});
