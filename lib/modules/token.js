var Token = function(value, type) {
  this.tokenValue = value;
  this.tokenType = type;

  this.isSymbol = function(symbol) {
    return this.tokenType === Token.TK_SYMBOL && this.tokenValue === symbol;
  };

  this.isReserved = function(reservedWord) {
    return this.tokenType === Token.TK_RESERVED &&
      this.tokenValue.toLowerCase() === reservedWord.toLowerCase();
  };
};

Token.TK_IDENTIFIER = 0;
Token.TK_NUMBER = 1;
Token.TK_SYMBOL = 2;
Token.TK_COMMENT = 3;
Token.TK_STRING = 4;
Token.TK_EOF = 5;
Token.TK_RESERVED = 6;

module.exports = Token;