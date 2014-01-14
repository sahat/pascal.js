var Token = require('./token');
var utils = require('./utils');
var SYMBOLS = require('./constants').SYMBOLS;

/**
 * Scanner
 * @param stream
 * @returns {Token} Token
 */

var Scanner = function(stream) {
  this.stream = stream;
  this.nextToken = null;

  this.next = function() {
    var token = this.lookAhead();
    this.nextToken = null;
    return token;
  };

  this.lookAhead = function () {
    if (!this.nextToken) this.nextToken = this.scanOneToken();
    return this.nextToken;
  };

  this.scanOneToken = function () {
    var lineNumber;
    var ch = this.stream.next();

    while (utils.isWhitespace(ch)) {
      lineNumber = this.stream.line;
      ch = this.stream.next();
      if (ch === -1) {
        return new Token(null, Token.TK_EOF);
      }
    }

    var token = this.maximalMunch(ch, SYMBOLS);

    if (token !== null && token.isSymbol("(*")) {
      var value = "";
      while (true) {
        ch = this.stream.next();
        if (ch === -1) {
          break;
        } else if (ch === "*" && this.stream.lookAhead() === ")") {
          this.stream.next();
          break;
        }
        value += ch;
      }
      token = new Token(value, Token.TK_COMMENT);
    }

    if (token === null && utils.isValidIdentifierStart(ch)) {
      var value = "";
      while (true) {
        value += ch;
        ch = this.stream.lookAhead();
        if (ch === -1 || !utils.isValidIdentifierPart(ch)) {
          break;
        }
        this.stream.next();
      }
      var tokenType = utils.isReserved(value) ? Token.TK_RESERVED : Token.TK_IDENTIFIER;
      token = new Token(value, tokenType);
    }

    if (token === null && (utils.isDigit(ch) || ch === ".")) {
      if (ch === ".") {
        var nextCh = this.stream.lookAhead();
        if (nextCh === ".") {
          this.stream.next();
          token = new Token("..", Token.TK_SYMBOL);
        } else if (!utils.isDigit(nextCh)) {
          token = new Token(".", Token.TK_SYMBOL);
        } else {
        }
      }
      if (token === null) {
        var value = "";
        var sawDecimalPoint = ch === ".";
        while (true) {
          value += ch;
          ch = this.stream.lookAhead();
          if (ch === -1) {
            break;
          }
          if (ch === ".") {
            this.stream.next();
            var nextCh = this.stream.lookAhead();
            this.stream.previous(ch);
            if (nextCh === ".") {
              break;
            }
            if (sawDecimalPoint) {
              break;
            } else {
              sawDecimalPoint = true;
            }
          } else if (!utils.isDigit(ch)) {
            break;
          }
          this.stream.next();
        }
        token = new Token(value, Token.TK_NUMBER);
      }
    }
    if (token === null && ch === "{") {
      ch = this.stream.next();
      var value = "";
      while (true) {
        value += ch;
        ch = this.stream.next();
        if (ch === -1 || ch === "}") {
          break;
        }
      }
      token = new Token(value, Token.TK_COMMENT);
    }
    if (token === null && ch === "'") {
      ch = this.stream.next();
      var value = "";
      while (true) {
        value += ch;
        ch = this.stream.next();
        if (ch === "'") {
          if (this.stream.lookAhead() === "'") {
            this.stream.next();
          } else {
            break;
          }
        } else if (ch === -1) {
          break;
        }
      }
      token = new Token(value, Token.TK_STRING);
    }
    if (token === null) {
      token = new Token(ch, Token.TK_SYMBOL);
      token.line = lineNumber;
      throw new PascalError(token, "unknown symbol");
    }
    token.line = lineNumber;
    return token;
  };

  this.maximalMunch = function (ch, symbols) {
    var longestSymbol = null;
    var nextCh = this.stream.lookAhead();
    var twoCh = nextCh === -1 ? ch : ch + nextCh;

    for (var i = 0; i < symbols.length; i++) {
      var symbol = symbols[i];

      if ((symbol.length === 1 && ch === symbol) ||
        (symbol.length === 2 && twoCh === symbol)) {

        if (longestSymbol === null || symbol.length > longestSymbol.length) {
          longestSymbol = symbol;
        }
      }
    }

    if (!longestSymbol) {
      return null;
    }

    if (longestSymbol.length === 2) {
      this.stream.next();
    }

    return new Token(longestSymbol, Token.TK_SYMBOL);
  };
};

module.exports = Scanner;
